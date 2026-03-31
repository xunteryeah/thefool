'use strict';

const VALID_AGENT_IDS = ['qianzi', 'paopao', 'jiajia'];
const VALID_MOODS = ['happy', 'sad', 'angry', 'calm'];

class PlayerMgr {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('../persistence/sqlite-state-store').SQLiteStateStore} db
   */
  constructor(io, db) {
    this.io = io;
    this.db = db;
    /** @type {Map<string, Object>} agentId → player stats */
    this._players = new Map();
  }

  /**
   * 初始化选手默认属性
   * @param {string[]} agentIds
   */
  init(agentIds) {
    for (const id of agentIds) {
      this._players.set(id, {
        agentId: id,
        mood: 'calm',
        confidence: 50,
        energy: 100,
        friends: [],
        rivals: [],
        likes: 0,
        danmakuCount: 0,
      });
    }
  }

  /**
   * 更新可写字段（mood, confidence, friends, rivals）
   * 忽略 energy, likes, danmakuCount
   * @param {string} agentId
   * @param {Object} updates
   */
  updateStats(agentId, { mood, confidence, friends, rivals }) {
    const player = this._players.get(agentId);
    if (!player) return;

    let changed = false;

    if (mood !== undefined && VALID_MOODS.includes(mood)) {
      player.mood = mood;
      changed = true;
    }

    if (confidence !== undefined && typeof confidence === 'number') {
      player.confidence = Math.max(0, Math.min(100, confidence));
      changed = true;
    }

    if (friends !== undefined && Array.isArray(friends)) {
      const validFriends = friends.filter(
        (f) => VALID_AGENT_IDS.includes(f) && f !== agentId
      );
      player.friends = validFriends;
      changed = true;
    }

    if (rivals !== undefined && Array.isArray(rivals)) {
      const validRivals = rivals.filter(
        (r) => VALID_AGENT_IDS.includes(r) && r !== agentId
      );
      player.rivals = validRivals;
      changed = true;
    }

    if (changed) {
      this._broadcastStats(agentId);
    }
  }

  /**
   * 扣减精力值，不低于 0
   * @param {string} agentId
   * @param {number} cost
   */
  consumeEnergy(agentId, cost) {
    const player = this._players.get(agentId);
    if (!player) return;

    const prev = player.energy;
    player.energy = Math.max(0, player.energy - cost);
    if (player.energy !== prev) {
      this._broadcastStats(agentId);
    }
  }

  /**
   * 增加点赞计数
   * @param {string} agentId
   */
  addLike(agentId) {
    const player = this._players.get(agentId);
    if (!player) return;

    player.likes += 1;
    this._broadcastStats(agentId);
  }

  /**
   * 减少点赞计数
   * @param {string} agentId
   */
  removeLike(agentId) {
    const player = this._players.get(agentId);
    if (!player) return;

    player.likes = Math.max(0, player.likes - 1);
    this._broadcastStats(agentId);
  }

  /**
   * 获取所有选手属性
   * @returns {Object[]}
   */
  getAll() {
    return Array.from(this._players.values()).map((p) => ({ ...p }));
  }

  /**
   * 获取单个选手属性
   * @param {string} agentId
   * @returns {Object|null}
   */
  getPlayer(agentId) {
    const player = this._players.get(agentId);
    return player ? { ...player } : null;
  }

  /**
   * 广播选手属性变化事件
   * @param {string} agentId
   */
  _broadcastStats(agentId) {
    const player = this._players.get(agentId);
    if (!player) return;
    this.io.emit('player:statsChanged', { ...player });
  }
}

module.exports = PlayerMgr;
