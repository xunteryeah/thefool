'use strict';

const { HACKATHON_CONFIG } = require('../config/service-config');

const { DANMAKU_MAX_LENGTH, DANMAKU_COOLDOWN_MS } = HACKATHON_CONFIG;

class ViewerMgr {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('./player-mgr')} playerMgr
   * @param {import('../persistence/sqlite-state-store').SQLiteStateStore} db
   */
  constructor(io, playerMgr, db) {
    this.io = io;
    this.playerMgr = playerMgr;
    this.db = db;
    this._danmakuCount = 0;

    /** @type {Map<string, number>} socketId → last danmaku timestamp */
    this._danmakuCooldowns = new Map();

    /** @type {Map<string, Set<string>>} socketId → Set of liked agentIds */
    this._viewerLikes = new Map();
  }

  /**
   * 发送弹幕（≤50 字符，每 2 秒 1 条）
   * @param {import('socket.io').Socket} socket
   * @param {{ text: string }} data
   */
  danmaku(socket, { text }) {
    // Validate text is non-empty and within length limit
    if (!text || typeof text !== 'string' || text.length === 0) return;
    if (text.length > DANMAKU_MAX_LENGTH) return;

    // Rate limit: 1 danmaku per DANMAKU_COOLDOWN_MS
    const now = Date.now();
    const lastTime = this._danmakuCooldowns.get(socket.id);
    if (lastTime && now - lastTime < DANMAKU_COOLDOWN_MS) return;

    this._danmakuCooldowns.set(socket.id, now);
    this._danmakuCount += 1;

    // Broadcast danmaku event to all clients
    this.io.emit('danmaku', {
      text,
      from: socket.identity.name,
      time: now,
    });
  }

  /**
   * 点赞/取消点赞选手
   * @param {import('socket.io').Socket} socket
   * @param {{ targetId: string }} data
   */
  like(socket, { targetId }) {
    // Validate targetId is a valid agent ID
    if (!targetId || !HACKATHON_CONFIG.AGENT_ID_SET.has(targetId)) return;

    const socketId = socket.id;

    // Get or create the viewer's like set
    if (!this._viewerLikes.has(socketId)) {
      this._viewerLikes.set(socketId, new Set());
    }
    const likedSet = this._viewerLikes.get(socketId);

    if (likedSet.has(targetId)) {
      // Already liked → unlike (toggle off)
      likedSet.delete(targetId);
      this.playerMgr.removeLike(targetId);
      // Remove from SQLite
      if (this.db) {
        this.db.removeLike(socketId, targetId);
      }
    } else {
      // Not liked → like (toggle on)
      likedSet.add(targetId);
      this.playerMgr.addLike(targetId);
      // Persist to SQLite
      if (this.db) {
        this.db.addLike(socketId, targetId);
      }
    }
  }

  /**
   * 清理断线观众的临时数据
   * @param {string} socketId
   */
  cleanup(socketId) {
    // Remove danmaku cooldown timer
    this._danmakuCooldowns.delete(socketId);

    // Remove like tracking (but keep SQLite records for persistence)
    this._viewerLikes.delete(socketId);
  }

  getDanmakuCount() {
    return this._danmakuCount;
  }
}

module.exports = ViewerMgr;
