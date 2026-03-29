'use strict';

const crypto = require('crypto');

const MAX_PENDING_PER_AGENT = 20;

class ControlMgr {
  constructor(io) {
    this.io = io;
    this.pendingByAgent = new Map();
  }

  register(socket) {
    const agentId = socket.identity && socket.identity.agentId;
    if (!agentId) return;
    socket.join(this._room(agentId));
    const pending = this.pendingByAgent.get(agentId) || [];
    if (pending.length > 0) {
      socket.emit('director:pending', pending);
    }
  }

  send(socket, data = {}) {
    const agentId = typeof data.agentId === 'string' ? data.agentId.trim() : '';
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    const kind = typeof data.kind === 'string' && data.kind.trim() ? data.kind.trim() : 'wakeup';

    if (!agentId) {
      socket.emit('error', { message: '缺少 agentId' });
      return;
    }

    if (!text) {
      socket.emit('error', { message: '缺少 text' });
      return;
    }

    const message = {
      id: crypto.randomUUID(),
      agentId,
      kind,
      text,
      issuedBy: socket.identity && socket.identity.name ? socket.identity.name : '导演',
      time: Date.now(),
    };

    const pending = this.pendingByAgent.get(agentId) || [];
    pending.push(message);
    while (pending.length > MAX_PENDING_PER_AGENT) pending.shift();
    this.pendingByAgent.set(agentId, pending);

    this.io.to(this._room(agentId)).emit('director:message', message);
    socket.emit('director:sent', { ok: true, message });
  }

  acknowledge(socket, data = {}) {
    const agentId = socket.identity && socket.identity.agentId;
    const messageId = typeof data.messageId === 'string' ? data.messageId.trim() : '';
    if (!agentId || !messageId) return;
    const pending = this.pendingByAgent.get(agentId) || [];
    const nextPending = pending.filter((item) => item.id !== messageId);
    if (nextPending.length > 0) {
      this.pendingByAgent.set(agentId, nextPending);
    } else {
      this.pendingByAgent.delete(agentId);
    }
  }

  _room(agentId) {
    return `director-control:${agentId}`;
  }
}

module.exports = ControlMgr;
