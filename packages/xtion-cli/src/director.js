#!/usr/bin/env node
'use strict';

const io = require('socket.io-client');

const AGENTS = (process.env.XTION_DIRECTOR_AGENTS || 'qianzi,paopao,jiajia')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const WAKEUP_THRESHOLD_MS = Number(process.env.XTION_WAKEUP_THRESHOLD_MS || 60 * 1000);
const BRAIN_RELEASE_THRESHOLD_MS = Number(process.env.XTION_BRAIN_RELEASE_THRESHOLD_MS || 4 * 60 * 1000);
const SYNC_INTERVAL_MS = Number(process.env.XTION_DIRECTOR_SYNC_INTERVAL_MS || 45 * 1000);
const DIRECTOR_API_KEY = process.env.XTION_DIRECTOR_API_KEY || 'key-director-xxx';
const SERVER_URL = process.env.XTION_SERVER || 'http://localhost:5660';
const CHECK_INTERVAL_MS = Number(process.env.XTION_DIRECTOR_CHECK_INTERVAL_MS || 5 * 1000);

const runtime = new Map();

function ensureRuntime(agentId) {
  if (!runtime.has(agentId)) {
    runtime.set(agentId, {
      online: false,
      offlineSince: null,
      lastSeenAt: 0,
      lastSyncSentAt: 0,
      wakeupQueued: false,
      releaseQueued: false,
      brainMode: 'fallback',
      brainHealthy: false,
      brainAttached: false,
      controlConnected: false,
      lastRunnerStatusAt: 0,
    });
  }
  return runtime.get(agentId);
}

function log(msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [director] ${msg}`);
}

const director = io(SERVER_URL, {
  auth: { apiKey: DIRECTOR_API_KEY },
  reconnection: true,
});

function sendDirectorMessage(agentId, kind, text) {
  director.emit('director:send', {
    agentId,
    kind,
    text,
  });
}

director.on('connect', () => {
  log('已连接平台');
  AGENTS.forEach((id) => {
    const item = ensureRuntime(id);
    item.online = false;
    item.offlineSince = null;
    item.lastSeenAt = 0;
    item.lastSyncSentAt = 0;
    item.wakeupQueued = false;
    item.releaseQueued = false;
  });
});

director.on('connect_error', (err) => {
  log(`连接失败: ${err.message}`);
});

director.on('disconnect', () => {
  log('与平台断开连接');
});

director.on('player:status', (data) => {
  const { agentId, status } = data || {};
  if (!AGENTS.includes(agentId)) return;
  const item = ensureRuntime(agentId);

  if (status === 'online') {
    item.online = true;
    item.offlineSince = null;
    item.lastSeenAt = Date.now();
    item.wakeupQueued = false;
    log(`[${agentId}] 上线`);
    sendDirectorMessage(agentId, 'takeover', '你已恢复在线。请附着 brain、同步当前 act / 消息 / 房间 / 产品状态，并继续推进当前幕次。');
  } else if (status === 'offline') {
    item.online = false;
    item.offlineSince = Date.now();
    item.controlConnected = false;
    log(`[${agentId}] 离线，开始计时 ${WAKEUP_THRESHOLD_MS / 1000}s`);
  }
});

director.on('runner:status', (data) => {
  const { agentId } = data || {};
  if (!AGENTS.includes(agentId)) return;
  const item = ensureRuntime(agentId);
  item.lastRunnerStatusAt = Date.now();
  item.lastSeenAt = Date.now();
  item.controlConnected = true;
  item.brainMode = data.mode || 'fallback';
  item.brainHealthy = Boolean(data.brainHealthy);
  item.brainAttached = Boolean(data.brainAttached);
  item.releaseQueued = false;
});

setInterval(() => {
  const now = Date.now();
  AGENTS.forEach((agentId) => {
    const item = ensureRuntime(agentId);

    if (!item.online) {
      if (!item.offlineSince) return;
      const elapsed = now - item.offlineSince;
      if (elapsed >= WAKEUP_THRESHOLD_MS && !item.wakeupQueued) {
        log(`[${agentId}] 离线超过 ${Math.round(elapsed / 1000)}s，发送 wakeup`);
        sendDirectorMessage(
          agentId,
          'wakeup',
          `你已离线超过 ${Math.round(WAKEUP_THRESHOLD_MS / 1000)} 秒。请重新连接黑客松平台、同步当前 act 和最近事件，并恢复接管。`
        );
        item.wakeupQueued = true;
      }
      return;
    }

    if (!item.lastSeenAt) {
      item.lastSeenAt = now;
    }

    if (now - item.lastSyncSentAt >= SYNC_INTERVAL_MS) {
      sendDirectorMessage(agentId, 'sync', '请同步当前 act、最近消息、房间成员、产品文档和评审状态，并保持 brain-attached。');
      item.lastSyncSentAt = now;
      log(`[${agentId}] 周期性发送 sync`);
    }

    if (!item.controlConnected || now - item.lastRunnerStatusAt >= BRAIN_RELEASE_THRESHOLD_MS) {
      if (!item.releaseQueued) {
        sendDirectorMessage(agentId, 'release', '长时间未收到 runner 控制状态，请释放失效 brain 并回退到 fallback，随后等待重新接管。');
        item.releaseQueued = true;
        log(`[${agentId}] control 状态过期，发送 release`);
      }
      return;
    }

    if (item.brainAttached && !item.brainHealthy && !item.releaseQueued) {
      sendDirectorMessage(agentId, 'release', 'brain 当前不健康，请释放失效 brain 并回退到 fallback，随后等待重新接管。');
      item.releaseQueued = true;
      log(`[${agentId}] brain 不健康，发送 release`);
    }
  });
}, CHECK_INTERVAL_MS);

director.on('director:sent', (data) => {
  if (!data || !data.message) return;
  log(`[${data.message.agentId}] 导演消息已入队 [${data.message.kind}]: ${data.message.text}`);
});

log(
  `启动，监听: ${AGENTS.join(', ')}，wakeup阈值: ${WAKEUP_THRESHOLD_MS / 1000}s，sync间隔: ${SYNC_INTERVAL_MS / 1000}s，release阈值: ${BRAIN_RELEASE_THRESHOLD_MS / 1000}s`
);
