'use strict';

/**
 * ProductMgr — 产品文档模块
 *
 * 管理每队的产品文档，实现乐观锁并发控制。
 * - init(teamIds): 初始化空白产品文档
 * - get(socket): 返回选手所属队伍的产品文档
 * - update(socket, data): 乐观锁版本校验更新
 * - lock(teamId): 锁定文档，拒绝后续更新
 * - setRoomMgr(roomMgr): 注入房间管理器用于队伍查找
 */

class ProductMgr {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('../persistence/sqlite-state-store').SQLiteStateStore} db
   */
  constructor(io, db) {
    this.io = io;
    this.db = db;

    /** @type {Map<string, Object>} teamId → ProductDocument */
    this._docs = new Map();

    /** @type {import('./room-mgr')|null} */
    this._roomMgr = null;
  }

  /**
   * 注入 RoomMgr 引用，用于通过 agentId 查找所属队伍。
   * @param {import('./room-mgr')} roomMgr
   */
  setRoomMgr(roomMgr) {
    this._roomMgr = roomMgr;
  }

  /**
   * 初始化队伍的空白产品文档。
   * 同时持久化到 SQLite。
   * @param {string[]} teamIds
   */
  init(teamIds) {
    for (const teamId of teamIds) {
      const doc = {
        teamId,
        version: 0,
        name: '',
        problem: '',
        solution: '',
        features: '',
        lockedAt: null,
      };
      this._docs.set(teamId, doc);
      this.db.saveProduct(doc);
    }
  }

  /**
   * 返回选手所属队伍的产品文档。
   * 通过 roomMgr 查找 agentId → teamId 映射。
   * @param {import('socket.io').Socket} socket
   */
  get(socket) {
    const agentId = socket.identity && socket.identity.agentId;
    if (!agentId) {
      socket.emit('error', { message: '无法确定选手身份' });
      return;
    }

    const teamId = this._getTeamId(agentId);
    if (!teamId) {
      socket.emit('error', { message: '选手尚未分组' });
      return;
    }

    const doc = this._docs.get(teamId);
    if (!doc) {
      socket.emit('error', { message: '产品文档不存在' });
      return;
    }

    socket.emit('product:data', {
      teamId: doc.teamId,
      version: doc.version,
      name: doc.name,
      problem: doc.problem,
      solution: doc.solution,
      features: doc.features,
      lockedAt: doc.lockedAt,
    });
  }

  /**
   * 更新产品文档（乐观锁版本校验）。
   * - version 一致 → 更新并递增 version，通知队友和 Admin
   * - version 不一致 → 返回 product:conflict 携带最新版本
   * - 文档已锁定 → 返回错误
   * @param {import('socket.io').Socket} socket
   * @param {{ version: number, name: string, problem: string, solution: string, features: string }} data
   */
  update(socket, { version, name, problem, solution, features }) {
    const agentId = socket.identity && socket.identity.agentId;
    if (!agentId) {
      socket.emit('error', { message: '无法确定选手身份' });
      return;
    }

    const teamId = this._getTeamId(agentId);
    if (!teamId) {
      socket.emit('error', { message: '选手尚未分组' });
      return;
    }

    const doc = this._docs.get(teamId);
    if (!doc) {
      socket.emit('error', { message: '产品文档不存在' });
      return;
    }

    // Check if document is locked
    if (doc.lockedAt !== null) {
      socket.emit('error', { message: '文档已锁定' });
      return;
    }

    // Optimistic lock: compare submitted version with current version
    if (version !== doc.version) {
      socket.emit('product:conflict', {
        teamId: doc.teamId,
        version: doc.version,
        name: doc.name,
        problem: doc.problem,
        solution: doc.solution,
        features: doc.features,
        lockedAt: doc.lockedAt,
      });
      return;
    }

    // Version matches — update and increment
    doc.version += 1;
    if (name !== undefined) doc.name = name;
    if (problem !== undefined) doc.problem = problem;
    if (solution !== undefined) doc.solution = solution;
    if (features !== undefined) doc.features = features;

    // Persist to SQLite
    this.db.saveProduct(doc);

    // Build the changed payload
    const payload = {
      teamId: doc.teamId,
      version: doc.version,
      name: doc.name,
      problem: doc.problem,
      solution: doc.solution,
      features: doc.features,
      lockedAt: doc.lockedAt,
    };

    // Notify team room and admin-room
    if (teamId) {
      this.io.to(teamId).emit('product:changed', payload);
    }
    this.io.to('admin-room').emit('product:changed', payload);
  }

  /**
   * Admin 锁定指定队伍的产品文档。
   * 锁定后拒绝所有更新操作，广播 product:locked。
   * @param {string} teamId
   */
  lock(teamId) {
    const doc = this._docs.get(teamId);
    if (!doc) return;

    doc.lockedAt = Date.now();

    // Persist to SQLite
    this.db.saveProduct(doc);

    // Broadcast product:locked to all clients
    this.io.emit('product:locked', {
      teamId: doc.teamId,
      lockedAt: doc.lockedAt,
    });
  }

  /**
   * 通过 agentId 查找所属队伍 ID。
   * 使用 roomMgr 的 getTeamRoom 方法。
   * @param {string} agentId
   * @returns {string|null}
   */
  _getTeamId(agentId) {
    if (this._roomMgr) {
      return this._roomMgr.getTeamRoom(agentId);
    }
    return null;
  }
}

module.exports = ProductMgr;
