'use strict';

const crypto = require('crypto');
const { HACKATHON_CONFIG } = require('../config/service-config');

const VALID_AGENT_IDS = ['qianzi', 'paopao', 'jiajia'];
const AGENT_NAMES = { qianzi: '钳子', paopao: '泡泡', jiajia: '夹夹' };

class MsgRouter {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('../persistence/sqlite-state-store').SQLiteStateStore} db
   */
  constructor(io, db) {
    this.io = io;
    this.db = db;
    /** @type {Map<string, number[]>} socketId → array of timestamps */
    this._rateBuckets = new Map();
    /** @type {import('./act-engine')|null} */
    this._actEngine = null;
    /** @type {import('./player-mgr')|null} */
    this._playerMgr = null;
    this._worldEngine = null;
  }

  /**
   * Set a reference to the ActEngine for Act 1 speaker restriction.
   * @param {import('./act-engine')} actEngine
   */
  setActEngine(actEngine) {
    this._actEngine = actEngine;
  }

  /**
   * Set a reference to the PlayerMgr for energy consumption.
   * @param {import('./player-mgr')} playerMgr
   */
  setPlayerMgr(playerMgr) {
    this._playerMgr = playerMgr;
  }

  setWorldEngine(worldEngine) {
    this._worldEngine = worldEngine;
  }

  /**
   * 广播消息给所有客户端
   * 每个接收者收到的消息包含 isSelf 标记
   */
  broadcast(socket, { text }) {
    if (!this._checkLength(text)) return;
    if (!this._checkRate(socket.id)) return;

    // Act 1 speaker restriction: only the current speaker (agent_player) may broadcast
    if (this._actEngine && this._actEngine.getState().act === 1
        && socket.identity && socket.identity.role === 'agent_player') {
      if (!this._actEngine.isCurrentSpeaker(socket.identity.agentId)) {
        return; // silently drop
      }
    }

    const msg = {
      id: crypto.randomUUID(),
      type: 'broadcast',
      from: socket.identity.name,
      fromName: socket.identity.name,
      fromId: socket.identity.agentId || socket.id,
      text,
      time: Date.now(),
    };

    // Persist to SQLite
    this.db.insertMessage({
      id: msg.id,
      type: msg.type,
      fromId: msg.fromId,
      fromName: msg.from,
      toId: null,
      text: msg.text,
      time: msg.time,
    });

    // Send to each connected socket with correct isSelf
    const sockets = this.io.sockets.sockets;
    for (const [, s] of sockets) {
      const isSelf = (s.identity && (s.identity.agentId || s.id)) === msg.fromId;
      s.emit('msg:broadcasted', { ...msg, isSelf });
    }

    this._syncSpeechToWorld(msg.fromId, msg.text, { scope: 'broadcast' });

    // Energy consumption: broadcast costs 1 energy for agent_player
    if (this._playerMgr && socket.identity && socket.identity.role === 'agent_player') {
      this._playerMgr.consumeEnergy(socket.identity.agentId, HACKATHON_CONFIG.ENERGY_COST_BROADCAST);
    }
  }

  /**
   * 私聊消息：仅向目标 socket 和发送者发送
   */
  talk(socket, { to, text }) {
    if (!this._checkLength(text)) return;
    if (!this._checkRate(socket.id)) return;

    const msg = {
      id: crypto.randomUUID(),
      type: 'talk',
      from: socket.identity.name,
      fromName: socket.identity.name,
      fromId: socket.identity.agentId || socket.id,
      to,
      text,
      time: Date.now(),
    };

    // Persist
    this.db.insertMessage({
      id: msg.id,
      type: msg.type,
      fromId: msg.fromId,
      fromName: msg.from,
      toId: to,
      text: msg.text,
      time: msg.time,
    });

    // Find target socket by agentId
    let targetSocket = null;
    const sockets = this.io.sockets.sockets;
    for (const [, s] of sockets) {
      if (s.identity && s.identity.agentId === to) {
        targetSocket = s;
        break;
      }
    }

    // Send to target with isSelf: false
    if (targetSocket) {
      targetSocket.emit('msg:talked', { ...msg, isSelf: false });
    }

    // Send to sender with isSelf: true
    socket.emit('msg:talked', { ...msg, isSelf: true });

    // Energy consumption: talk (interaction) costs 2 energy for agent_player
    if (this._playerMgr && socket.identity && socket.identity.role === 'agent_player') {
      this._playerMgr.consumeEnergy(socket.identity.agentId, HACKATHON_CONFIG.ENERGY_COST_INTERACT);
    }
  }

  /**
   * 房间消息：通过 io.to(roomId) 发送给房间成员
   */
  room(socket, { text }) {
    if (!this._checkLength(text)) return;
    if (!this._checkRate(socket.id)) return;

    const roomId = socket.currentRoom;
    if (!roomId) return;

    const msg = {
      id: crypto.randomUUID(),
      type: 'room',
      from: socket.identity.name,
      fromName: socket.identity.name,
      fromId: socket.identity.agentId || socket.id,
      to: roomId,
      text,
      time: Date.now(),
    };

    // Persist
    this.db.insertMessage({
      id: msg.id,
      type: msg.type,
      fromId: msg.fromId,
      fromName: msg.from,
      toId: roomId,
      text: msg.text,
      time: msg.time,
    });

    // Send to room members, each with correct isSelf
    const roomSockets = this.io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sid of roomSockets) {
        const s = this.io.sockets.sockets.get(sid);
        if (s) {
          const isSelf = (s.identity && (s.identity.agentId || s.id)) === msg.fromId;
          s.emit('msg:roomed', { ...msg, isSelf });
        }
      }
    }
  }

  /**
   * 查询历史消息，默认 20 条，每条标记 isSelf
   */
  history(socket, { type, limit }) {
    const effectiveLimit = (typeof limit === 'number' && limit > 0) ? limit : 20;
    const validTypes = ['broadcast', 'talk', 'room'];
    if (!validTypes.includes(type)) return;

    const messages = this.db.getMessages(type, effectiveLimit);
    const myId = socket.identity.agentId || socket.id;

    const result = messages.map((m) => ({
      id: m.id,
      type: m.type,
      from: m.fromName,
      fromName: m.fromName,
      fromId: m.fromId,
      to: m.toId || undefined,
      text: m.text,
      time: m.time,
      isSelf: m.fromId === myId,
    }));

    socket.emit('msg:historyResult', result);
  }

  /**
   * Admin 代言模式：以选手身份广播，标记"人类代言"
   */
  speakAs(socket, { agentId, text }) {
    if (!this._checkLength(text)) return;

    // Validate agentId
    if (!VALID_AGENT_IDS.includes(agentId)) {
      socket.emit('error', { message: '无效的选手 ID' });
      return;
    }

    const msg = {
      id: crypto.randomUUID(),
      type: 'broadcast',
      from: AGENT_NAMES[agentId],
      fromName: AGENT_NAMES[agentId],
      fromId: agentId,
      text,
      time: Date.now(),
      humanProxy: true,
      isProxy: true,
    };

    // Persist
    this.db.insertMessage({
      id: msg.id,
      type: msg.type,
      fromId: msg.fromId,
      fromName: msg.from,
      toId: null,
      text: msg.text,
      time: msg.time,
    });

    // Broadcast to all with isSelf based on agentId
    const sockets = this.io.sockets.sockets;
    for (const [, s] of sockets) {
      const isSelf = (s.identity && s.identity.agentId) === agentId;
      s.emit('msg:broadcasted', { ...msg, isSelf });
    }

    this._syncSpeechToWorld(agentId, msg.text, { scope: 'broadcast' });
  }

  /**
   * 频率检查：每秒最多 MSG_RATE_LIMIT 条消息
   * @param {string} socketId
   * @returns {boolean} true if allowed
   */
  _checkRate(socketId) {
    const now = Date.now();
    const windowMs = 1000;
    const maxMessages = HACKATHON_CONFIG.MSG_RATE_LIMIT;

    let timestamps = this._rateBuckets.get(socketId);
    if (!timestamps) {
      timestamps = [];
      this._rateBuckets.set(socketId, timestamps);
    }

    // Remove timestamps outside the window
    const cutoff = now - windowMs;
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= maxMessages) {
      return false; // Rate limited — silently drop
    }

    timestamps.push(now);
    return true;
  }

  /**
   * 长度检查：非空且 ≤ MSG_MAX_LENGTH 字符
   * @param {string} text
   * @returns {boolean} true if valid
   */
  _checkLength(text) {
    if (!text || typeof text !== 'string') return false;
    if (text.length === 0) return false;
    if (text.length > HACKATHON_CONFIG.MSG_MAX_LENGTH) return false;
    return true;
  }

  _syncSpeechToWorld(playerId, text, options = {}) {
    if (!this._worldEngine || !playerId || typeof text !== 'string' || !text.trim()) return;
    this._worldEngine.chat(playerId, text, options);
  }
}

module.exports = MsgRouter;
