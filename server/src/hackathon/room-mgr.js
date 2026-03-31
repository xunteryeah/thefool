'use strict';

/**
 * RoomMgr — 房间管理模块
 *
 * 基于 Socket.io Room 机制实现分组房间，管理成员加入/离开和权限校验。
 * - createFromGroups: 根据分组结果自动创建房间并建立 agentId → roomId 映射
 * - join: 校验成员资格或 Admin 角色后加入房间
 * - leave: 离开当前房间
 * - _broadcastMembers: 广播房间成员列表（不含 Admin）
 * - getTeamRoom: 获取选手所属房间 ID
 */

class RoomMgr {
  /**
   * @param {import('socket.io').Server} io
   */
  constructor(io) {
    this.io = io;

    /** @type {Map<string, string>} agentId → roomId */
    this._agentRoomMap = new Map();

    /** @type {Map<string, Set<string>>} roomId → Set of member agentIds (excludes Admin) */
    this._roomMembers = new Map();

    /** @type {string[]} list of created room IDs */
    this._roomIds = [];
  }

  /**
   * 根据分组结果自动创建 Socket.io Room。
   * groups 格式: { teamA: string[], teamB: string[] }
   * 创建 'team-a' 和 'team-b' 两个房间，并建立 agentId → roomId 映射。
   * @param {{ teamA: string[], teamB: string[] }} groups
   */
  createFromGroups(groups) {
    // Clear previous state
    this._agentRoomMap.clear();
    this._roomMembers.clear();
    this._roomIds = [];

    const mapping = { 'team-a': groups.teamA, 'team-b': groups.teamB };

    for (const [roomId, members] of Object.entries(mapping)) {
      this._roomIds.push(roomId);
      this._roomMembers.set(roomId, new Set(members));

      for (const agentId of members) {
        this._agentRoomMap.set(agentId, roomId);
      }
    }
  }

  /**
   * 加入房间。校验 socket 是否为房间成员或 Admin 角色。
   * - 房间成员：socket.identity.agentId 在房间成员集合中
   * - Admin：socket.identity.role === 'admin'
   * 非成员非 Admin 返回错误。
   * Admin 加入后可接收消息但不计入成员列表。
   * @param {import('socket.io').Socket} socket
   * @param {string} roomId
   */
  join(socket, roomId) {
    if (!roomId || !this._roomMembers.has(roomId)) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }

    const identity = socket.identity || {};
    const agentId = identity.agentId;
    const role = identity.role;
    const members = this._roomMembers.get(roomId);

    const isMember = agentId && members.has(agentId);
    const isAdmin = role === 'admin';

    if (!isMember && !isAdmin) {
      socket.emit('error', { message: '你不是该房间成员' });
      return;
    }

    // Leave any previous room first
    if (socket.currentRoom) {
      this._leaveRoom(socket);
    }

    // Join the Socket.io room
    socket.join(roomId);
    socket.currentRoom = roomId;

    // Broadcast updated member list (Admin not included)
    this._broadcastMembers(roomId);
  }

  /**
   * 离开当前房间。
   * @param {import('socket.io').Socket} socket
   */
  leave(socket) {
    if (!socket.currentRoom) return;
    this._leaveRoom(socket);
  }

  /**
   * Internal: leave the current room and broadcast member update.
   * @param {import('socket.io').Socket} socket
   */
  _leaveRoom(socket) {
    const roomId = socket.currentRoom;
    if (!roomId) return;

    socket.leave(roomId);
    socket.currentRoom = null;

    // Broadcast updated member list
    if (this._roomMembers.has(roomId)) {
      this._broadcastMembers(roomId);
    }
  }

  /**
   * 广播 room:members 事件到房间内所有 socket。
   * 成员列表不包含 Admin。
   * @param {string} roomId
   */
  _broadcastMembers(roomId) {
    const memberAgentIds = this._roomMembers.get(roomId);
    if (!memberAgentIds) return;

    // Get the actual sockets in the Socket.io room and filter to real members
    const roomSockets = this.io.sockets.adapter.rooms.get(roomId);
    const activeMembers = [];

    if (roomSockets) {
      for (const sid of roomSockets) {
        const s = this.io.sockets.sockets.get(sid);
        if (s && s.identity && s.identity.role !== 'admin' && memberAgentIds.has(s.identity.agentId)) {
          activeMembers.push({
            agentId: s.identity.agentId,
            name: s.identity.name,
          });
        }
      }
    }

    this.io.to(roomId).emit('room:members', {
      roomId,
      members: activeMembers,
    });
  }

  /**
   * 获取选手所属房间 ID。
   * @param {string} agentId
   * @returns {string|null} roomId or null if not assigned
   */
  getTeamRoom(agentId) {
    return this._agentRoomMap.get(agentId) || null;
  }

  /**
   * 获取所有房间 ID。
   * @returns {string[]}
   */
  getRoomIds() {
    return [...this._roomIds];
  }
}

module.exports = RoomMgr;
