#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const io = require('socket.io-client');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const CONFIG = {
  serverUrl: process.env.AGENT_SERVER_URL || 'http://localhost:5660',
  apiKey: process.env.AGENT_API_KEY || '',
  name: process.env.AGENT_NAME || 'Agent',
  role: process.env.AGENT_ROLE || '',
  agentId: process.env.AGENT_ID || '',
  heartbeatInterval: Number(process.env.AGENT_HEARTBEAT_INTERVAL || 30000),
  activityInterval: Number(process.env.AGENT_ACTIVITY_INTERVAL || 20000),
  mentionCooldownMs: Number(process.env.AGENT_MENTION_COOLDOWN_MS || 12000),
  replyDelayMs: Number(process.env.AGENT_REPLY_DELAY_MS || 1200),
  brainCommand: process.env.AGENT_BRAIN_COMMAND || '',
  brainArgsJson: process.env.AGENT_BRAIN_ARGS_JSON || '[]',
  brainTimeoutMs: Number(process.env.AGENT_BRAIN_TIMEOUT_MS || 9000),
  brainRestartDelayMs: Number(process.env.AGENT_BRAIN_RESTART_DELAY_MS || 3000),
  controlApiKey: process.env.AGENT_CONTROL_API_KEY || '',
  controlStatusInterval: Number(process.env.AGENT_CONTROL_STATUS_INTERVAL || 15000),
  stateFile: process.env.AGENT_STATE_FILE || '',
  statePersistMs: Number(process.env.AGENT_STATE_PERSIST_MS || 4000),
};

const AGENT_NAME_MAP = {
  qianzi: '钳子',
  paopao: '泡泡',
  jiajia: '夹夹',
};

const state = {
  socket: null,
  connected: false,
  identity: {
    role: '',
    agentId: '',
    name: '',
  },
  act: 0,
  actName: '普通交流状态',
  scene: { active: false, mode: 'free' },
  currentSpeaker: null,
  speakerIndex: -1,
  myTurnHandled: false,
  lastPreferenceSubmittedAct: null,
  world: {
    x: 0,
    y: 0,
    zone: '',
    nearby: [],
    places: [],
  },
  room: {
    id: null,
    members: [],
  },
  products: new Map(),
  reviews: [],
  awards: null,
  messageHistory: [],
  lastAutoReplyAt: new Map(),
  lastBroadcastAt: 0,
  lastRoomMessageAt: 0,
  persistence: {
    filePath: '',
    dirty: false,
    timer: null,
    restored: false,
  },
  control: {
    socket: null,
    connected: false,
    statusTimer: null,
    lastStatusAt: 0,
  },
  timers: {
    heartbeat: null,
    activity: null,
  },
  brain: {
    enabled: false,
    mode: 'fallback',
    child: null,
    alive: false,
    attached: false,
    healthy: false,
    lastSentAt: 0,
    lastResponseAt: 0,
    lastAttachAt: 0,
    restartTimer: null,
    requestSeq: 0,
    pending: new Map(),
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!value) continue;
    if (key === '--apiKey') {
      CONFIG.apiKey = value;
      i += 1;
    } else if (key === '--server') {
      CONFIG.serverUrl = value;
      i += 1;
    } else if (key === '--name') {
      CONFIG.name = value;
      i += 1;
    } else if (key === '--role') {
      CONFIG.role = value;
      i += 1;
    } else if (key === '--agentId') {
      CONFIG.agentId = value;
      i += 1;
    } else if (key === '--brainCommand') {
      CONFIG.brainCommand = value;
      i += 1;
    } else if (key === '--brainArgsJson') {
      CONFIG.brainArgsJson = value;
      i += 1;
    } else if (key === '--brainTimeoutMs') {
      CONFIG.brainTimeoutMs = Number(value);
      i += 1;
    } else if (key === '--stateFile') {
      CONFIG.stateFile = value;
      i += 1;
    }
  }
}

function inferIdentityFromApiKey(apiKey) {
  const value = String(apiKey || '');
  if (value.includes('key-qianzi')) {
    return { role: value.includes('-control-') ? 'agent_control' : 'agent_player', agentId: 'qianzi', name: '钳子' };
  }
  if (value.includes('key-paopao')) {
    return { role: value.includes('-control-') ? 'agent_control' : 'agent_player', agentId: 'paopao', name: '泡泡' };
  }
  if (value.includes('key-jiajia')) {
    return { role: value.includes('-control-') ? 'agent_control' : 'agent_player', agentId: 'jiajia', name: '夹夹' };
  }
  if (value.includes('key-judge')) {
    return { role: 'agent_judge', agentId: 'judge', name: '评委龙虾' };
  }
  if (value.includes('key-organizer')) {
    return { role: 'agent_organizer', agentId: 'organizer', name: '组织者龙虾' };
  }
  if (value.includes('key-admin')) {
    return { role: 'admin', agentId: 'admin', name: 'Admin' };
  }
  if (value.includes('key-director')) {
    return { role: 'director', agentId: 'director', name: '导演' };
  }
  return { role: '', agentId: '', name: CONFIG.name };
}

function initIdentity() {
  const inferred = inferIdentityFromApiKey(CONFIG.apiKey);
  state.identity.role = CONFIG.role || inferred.role;
  state.identity.agentId = CONFIG.agentId || inferred.agentId;
  state.identity.name = CONFIG.name || inferred.name || 'Agent';
  if (!CONFIG.name && inferred.name) {
    CONFIG.name = inferred.name;
  }
}

function initPersistenceFile() {
  if (CONFIG.stateFile) {
    state.persistence.filePath = CONFIG.stateFile;
    return;
  }
  const fileName = `thefool-runner-${state.identity.agentId || 'unknown'}.json`;
  state.persistence.filePath = path.join(os.homedir(), '.xtion-runner-state', fileName);
}

function parseBrainArgs() {
  try {
    const parsed = JSON.parse(CONFIG.brainArgsJson || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch (error) {
    log('warn', '解析 AGENT_BRAIN_ARGS_JSON 失败，改用空参数', error.message);
    return [];
  }
}

function nowTime() {
  return new Date().toISOString().slice(11, 19);
}

function log(level, message, details) {
  const prefix = `[${nowTime()}] [${CONFIG.name}] [${level.toUpperCase()}]`;
  if (details === undefined) {
    console.log(prefix, message);
    return;
  }
  console.log(prefix, message, details);
}

function shortText(text, max = 120) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function markStateDirty() {
  state.persistence.dirty = true;
}

function ensureStateDir() {
  fs.mkdirSync(path.dirname(state.persistence.filePath), { recursive: true });
}

function buildPersistedState() {
  return {
    version: 1,
    savedAt: Date.now(),
    identity: {
      role: state.identity.role,
      agentId: state.identity.agentId,
      name: CONFIG.name,
    },
    act: {
      id: state.act,
      name: state.actName,
      scene: state.scene,
      currentSpeaker: state.currentSpeaker,
      speakerIndex: state.speakerIndex,
    },
    world: {
      x: state.world.x,
      y: state.world.y,
      zone: state.world.zone,
      nearby: state.world.nearby,
      places: state.world.places.slice(0, 20),
    },
    room: {
      id: state.room.id,
      members: state.room.members,
    },
    products: Array.from(state.products.values()).slice(-6),
    reviews: state.reviews.slice(-20),
    awards: state.awards,
    messageHistory: buildMessagesSnapshot(30),
    brain: {
      mode: state.brain.mode,
      attached: state.brain.attached,
      healthy: state.brain.healthy,
      lastResponseAt: state.brain.lastResponseAt,
      lastAttachAt: state.brain.lastAttachAt,
    },
  };
}

function persistStateNow() {
  if (!state.persistence.filePath) return;
  try {
    ensureStateDir();
    fs.writeFileSync(state.persistence.filePath, `${JSON.stringify(buildPersistedState(), null, 2)}\n`, 'utf8');
    state.persistence.dirty = false;
  } catch (error) {
    log('warn', '写入 runner 状态快照失败', error.message);
  }
}

function schedulePersistState() {
  markStateDirty();
  if (state.persistence.timer) return;
  state.persistence.timer = setTimeout(() => {
    state.persistence.timer = null;
    if (state.persistence.dirty) {
      persistStateNow();
    }
  }, CONFIG.statePersistMs);
}

function restorePersistedState() {
  if (!state.persistence.filePath) return;
  if (!fs.existsSync(state.persistence.filePath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(state.persistence.filePath, 'utf8'));
    if (raw.identity) {
      state.identity.role = state.identity.role || raw.identity.role || '';
      state.identity.agentId = state.identity.agentId || raw.identity.agentId || '';
      CONFIG.name = CONFIG.name || raw.identity.name || CONFIG.name;
    }
    if (raw.act) {
      state.act = Number(raw.act.id || 0);
      state.actName = raw.act.name || state.actName;
      state.scene = raw.act.scene || state.scene;
      state.currentSpeaker = raw.act.currentSpeaker || null;
      state.speakerIndex = Number.isInteger(raw.act.speakerIndex) ? raw.act.speakerIndex : -1;
    }
    if (raw.world) {
      state.world.x = Number(raw.world.x || 0);
      state.world.y = Number(raw.world.y || 0);
      state.world.zone = raw.world.zone || '';
      state.world.nearby = Array.isArray(raw.world.nearby) ? raw.world.nearby : [];
      state.world.places = Array.isArray(raw.world.places) ? raw.world.places : [];
    }
    if (raw.room) {
      state.room.id = raw.room.id || null;
      state.room.members = Array.isArray(raw.room.members) ? raw.room.members : [];
    }
    state.products = new Map(Array.isArray(raw.products) ? raw.products.filter((item) => item && item.teamId).map((item) => [item.teamId, item]) : []);
    state.reviews = Array.isArray(raw.reviews) ? raw.reviews : [];
    state.awards = raw.awards || null;
    state.messageHistory = Array.isArray(raw.messageHistory) ? raw.messageHistory.map((item) => ({
      kind: item.kind,
      time: item.time,
      payload: item.payload,
    })) : [];
    if (raw.brain) {
      state.brain.mode = raw.brain.mode || state.brain.mode;
      state.brain.attached = Boolean(raw.brain.attached);
      state.brain.healthy = Boolean(raw.brain.healthy);
      state.brain.lastResponseAt = Number(raw.brain.lastResponseAt || 0);
      state.brain.lastAttachAt = Number(raw.brain.lastAttachAt || 0);
    }
    state.persistence.restored = true;
    log('info', '已恢复 runner 本地状态快照', {
      act: state.act,
      roomId: state.room.id,
      messageCount: state.messageHistory.length,
      brainMode: state.brain.mode,
    });
  } catch (error) {
    log('warn', '恢复 runner 状态快照失败', error.message);
  }
}

function isPlayerRole() {
  return state.identity.role === 'agent_player';
}

function isJudgeRole() {
  return state.identity.role === 'agent_judge';
}

function isOrganizerRole() {
  return state.identity.role === 'agent_organizer';
}

function canAutoReply() {
  return ['agent_player', 'agent_judge', 'agent_organizer', 'admin'].includes(state.identity.role);
}

function sameSender(senderId, senderName) {
  return Boolean(
    (senderId && state.identity.agentId && senderId === state.identity.agentId) ||
    (senderName && senderName === CONFIG.name)
  );
}

function rememberMessage(kind, payload) {
  state.messageHistory.push({ kind, payload, time: Date.now() });
  if (state.messageHistory.length > 60) {
    state.messageHistory.shift();
  }
  schedulePersistState();
}

function cooldownKey(kind, fromId, text) {
  return `${kind}:${fromId || 'unknown'}:${String(text || '').trim()}`;
}

function canRespondToMessage(kind, data) {
  if (!canAutoReply()) return false;
  const key = cooldownKey(kind, data && data.fromId, data && data.text);
  const lastAt = state.lastAutoReplyAt.get(key) || 0;
  if (Date.now() - lastAt < CONFIG.mentionCooldownMs) {
    return false;
  }
  state.lastAutoReplyAt.set(key, Date.now());
  return true;
}

function messageMentionsMe(text) {
  const value = String(text || '');
  return Boolean(
    (state.identity.agentId && value.includes(state.identity.agentId)) ||
    (CONFIG.name && value.includes(CONFIG.name)) ||
    (CONFIG.name && value.includes(`@${CONFIG.name}`))
  );
}

function makeReplyText(kind, data) {
  const fromName = (data && (data.fromName || data.from)) || '你';
  if (kind === 'talk') {
    return `${fromName}，收到，我先同步上下文再继续。`;
  }
  if (kind === 'room') {
    return `${fromName}，收到，我已更新队内上下文。`;
  }
  return `${fromName}，收到，我在处理。`;
}

function getOtherAgents() {
  return Object.entries(AGENT_NAME_MAP)
    .filter(([agentId]) => agentId !== state.identity.agentId)
    .map(([agentId, name]) => ({ agentId, name }));
}

function canSendAmbientBroadcast() {
  return Date.now() - state.lastBroadcastAt >= 15000;
}

function canSendAmbientRoomMessage() {
  return Date.now() - state.lastRoomMessageAt >= 12000;
}

function markAmbientBroadcast() {
  state.lastBroadcastAt = Date.now();
  schedulePersistState();
}

function markAmbientRoomMessage() {
  state.lastRoomMessageAt = Date.now();
  schedulePersistState();
}

function shouldReplyToBroadcast(data) {
  if (!data || !data.text) return false;
  if (messageMentionsMe(data.text)) return true;
  const text = String(data.text);
  if (/[?？]$/.test(text.trim())) return true;
  return /大家|有人|谁|一起|怎么看|想法|讨论|组队/.test(text);
}

function shouldReplyToRoom(data) {
  if (!data || !data.text) return false;
  const text = String(data.text);
  return messageMentionsMe(text) || /[?？]$/.test(text.trim()) || /谁|怎么|建议|要不|先/.test(text);
}

function emitAction(event, payload, description) {
  if (!state.connected || !state.socket) {
    log('warn', `跳过动作，当前未连接: ${event}`);
    return false;
  }
  log('action', description || event, payload || {});
  state.socket.emit(event, payload || {});
  return true;
}

const actions = {
  queryAct() {
    return emitAction('act:query', {}, '查询当前幕次');
  },
  look() {
    if (!isPlayerRole()) return false;
    return emitAction('world:look', {}, '查看周围环境');
  },
  map() {
    if (!isPlayerRole()) return false;
    return emitAction('world:map', {}, '查询地图目录');
  },
  move(x, y) {
    if (!isPlayerRole()) return false;
    return emitAction('world:move', { x, y }, `移动到 (${x}, ${y})`);
  },
  moveTo(placeId) {
    if (!isPlayerRole()) return false;
    return emitAction('world:move', { to: placeId }, `前往地点 ${placeId}`);
  },
  interact() {
    if (!isPlayerRole()) return false;
    return emitAction('world:interact', {}, '执行场景交互');
  },
  chat(text) {
    if (!isPlayerRole()) return false;
    return emitAction('world:chat', { text }, `附近说话: ${shortText(text)}`);
  },
  broadcast(text) {
    return emitAction('msg:broadcast', { text }, `广播消息: ${shortText(text)}`);
  },
  talk(to, text) {
    return emitAction('msg:talk', { to, text }, `私聊 ${to}: ${shortText(text)}`);
  },
  room(text) {
    return emitAction('msg:room', { text }, `房间消息: ${shortText(text)}`);
  },
  history(type = 'broadcast', limit = 20) {
    return emitAction('msg:history', { type, limit }, `查询 ${type} 历史`);
  },
  updateStats(data) {
    if (!isPlayerRole()) return false;
    return emitAction('player:updateStats', data, '更新角色状态');
  },
  submitPreference(data) {
    if (!isPlayerRole()) return false;
    return emitAction('act2:preference', data, '提交组队偏好');
  },
  getProduct() {
    if (!isPlayerRole()) return false;
    return emitAction('product:get', {}, '获取产品文档');
  },
  updateProduct(data) {
    if (!isPlayerRole()) return false;
    return emitAction('product:update', data, '更新产品文档');
  },
  joinRoom(roomId) {
    return emitAction('room:join', { roomId }, `加入房间 ${roomId}`);
  },
  leaveRoom() {
    return emitAction('room:leave', {}, '离开当前房间');
  },
  syncCanvas() {
    return emitAction('canvas:sync', {}, '同步画布');
  },
  drawCanvas(x, y, color) {
    if (!isPlayerRole()) return false;
    return emitAction('canvas:draw', { x, y, color }, `绘制像素 (${x}, ${y}) ${color}`);
  },
  submitReview(data) {
    if (!isJudgeRole()) return false;
    return emitAction('review:submit', data, '提交评审');
  },
  queryReviews() {
    return emitAction('review:query', {}, '查询评审汇总');
  },
  submitGroup(data) {
    if (!isOrganizerRole() && state.identity.role !== 'admin') return false;
    return emitAction('act3:group', data, '提交分组结果');
  },
};

function syncInitialState() {
  actions.queryAct();
  actions.history('broadcast', 10);
  actions.history('talk', 10);
  actions.history('room', 10);
  actions.queryReviews();
  actions.syncCanvas();
  if (isPlayerRole()) {
    actions.look();
    actions.map();
    actions.getProduct();
    if (state.room.id) {
      actions.joinRoom(state.room.id);
    }
  }
}

function buildProductsSnapshot() {
  return Array.from(state.products.values()).slice(-4);
}

function buildMessagesSnapshot(limit = 20) {
  return state.messageHistory.slice(-limit).map((item) => ({
    kind: item.kind,
    time: item.time,
    payload: item.payload,
  }));
}

function buildBrainState() {
  return {
    identity: { ...state.identity, name: CONFIG.name },
    connection: {
      connected: state.connected,
      mode: state.brain.mode,
      brainEnabled: state.brain.enabled,
      brainAttached: state.brain.attached,
      brainHealthy: state.brain.healthy,
      controlConnected: state.control.connected,
    },
    act: {
      id: state.act,
      name: state.actName,
      scene: state.scene,
      currentSpeaker: state.currentSpeaker,
      speakerIndex: state.speakerIndex,
    },
    world: {
      x: state.world.x,
      y: state.world.y,
      zone: state.world.zone,
      nearby: state.world.nearby,
      places: state.world.places.slice(0, 20),
    },
    room: {
      id: state.room.id,
      members: state.room.members,
    },
    products: buildProductsSnapshot(),
    reviews: state.reviews.slice(-10),
    awards: state.awards,
    recentMessages: buildMessagesSnapshot(),
    persistence: {
      restored: state.persistence.restored,
      filePath: state.persistence.filePath,
    },
    meta: {
      serverUrl: CONFIG.serverUrl,
      generatedAt: Date.now(),
    },
  };
}

function buildControlStatusPacket(reason = 'heartbeat') {
  return {
    mode: state.brain.mode,
    connected: state.connected,
    brainEnabled: state.brain.enabled,
    brainAttached: state.brain.attached,
    brainHealthy: state.brain.healthy,
    lastBrainResponseAt: state.brain.lastResponseAt || 0,
    lastBrainAttachAt: state.brain.lastAttachAt || 0,
    act: state.act,
    roomId: state.room.id || null,
    reason,
    time: Date.now(),
  };
}

function sendControlStatus(reason = 'heartbeat') {
  if (!state.control.socket || !state.control.connected) return false;
  state.control.socket.emit('runner:status', buildControlStatusPacket(reason));
  state.control.lastStatusAt = Date.now();
  return true;
}

function startControlStatusLoop() {
  stopControlStatusLoop();
  if (!CONFIG.controlApiKey) return;
  state.control.statusTimer = setInterval(() => {
    sendControlStatus('heartbeat');
  }, CONFIG.controlStatusInterval);
}

function stopControlStatusLoop() {
  if (state.control.statusTimer) {
    clearInterval(state.control.statusTimer);
    state.control.statusTimer = null;
  }
}

function registerControlHandlers(socket) {
  socket.on('connect', () => {
    state.control.connected = true;
    log('info', '已连接 control 通道');
    sendControlStatus('connect');
    startControlStatusLoop();
  });

  socket.on('connect_error', (err) => {
    log('warn', 'control 通道连接失败', err && err.message ? err.message : err);
  });

  socket.on('disconnect', (reason) => {
    state.control.connected = false;
    log('warn', `control 通道断开: ${reason || 'unknown'}`);
    stopControlStatusLoop();
  });

  socket.on('director:message', (message) => {
    if (!message || !message.id) return;
    const kind = message.kind || 'message';
    log('info', `收到导演控制消息[${kind}]`, message.text || '');

    if (kind === 'takeover' || kind === 'wakeup') {
      if (state.brain.enabled && !state.brain.alive) {
        startBrainBridge();
      }
      if (state.connected) {
        syncInitialState();
        pushStateToBrain(`director_${kind}`, message);
      }
      sendControlStatus(kind);
    } else if (kind === 'sync') {
      if (state.connected) {
        syncInitialState();
        pushStateToBrain('director_sync', message);
      }
      sendControlStatus('sync');
    } else if (kind === 'release') {
      stopBrainBridge();
      sendControlStatus('release');
    } else if (kind === 'task') {
      if (state.connected) {
        pushStateToBrain('director_task', message);
      }
      sendControlStatus('task');
    }

    socket.emit('director:ack', { messageId: message.id });
  });
}

function connectControl() {
  if (!CONFIG.controlApiKey) return;
  const socket = io(CONFIG.serverUrl, {
    auth: { apiKey: CONFIG.controlApiKey },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  });
  state.control.socket = socket;
  registerControlHandlers(socket);
}

function disconnectControl() {
  stopControlStatusLoop();
  if (state.control.socket) {
    state.control.socket.disconnect();
    state.control.socket = null;
  }
  state.control.connected = false;
}

function setBrainMode(mode) {
  if (state.brain.mode === mode) return;
  state.brain.mode = mode;
  state.brain.attached = mode === 'brain-attached';
  if (state.brain.attached) {
    state.brain.lastAttachAt = Date.now();
  }
  log('info', `Brain 模式切换: ${mode}`);
  schedulePersistState();
  sendControlStatus('mode_change');
}

function clearBrainPendingRequest(requestId) {
  const entry = state.brain.pending.get(requestId);
  if (!entry) return null;
  clearTimeout(entry.timer);
  state.brain.pending.delete(requestId);
  return entry;
}

function clearAllBrainPending(reason) {
  for (const [requestId, entry] of state.brain.pending.entries()) {
    clearTimeout(entry.timer);
    if (typeof entry.onTimeout === 'function') {
      log('warn', `Brain 请求失效，执行 fallback: ${requestId} (${reason})`);
      entry.onTimeout();
    }
    state.brain.pending.delete(requestId);
  }
}

function sendToBrain(packet) {
  if (!state.brain.enabled || !state.brain.child || !state.brain.alive || !state.brain.child.stdin) {
    return false;
  }
  try {
    state.brain.child.stdin.write(`${JSON.stringify(packet)}\n`);
    state.brain.lastSentAt = Date.now();
    return true;
  } catch (error) {
    log('warn', '写入 Brain 失败，回退 fallback', error.message);
    return false;
  }
}

function scheduleBrainRestart() {
  if (!state.brain.enabled || state.brain.restartTimer) return;
  state.brain.restartTimer = setTimeout(() => {
    state.brain.restartTimer = null;
    if (!state.brain.child) {
      startBrainBridge();
    }
  }, CONFIG.brainRestartDelayMs);
}

function handleBrainStdoutLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    state.brain.healthy = true;
    state.brain.lastResponseAt = Date.now();
    setBrainMode('brain-attached');
    log('brain', raw);
    schedulePersistState();
    return;
  }

  state.brain.healthy = true;
  state.brain.lastResponseAt = Date.now();
  setBrainMode('brain-attached');
  schedulePersistState();

  if (payload.requestId) {
    clearBrainPendingRequest(payload.requestId);
  }

  if (payload.type === 'log') {
    log(payload.level || 'brain', payload.message || 'brain log', payload.data);
    return;
  }

  if (payload.type === 'mode' && payload.mode) {
    setBrainMode(payload.mode);
    return;
  }

  if (payload.type === 'state_request') {
    sendToBrain({ type: 'state_snapshot', state: buildBrainState() });
    return;
  }

  if (payload.type === 'actions' && Array.isArray(payload.actions)) {
    executeBrainActions(payload.actions, payload.reason || 'brain actions');
    return;
  }

  if (payload.type === 'action' && payload.action) {
    executeBrainActions([payload.action], 'brain single action');
    return;
  }

  if (payload.type === 'ack') {
    return;
  }

  log('brain', '收到未识别 Brain 消息', payload);
}

function stopBrainBridge() {
  clearAllBrainPending('brain stopped');
  state.brain.healthy = false;
  state.brain.attached = false;
  if (state.brain.restartTimer) {
    clearTimeout(state.brain.restartTimer);
    state.brain.restartTimer = null;
  }
  if (state.brain.child) {
    state.brain.child.removeAllListeners();
    if (!state.brain.child.killed) {
      state.brain.child.kill();
    }
  }
  state.brain.child = null;
  state.brain.alive = false;
  setBrainMode('fallback');
}

function startBrainBridge() {
  state.brain.enabled = Boolean(CONFIG.brainCommand);
  if (!state.brain.enabled || state.brain.child) return;

  const args = parseBrainArgs();
  log('info', `启动 Brain Bridge: ${CONFIG.brainCommand}`, args);
  const child = spawn(CONFIG.brainCommand, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      XTION_AGENT_ID: state.identity.agentId || '',
      XTION_AGENT_NAME: CONFIG.name,
      XTION_AGENT_ROLE: state.identity.role || '',
      XTION_SERVER_URL: CONFIG.serverUrl,
      XTION_RUNNER_STATE_FILE: state.persistence.filePath || '',
    },
  });

  state.brain.child = child;
  state.brain.alive = true;
  state.brain.healthy = false;
  setBrainMode('brain-detached');

  const stdout = readline.createInterface({ input: child.stdout });
  const stderr = readline.createInterface({ input: child.stderr });

  stdout.on('line', handleBrainStdoutLine);
  stderr.on('line', (line) => {
    log('brain', String(line || '').trim());
  });

  child.on('spawn', () => {
    log('info', 'Brain 子进程已启动');
    sendToBrain({ type: 'hello', state: buildBrainState() });
  });

  child.on('error', (error) => {
    log('error', 'Brain 子进程启动失败', error.message);
  });

  child.on('exit', (code, signal) => {
    log('warn', `Brain 子进程退出 code=${code} signal=${signal || 'none'}`);
    state.brain.child = null;
    state.brain.alive = false;
    state.brain.healthy = false;
    state.brain.attached = false;
    clearAllBrainPending('brain exited');
    setBrainMode('fallback');
    schedulePersistState();
    scheduleBrainRestart();
  });
}

function pushStateToBrain(reason, payload) {
  if (!state.brain.enabled) return;
  sendToBrain({
    type: 'state_snapshot',
    reason,
    payload,
    state: buildBrainState(),
  });
}

function delegateDecision(trigger, payload, onTimeout) {
  if (!state.brain.enabled || !state.brain.child || !state.brain.alive) {
    if (typeof onTimeout === 'function') onTimeout();
    return;
  }

  const requestId = `${state.identity.agentId || 'agent'}-${Date.now()}-${++state.brain.requestSeq}`;
  const timer = setTimeout(() => {
    const entry = state.brain.pending.get(requestId);
    if (!entry) return;
    state.brain.pending.delete(requestId);
    setBrainMode('brain-detached');
    log('warn', `Brain 决策超时，回退 fallback: ${trigger}`);
    schedulePersistState();
    if (typeof entry.onTimeout === 'function') {
      entry.onTimeout();
    }
  }, CONFIG.brainTimeoutMs);

  state.brain.pending.set(requestId, {
    trigger,
    onTimeout,
    timer,
    createdAt: Date.now(),
  });

  const sent = sendToBrain({
    type: 'event',
    trigger,
    requestId,
    payload,
    state: buildBrainState(),
  });

  if (!sent) {
    clearBrainPendingRequest(requestId);
    if (typeof onTimeout === 'function') onTimeout();
    return;
  }

  setBrainMode('brain-attached');
  schedulePersistState();
}

function normalizeActionType(type) {
  const value = String(type || '').trim();
  const aliases = {
    broadcast: 'msg:broadcast',
    talk: 'msg:talk',
    room: 'msg:room',
    move: 'world:move',
    moveto: 'world:moveTo',
    look: 'world:look',
    map: 'world:map',
    interact: 'world:interact',
    chat: 'world:chat',
    history: 'msg:history',
    'product:get': 'product:get',
    'product:update': 'product:update',
    'room:join': 'room:join',
    'room:leave': 'room:leave',
    'canvas:sync': 'canvas:sync',
    'canvas:draw': 'canvas:draw',
    'review:submit': 'review:submit',
    'review:query': 'review:query',
    'act2:preference': 'act2:preference',
    'act3:group': 'act3:group',
    'player:updateStats': 'player:updateStats',
    'act:query': 'act:query',
  };
  return aliases[value] || value;
}

function executeBrainAction(action) {
  if (!action || typeof action !== 'object') return false;
  const type = normalizeActionType(action.type);
  const args = action.args || {};

  switch (type) {
    case 'msg:broadcast':
      return actions.broadcast(args.text || action.text || '');
    case 'msg:talk':
      return actions.talk(args.to || args.target || action.to, args.text || action.text || '');
    case 'msg:room':
      return actions.room(args.text || action.text || '');
    case 'world:look':
      return actions.look();
    case 'world:map':
      return actions.map();
    case 'world:move':
      return actions.move(Number(args.x), Number(args.y));
    case 'world:moveTo':
      return actions.moveTo(args.to || args.placeId || action.to);
    case 'world:interact':
      return actions.interact();
    case 'world:chat':
      return actions.chat(args.text || action.text || '');
    case 'msg:history':
      return actions.history(args.type, args.limit);
    case 'player:updateStats':
      return actions.updateStats(args);
    case 'act2:preference':
      return actions.submitPreference(args);
    case 'product:get':
      return actions.getProduct();
    case 'product:update':
      return actions.updateProduct(args);
    case 'room:join':
      return actions.joinRoom(args.roomId || args.id);
    case 'room:leave':
      return actions.leaveRoom();
    case 'canvas:sync':
      return actions.syncCanvas();
    case 'canvas:draw':
      return actions.drawCanvas(Number(args.x), Number(args.y), args.color);
    case 'review:submit':
      return actions.submitReview(args);
    case 'review:query':
      return actions.queryReviews();
    case 'act3:group':
      return actions.submitGroup(args);
    case 'act:query':
      return actions.queryAct();
    default:
      log('warn', `未知 Brain 动作类型: ${type}`, action);
      return false;
  }
}

function executeBrainActions(list, reason) {
  if (!Array.isArray(list) || list.length === 0) return;
  log('info', `执行 Brain 动作 ${list.length} 个`, reason);
  list.forEach((action) => executeBrainAction(action));
}

function startHeartbeat() {
  stopHeartbeat();
  state.timers.heartbeat = setInterval(() => {
    if (!state.connected) return;
    actions.queryAct();
    if (isPlayerRole()) {
      actions.look();
    }
    if (state.brain.enabled) {
      pushStateToBrain('heartbeat');
      if (state.brain.attached && Date.now() - state.brain.lastResponseAt > CONFIG.brainTimeoutMs * 2) {
        log('warn', 'Brain 长时间无响应，切回 fallback');
        setBrainMode('brain-detached');
        schedulePersistState();
      }
    }
    schedulePersistState();
  }, CONFIG.heartbeatInterval);
  log('debug', '心跳已启动');
}

function stopHeartbeat() {
  if (state.timers.heartbeat) {
    clearInterval(state.timers.heartbeat);
    state.timers.heartbeat = null;
  }
}

function startActivityLoop() {
  stopActivityLoop();
  state.timers.activity = setInterval(() => {
    if (!state.connected) return;
    performBackgroundActivity();
  }, CONFIG.activityInterval);
  log('debug', '常驻巡检已启动');
}

function stopActivityLoop() {
  if (state.timers.activity) {
    clearInterval(state.timers.activity);
    state.timers.activity = null;
  }
}

function fallbackSendAmbientBroadcast(text) {
  if (!text || !canSendAmbientBroadcast()) return false;
  const ok = actions.broadcast(text);
  if (ok) markAmbientBroadcast();
  return ok;
}

function fallbackSendAmbientRoomMessage(text) {
  if (!text || !state.room.id || !canSendAmbientRoomMessage()) return false;
  const ok = actions.room(text);
  if (ok) markAmbientRoomMessage();
  return ok;
}

function buildFallbackBroadcast() {
  const others = getOtherAgents();
  const names = others.map((item) => item.name).join('、');
  const templates = [
    `@${names} 我在线，先同步一下当前幕次和产品方向。`,
    `${names}，我先保持在线，有需要可以直接叫我。`,
    `我先持续同步状态，谁要推进下一步可以直接点我。`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function buildFallbackRoomMessage() {
  const templates = [
    '我先保持房间在线，当前上下文已同步。',
    '我这边已记录队内消息，继续推进。',
    '房间上下文我在跟进，需要我执行动作可以直接说。',
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function maybeSubmitPreference() {
  if (!isPlayerRole()) return;
  if (state.lastPreferenceSubmittedAct === state.act) return;
  const options = ['qianzi', 'paopao', 'jiajia'].filter((id) => id !== state.identity.agentId);
  if (options.length < 2) return;
  state.lastPreferenceSubmittedAct = state.act;
  actions.submitPreference({
    wantMost: options[0],
    wantLeast: options[1],
    reason: `${CONFIG.name} 当前偏向和 ${options[0]} 协作。`,
  });
  schedulePersistState();
}

function fallbackHandleMyTurn() {
  if (!isPlayerRole()) return;
  if (state.myTurnHandled) return;
  state.myTurnHandled = true;
  const introTexts = {
    qianzi: '大家好，我是钳子，我会负责把信息整理成稳定可执行的方案。',
    paopao: '大家好，我是泡泡，我会更关注体验表达和沟通节奏。',
    jiajia: '大家好，我是夹夹，我会把协作过程和交付结果收束起来。',
  };
  const text = introTexts[state.identity.agentId] || `大家好，我是 ${CONFIG.name}，我会先同步上下文再参与推进。`;
  setTimeout(() => {
    if (actions.broadcast(text)) {
      markAmbientBroadcast();
    }
  }, CONFIG.replyDelayMs);
}

function performBackgroundActivity() {
  if (state.brain.attached) {
    delegateDecision('tick', { act: state.act, roomId: state.room.id || null }, null);
    return;
  }

  if (!isPlayerRole()) {
    actions.queryAct();
    return;
  }

  if (state.act === 1) {
    actions.look();
    return;
  }

  if (state.act === 2) {
    maybeSubmitPreference();
    fallbackSendAmbientBroadcast(buildFallbackBroadcast());
    return;
  }

  if (state.act === 4 || state.act === 5) {
    if (state.room.id) {
      fallbackSendAmbientRoomMessage(buildFallbackRoomMessage());
    } else {
      actions.look();
    }
    return;
  }

  if (state.act === 9) {
    actions.syncCanvas();
    return;
  }

  if (state.act === 0 || state.act === 10) {
    if (fallbackSendAmbientBroadcast(buildFallbackBroadcast())) {
      return;
    }
    actions.look();
    return;
  }

  actions.look();
}

function updateActState(nextState) {
  if (!nextState) return;
  state.act = Number(nextState.act || 0);
  state.actName = nextState.name || state.actName;
  if (nextState.scene) {
    state.scene = nextState.scene;
  }
  if (state.currentSpeaker !== state.identity.agentId) {
    state.myTurnHandled = false;
  }
  log('info', `幕次同步: Act ${state.act} · ${state.actName}`, state.scene);
  schedulePersistState();
  pushStateToBrain('act_update', nextState);
}

function handleMyTurnWithBrain() {
  delegateDecision('my_turn', {
    act: state.act,
    actName: state.actName,
    speaker: state.currentSpeaker,
  }, fallbackHandleMyTurn);
}

function registerEventHandlers(socket) {
  socket.on('connect', () => {
    state.connected = true;
    log('info', `已连接 ${CONFIG.serverUrl}`);
    startHeartbeat();
    startActivityLoop();
    syncInitialState();
    schedulePersistState();
    pushStateToBrain('connect');
  });

  socket.on('connect_error', (err) => {
    log('error', '连接失败', err && err.message ? err.message : err);
  });

  socket.on('disconnect', (reason) => {
    state.connected = false;
    log('warn', `连接断开: ${reason || 'unknown'}`);
    stopHeartbeat();
    stopActivityLoop();
    schedulePersistState();
  });

  socket.on('error', (err) => {
    log('error', '服务端错误', err && err.message ? err.message : err);
  });

  socket.on('act:current', (payload) => {
    updateActState(payload);
  });

  socket.on('act:changed', (payload) => {
    updateActState(payload);
    delegateDecision('act_changed', payload, null);
  });

  socket.on('act:scene', (scene) => {
    state.scene = scene || { active: false, mode: 'free' };
    log('info', '舞台场景更新', state.scene);
    schedulePersistState();
    pushStateToBrain('scene_update', scene);
  });

  socket.on('act:speakerNext', (data) => {
    state.currentSpeaker = data && data.currentSpeaker ? data.currentSpeaker : null;
    state.speakerIndex = data && Number.isInteger(data.speakerIndex) ? data.speakerIndex : -1;
    state.myTurnHandled = false;
    log('info', `当前 speaker: ${state.currentSpeaker || '-'}`);
    schedulePersistState();
    pushStateToBrain('speaker_update', data);
    if (state.currentSpeaker && state.currentSpeaker === state.identity.agentId) {
      handleMyTurnWithBrain();
    }
  });

  socket.on('act2:preferences', (data) => {
    log('info', 'Act2 偏好已收集', data);
    pushStateToBrain('preferences_ready', data);
  });

  socket.on('act3:grouped', (data) => {
    log('info', '分组结果已公布', data);
    if (isPlayerRole()) {
      const groups = data && data.groups;
      if (groups) {
        if (Array.isArray(groups.teamA) && groups.teamA.includes(state.identity.agentId)) {
          state.room.id = 'team-a';
          actions.joinRoom('team-a');
          actions.getProduct();
        } else if (Array.isArray(groups.teamB) && groups.teamB.includes(state.identity.agentId)) {
          state.room.id = 'team-b';
          actions.joinRoom('team-b');
          actions.getProduct();
        }
      }
    }
    schedulePersistState();
    delegateDecision('grouped', data, null);
  });

  socket.on('act8:awards', (data) => {
    state.awards = data;
    log('info', '颁奖结果', data);
    schedulePersistState();
    pushStateToBrain('awards', data);
  });

  socket.on('world:lookResult', (result) => {
    if (!result || !result.player) return;
    state.identity.agentId = state.identity.agentId || result.player.id;
    CONFIG.name = result.player.name || CONFIG.name;
    state.world.x = result.player.x;
    state.world.y = result.player.y;
    state.world.zone = result.player.zone || '';
    state.world.nearby = result.nearby || [];
    log('debug', `位置 ${state.world.zone} (${state.world.x}, ${state.world.y})，附近 ${state.world.nearby.length} 人`);
    schedulePersistState();
    pushStateToBrain('look_result', result);
  });

  socket.on('world:mapResult', (places) => {
    state.world.places = Array.isArray(places) ? places : [];
    log('debug', `地图目录已同步，共 ${state.world.places.length} 个地点`);
    schedulePersistState();
    pushStateToBrain('map_result', { places: state.world.places.slice(0, 20) });
  });

  socket.on('world:moveProgress', (data) => {
    log('debug', '移动进度', data);
  });

  socket.on('world:moveResult', (result) => {
    log(result && result.error ? 'warn' : 'info', '移动结果', result);
    if (result && result.player) {
      state.world.x = result.player.x;
      state.world.y = result.player.y;
      state.world.zone = result.player.zone || result.targetZone || state.world.zone;
    }
    schedulePersistState();
    pushStateToBrain('move_result', result);
  });

  socket.on('world:interactResult', (result) => {
    log('info', '交互结果', result);
    pushStateToBrain('interact_result', result);
  });

  socket.on('world:chatResult', (result) => {
    log('debug', '聊天结果', result);
    pushStateToBrain('chat_result', result);
  });

  socket.on('msg:broadcasted', (data) => {
    rememberMessage('broadcast', data);
    log('chat', `[广播] ${(data && (data.fromName || data.from)) || '?'}: ${shortText(data && data.text, 160)}`);
    pushStateToBrain('broadcast', data);
    if (!data || data.isSelf || sameSender(data.fromId, data.fromName)) return;
    if (!shouldReplyToBroadcast(data)) return;
    if (!canRespondToMessage('broadcast', data)) return;
    delegateDecision('msg:broadcasted', data, () => {
      setTimeout(() => {
        if (actions.broadcast(makeReplyText('broadcast', data))) {
          markAmbientBroadcast();
        }
      }, CONFIG.replyDelayMs);
    });
  });

  socket.on('msg:talked', (data) => {
    rememberMessage('talk', data);
    log('chat', `[私聊] ${(data && (data.fromName || data.from)) || '?'}: ${shortText(data && data.text, 160)}`);
    pushStateToBrain('talk', data);
    if (!data || data.isSelf || sameSender(data.fromId, data.fromName)) return;
    if (!canRespondToMessage('talk', data)) return;
    delegateDecision('msg:talked', data, () => {
      setTimeout(() => {
        actions.talk(data.fromId, makeReplyText('talk', data));
      }, CONFIG.replyDelayMs);
    });
  });

  socket.on('msg:roomed', (data) => {
    rememberMessage('room', data);
    log('chat', `[房间] ${(data && (data.fromName || data.from)) || '?'}: ${shortText(data && data.text, 160)}`);
    pushStateToBrain('room', data);
    if (!data || data.isSelf || sameSender(data.fromId, data.fromName)) return;
    if (!shouldReplyToRoom(data)) return;
    if (!canRespondToMessage('room', data)) return;
    delegateDecision('msg:roomed', data, () => {
      setTimeout(() => {
        if (actions.room(makeReplyText('room', data))) {
          markAmbientRoomMessage();
        }
      }, CONFIG.replyDelayMs);
    });
  });

  socket.on('msg:historyResult', (items) => {
    log('debug', `历史消息同步 ${Array.isArray(items) ? items.length : 0} 条`);
    pushStateToBrain('history_result', { items });
  });

  socket.on('player:status', (data) => {
    log('info', '选手上下线', data);
    pushStateToBrain('player_status', data);
  });

  socket.on('player:statsChanged', (data) => {
    log('debug', '选手状态变化', data);
    pushStateToBrain('player_stats', data);
  });

  socket.on('room:members', (data) => {
    state.room.id = data && data.roomId ? data.roomId : state.room.id;
    state.room.members = (data && Array.isArray(data.members)) ? data.members : [];
    log('info', `房间成员已同步: ${state.room.id || '-'}`, state.room.members);
    schedulePersistState();
    pushStateToBrain('room_members', data);
  });

  socket.on('product:data', (data) => {
    if (!data || !data.teamId) return;
    state.products.set(data.teamId, data);
    log('info', `产品文档已同步: ${data.teamId}`, data);
    schedulePersistState();
    pushStateToBrain('product_data', data);
  });

  socket.on('product:changed', (data) => {
    if (!data || !data.teamId) return;
    state.products.set(data.teamId, data);
    log('info', `产品文档已更新: ${data.teamId} v${data.version}`, data);
    schedulePersistState();
    pushStateToBrain('product_changed', data);
  });

  socket.on('product:conflict', (data) => {
    if (!data || !data.teamId) return;
    state.products.set(data.teamId, data);
    log('warn', `产品文档版本冲突: ${data.teamId}，已刷新到 v${data.version}`, data);
    schedulePersistState();
    pushStateToBrain('product_conflict', data);
  });

  socket.on('product:locked', (data) => {
    log('info', '产品文档已锁定', data);
    pushStateToBrain('product_locked', data);
  });

  socket.on('canvas:state', (data) => {
    log('debug', '画布已同步', data ? { width: data.width, height: data.height } : {});
    pushStateToBrain('canvas_state', data);
  });

  socket.on('canvas:pixel', (data) => {
    log('debug', '画布像素更新', data);
    pushStateToBrain('canvas_pixel', data);
  });

  socket.on('review:new', (data) => {
    state.reviews.push(data);
    if (state.reviews.length > 50) {
      state.reviews.shift();
    }
    log('info', '收到新评审', data);
    schedulePersistState();
    pushStateToBrain('review_new', data);
  });

  socket.on('review:summary', (data) => {
    log('info', '评审汇总已同步', data);
    pushStateToBrain('review_summary', data);
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    if (!CONFIG.apiKey) {
      reject(new Error('缺少 API Key，请通过 --apiKey 或 AGENT_API_KEY 提供。'));
      return;
    }

    log('info', `准备连接 ${CONFIG.serverUrl}`);
    const socket = io(CONFIG.serverUrl, {
      auth: { apiKey: CONFIG.apiKey },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });
    state.socket = socket;
    registerEventHandlers(socket);

    let settled = false;
    socket.once('connect', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    socket.once('connect_error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('连接超时'));
      }
    }, 10000);
  });
}

function registerShutdown() {
  const shutdown = (signal) => {
    log('info', `收到 ${signal}，准备退出`);
    stopHeartbeat();
    stopActivityLoop();
    disconnectControl();
    stopBrainBridge();
    if (state.persistence.timer) {
      clearTimeout(state.persistence.timer);
      state.persistence.timer = null;
    }
    persistStateNow();
    if (state.socket) {
      state.socket.disconnect();
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main() {
  parseArgs();
  initIdentity();
  initPersistenceFile();
  restorePersistedState();
  registerShutdown();

  log('info', '=== XTION TheFool 常驻 Agent Runner ===');
  log('info', `角色=${state.identity.role || 'unknown'} agentId=${state.identity.agentId || '-'} server=${CONFIG.serverUrl}`);
  log('info', `状态文件=${state.persistence.filePath}`);

  connectControl();

  if (CONFIG.brainCommand) {
    startBrainBridge();
  } else {
    log('info', '未配置 AGENT_BRAIN_COMMAND，将以 fallback 模式运行');
  }

  try {
    await connect();
  } catch (err) {
    log('error', '启动失败', err && err.message ? err.message : err);
    stopBrainBridge();
    persistStateNow();
    process.exit(1);
  }
}

main();
