'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const AuthGuard = require('../../src/hackathon/auth-guard');
const { HACKATHON_CONFIG } = require('../../src/config/service-config');

describe('AuthGuard', () => {
  let guard;

  beforeEach(() => {
    guard = new AuthGuard();
  });

  describe('authenticate', () => {
    it('should bind identity for valid admin key', (_, done) => {
      const socket = { handshake: { auth: { apiKey: 'key-admin-xxx' } } };
      guard.authenticate(socket, (err) => {
        assert.equal(err, undefined);
        assert.equal(socket.identity.role, 'admin');
        assert.equal(socket.identity.name, 'Admin');
        assert.equal(socket.identity.agentId, null);
        done();
      });
    });

    it('should bind identity for valid agent_player key with agentId', (_, done) => {
      const socket = { handshake: { auth: { apiKey: 'key-qianzi-xxx' } } };
      guard.authenticate(socket, (err) => {
        assert.equal(err, undefined);
        assert.equal(socket.identity.role, 'agent_player');
        assert.equal(socket.identity.name, '钳子');
        assert.equal(socket.identity.agentId, 'qianzi');
        done();
      });
    });

    it('should bind identity for agent_judge key', (_, done) => {
      const socket = { handshake: { auth: { apiKey: 'key-judge-xxx' } } };
      guard.authenticate(socket, (err) => {
        assert.equal(err, undefined);
        assert.equal(socket.identity.role, 'agent_judge');
        assert.equal(socket.identity.name, '评委龙虾');
        done();
      });
    });

    it('should bind identity for agent_organizer key', (_, done) => {
      const socket = { handshake: { auth: { apiKey: 'key-organizer-xxx' } } };
      guard.authenticate(socket, (err) => {
        assert.equal(err, undefined);
        assert.equal(socket.identity.role, 'agent_organizer');
        assert.equal(socket.identity.name, '组织者龙虾');
        done();
      });
    });

    it('should reject invalid API key with unauthorized error', (_, done) => {
      const socket = { handshake: { auth: { apiKey: 'invalid-key-123' } } };
      guard.authenticate(socket, (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'unauthorized');
        done();
      });
    });

    it('should assign Human_Viewer role when no key provided', (_, done) => {
      const socket = { handshake: { auth: {} } };
      guard.authenticate(socket, (err) => {
        assert.equal(err, undefined);
        assert.equal(socket.identity.role, 'human_viewer');
        assert.ok(socket.identity.name.startsWith('观众_'));
        assert.equal(socket.identity.agentId, null);
        done();
      });
    });

    it('should assign Human_Viewer when auth object is missing', (_, done) => {
      const socket = { handshake: {} };
      guard.authenticate(socket, (err) => {
        assert.equal(err, undefined);
        assert.equal(socket.identity.role, 'human_viewer');
        done();
      });
    });

    it('should generate unique viewer names for multiple anonymous connections', (_, done) => {
      const socket1 = { handshake: { auth: {} } };
      const socket2 = { handshake: { auth: {} } };
      guard.authenticate(socket1, () => {
        guard.authenticate(socket2, () => {
          assert.notEqual(socket1.identity.name, socket2.identity.name);
          done();
        });
      });
    });
  });

  describe('requireRole', () => {
    it('should return true when socket has an allowed role', () => {
      const socket = {
        identity: { role: 'admin' },
        emit: () => {},
      };
      assert.equal(guard.requireRole(socket, 'admin', 'agent_player'), true);
    });

    it('should return false and emit error when role is not allowed', () => {
      let emittedEvent = null;
      let emittedData = null;
      const socket = {
        identity: { role: 'human_viewer' },
        emit: (event, data) => { emittedEvent = event; emittedData = data; },
      };
      assert.equal(guard.requireRole(socket, 'admin'), false);
      assert.equal(emittedEvent, 'error');
      assert.deepEqual(emittedData, { message: '权限不足' });
    });

    it('should return false when socket has no identity', () => {
      let emitted = false;
      const socket = {
        emit: () => { emitted = true; },
      };
      assert.equal(guard.requireRole(socket, 'admin'), false);
      assert.ok(emitted);
    });

    it('should accept multiple allowed roles', () => {
      const socket = {
        identity: { role: 'agent_organizer' },
        emit: () => {},
      };
      assert.equal(guard.requireRole(socket, 'admin', 'agent_organizer'), true);
    });
  });
});
