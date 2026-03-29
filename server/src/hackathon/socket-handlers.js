'use strict';

/**
 * Socket.io 事件注册总线
 * 按 socket.identity.role 分发事件到对应模块
 *
 * Roles: admin, director, agent_player, agent_control, agent_judge, agent_organizer, human_viewer
 */

const worldEngine = require('../engine/world-engine');

const AGENT_ROLES = ['agent_player', 'agent_judge', 'agent_organizer'];

/**
 * Register all Socket.io event handlers on the given io instance.
 * @param {import('socket.io').Server} io
 * @param {Object} modules
 * @param {import('./auth-guard')} modules.authGuard
 * @param {import('./act-engine')} modules.actEngine
 * @param {import('./control-mgr')} modules.controlMgr
 * @param {import('./msg-router')} modules.msgRouter
 * @param {Object} modules.roomMgr
 * @param {Object} modules.playerMgr
 * @param {Object} modules.viewerMgr
 * @param {Object} modules.productMgr
 * @param {Object} modules.reviewMgr
 * @param {Object} modules.canvasMgr
 */
function registerHandlers(io, modules) {
  const {
    authGuard,
    actEngine,
    controlMgr,
    msgRouter,
    roomMgr,
    playerMgr,
    viewerMgr,
    productMgr,
    reviewMgr,
    canvasMgr,
  } = modules;

  io.on('connection', (socket) => {
    const { role, agentId, name } = socket.identity;

    // --- Admin: auto-join admin-room ---
    if (role === 'admin') {
      socket.join('admin-room');
    }

    if (role === 'agent_control' && controlMgr) {
      controlMgr.register(socket);
    }

    // --- Agent_Player: create world-engine player and broadcast online status ---
    if (role === 'agent_player') {
      // Join the world as a player
      const sprite = ['Boy', 'Cavegirl', 'Eskimo'][['qianzi', 'paopao', 'jiajia'].indexOf(agentId)] || 'Boy';
      worldEngine.join(agentId, name, sprite, { trackActivity: true });
      
      io.emit('player:status', {
        agentId: socket.identity.agentId,
        status: 'online',
      });
    }

    // =====================
    // Admin-only events
    // =====================
    if (role === 'admin') {
      socket.on('admin:setAct', (data) => {
        actEngine.setAct(data && data.act);
      });

      socket.on('admin:speakAs', (data) => {
        msgRouter.speakAs(socket, data || {});
      });

      socket.on('product:lock', (data) => {
        if (productMgr) {
          productMgr.lock(data && data.teamId);
        }
      });
    }

    if (role === 'director' || role === 'admin') {
      socket.on('director:send', (data) => {
        if (!controlMgr || !authGuard.requireRole(socket, 'director', 'admin')) return;
        controlMgr.send(socket, data || {});
      });
    }

    // =====================
    // Agent common events (agent_player, agent_judge, agent_organizer, admin)
    // =====================
    if (AGENT_ROLES.includes(role) || role === 'admin') {
      socket.on('msg:broadcast', (data) => {
        if (!authGuard.requireRole(socket, 'admin', ...AGENT_ROLES)) return;
        msgRouter.broadcast(socket, data || {});
      });

      socket.on('msg:talk', (data) => {
        if (!authGuard.requireRole(socket, 'admin', ...AGENT_ROLES)) return;
        msgRouter.talk(socket, data || {});
      });

      socket.on('msg:room', (data) => {
        if (!authGuard.requireRole(socket, 'admin', ...AGENT_ROLES)) return;
        msgRouter.room(socket, data || {});
      });

      socket.on('msg:history', (data) => {
        msgRouter.history(socket, data || {});
      });
    }

    // =====================
    // Agent_Player exclusive events
    // =====================
    if (role === 'agent_player') {
      socket.on('player:updateStats', (data) => {
        if (playerMgr) {
          playerMgr.updateStats(socket.identity.agentId, data || {});
        }
      });

      socket.on('act2:preference', (data) => {
        const result = actEngine.submitPreference(socket.identity.agentId, data || {});
        if (result && result.error) {
          socket.emit('error', { message: result.error });
        }
      });

      socket.on('product:get', () => {
        if (productMgr) {
          productMgr.get(socket);
        }
      });

      socket.on('product:update', (data) => {
        if (productMgr) {
          productMgr.update(socket, data || {});
        }
      });

      socket.on('canvas:draw', (data) => {
        if (canvasMgr) {
          canvasMgr.draw(socket, data || {}, playerMgr);
        }
      });
    }

    // =====================
    // Agent_Judge exclusive events
    // =====================
    if (role === 'agent_judge') {
      socket.on('review:submit', (data) => {
        if (reviewMgr) {
          reviewMgr.submit(socket, data || {});
        }
      });
    }

    // =====================
    // Agent_Organizer / Admin — grouping events
    // =====================
    if (role === 'agent_organizer' || role === 'admin') {
      socket.on('act3:group', (data) => {
        const result = actEngine.submitGroup(data || {});
        if (result && result.error) {
          socket.emit('error', { message: result.error });
        }
      });
    }

    // =====================
    // Human_Viewer exclusive events
    // =====================
    if (role === 'human_viewer') {
      socket.on('viewer:danmaku', (data) => {
        if (viewerMgr) {
          viewerMgr.danmaku(socket, data || {});
        }
      });

      socket.on('viewer:like', (data) => {
        if (viewerMgr) {
          viewerMgr.like(socket, data || {});
        }
      });
    }

    // =====================
    // Universal events (all roles)
    // =====================
    socket.on('act:query', () => {
      const state = actEngine.getState();
      socket.emit('act:current', state);
    });

    if (role === 'agent_control' && controlMgr) {
      socket.on('director:ack', (data) => {
        controlMgr.acknowledge(socket, data || {});
      });
    }

    // --- World Engine: Movement & Interaction (agent_player only) ---
    if (role === 'agent_player') {
      // 监听移动进度事件
      const onMoveProgress = (data) => {
        if (data.playerId === socket.identity.agentId) {
          socket.emit('world:moveProgress', {
            x: data.x,
            y: data.y,
            step: data.step,
            total: data.total,
          });
        }
      };
      worldEngine.events.on('moveProgress', onMoveProgress);
      
      // 断开时清理监听器
      socket.on('disconnect', () => {
        worldEngine.events.off('moveProgress', onMoveProgress);
      });
      
      socket.on('world:look', async () => {
        const result = worldEngine.look(socket.identity.agentId);
        socket.emit('world:lookResult', result);
      });

      socket.on('world:move', async (data) => {
        const result = await worldEngine.move(socket.identity.agentId, data || {});
        socket.emit('world:moveResult', result);
      });

      socket.on('world:interact', () => {
        const result = worldEngine.interact(socket.identity.agentId);
        socket.emit('world:interactResult', result);
      });

      socket.on('world:map', () => {
        const directory = worldEngine.getMapDirectory();
        socket.emit('world:mapResult', directory);
      });

      socket.on('world:chat', (data) => {
        const result = worldEngine.chat(socket.identity.agentId, data?.text || '');
        socket.emit('world:chatResult', result);
      });
    }

    socket.on('room:join', (data) => {
      if (roomMgr) {
        roomMgr.join(socket, data && data.roomId);
      }
    });

    socket.on('room:leave', () => {
      if (roomMgr) {
        roomMgr.leave(socket);
      }
    });

    socket.on('review:query', () => {
      if (reviewMgr) {
        reviewMgr.query(socket);
      }
    });

    socket.on('canvas:sync', () => {
      if (canvasMgr) {
        canvasMgr.sync(socket);
      }
    });

    // =====================
    // Disconnect handling
    // =====================
    socket.on('disconnect', () => {
      // Agent_Player: remove from world and broadcast offline status
      if (role === 'agent_player') {
        worldEngine.removePlayer(socket.identity.agentId);
        
        io.emit('player:status', {
          agentId: socket.identity.agentId,
          status: 'offline',
        });
      }

      // Human_Viewer: cleanup danmaku timers etc.
      if (role === 'human_viewer' && viewerMgr) {
        viewerMgr.cleanup(socket.id);
      }
    });
  });
}

module.exports = { registerHandlers };
