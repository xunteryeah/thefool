'use strict';

const { HACKATHON_CONFIG } = require('../config/service-config');

let viewerCounter = 0;

class AuthGuard {
  /**
   * Socket.io 中间件：验证 API Key，绑定 socket.identity
   * - 有效 Key → 绑定对应角色（role、name、agentId）
   * - 无效 Key → 拒绝连接 Error('unauthorized')
   * - 无 Key → 标记为 Human_Viewer，分配默认观众名称
   * @param {import('socket.io').Socket} socket
   * @param {Function} next
   */
  authenticate(socket, next) {
    const apiKey = socket.handshake.auth && socket.handshake.auth.apiKey;

    if (apiKey) {
      const entry = HACKATHON_CONFIG.API_KEYS[apiKey];
      if (entry && entry.enabled !== false) {
        socket.identity = {
          role: entry.role,
          name: entry.name,
          agentId: entry.agentId || null,
        };
        return next();
      }
      // Invalid key → reject
      return next(new Error('unauthorized'));
    }

    // No key → Human_Viewer with auto-generated name
    viewerCounter += 1;
    socket.identity = {
      role: 'human_viewer',
      name: `观众_${viewerCounter}`,
      agentId: null,
    };
    return next();
  }

  /**
   * 权限检查：验证 socket 是否拥有指定角色
   * 失败时向 socket emit error 事件 { message: '权限不足' }
   * @param {import('socket.io').Socket} socket
   * @param {...string} roles - 允许的角色列表
   * @returns {boolean}
   */
  requireRole(socket, ...roles) {
    if (socket.identity && roles.includes(socket.identity.role)) {
      return true;
    }
    socket.emit('error', { message: '权限不足' });
    return false;
  }
}

module.exports = AuthGuard;
