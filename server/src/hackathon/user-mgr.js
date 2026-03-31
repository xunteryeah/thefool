'use strict';

const crypto = require('crypto');
const { sqliteStateStore } = require('../persistence/sqlite-state-store');

class UserMgr {
  constructor() {
    this._initSchema();
  }

  _initSchema() {
    sqliteStateStore.database.exec(`
      CREATE TABLE IF NOT EXISTS hackathon_users (
        id TEXT PRIMARY KEY,
        api_key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent_player',
        created_at INTEGER NOT NULL,
        last_active_at INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_hackathon_users_api_key ON hackathon_users(api_key);
      CREATE INDEX IF NOT EXISTS idx_hackathon_users_name ON hackathon_users(name);
    `);
  }

  generateApiKey() {
    const random = crypto.randomBytes(8).toString('hex');
    const suffix = crypto.randomBytes(4).toString('hex');
    return `key-${random}-${suffix}`;
  }

  generateUserId() {
    return `user_${crypto.randomBytes(6).toString('hex')}`;
  }

  createUser(options) {
    const { name, role = 'agent_player' } = options;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('用户名不能为空');
    }

    const id = this.generateUserId();
    const apiKey = this.generateApiKey();
    const createdAt = Date.now();

    sqliteStateStore.database.prepare(`
      INSERT INTO hackathon_users (id, api_key, name, role, created_at, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(id, apiKey, name.trim(), role, createdAt);

    return { id, apiKey, name: name.trim(), role, createdAt };
  }

  getUserByApiKey(apiKey) {
    if (!apiKey) return null;

    const row = sqliteStateStore.database.prepare(`
      SELECT id, api_key AS apiKey, name, role, created_at AS createdAt, last_active_at AS lastActiveAt, is_active AS isActive
      FROM hackathon_users
      WHERE api_key = ? AND is_active = 1
    `).get(apiKey);

    return row || null;
  }

  getUserById(id) {
    if (!id) return null;

    const row = sqliteStateStore.database.prepare(`
      SELECT id, api_key AS apiKey, name, role, created_at AS createdAt, last_active_at AS lastActiveAt, is_active AS isActive
      FROM hackathon_users
      WHERE id = ?
    `).get(id);

    return row || null;
  }

  listUsers(options = {}) {
    const { activeOnly = false } = options;

    const sql = activeOnly
      ? `SELECT id, api_key AS apiKey, name, role, created_at AS createdAt, last_active_at AS lastActiveAt, is_active AS isActive
         FROM hackathon_users WHERE is_active = 1 ORDER BY created_at DESC`
      : `SELECT id, api_key AS apiKey, name, role, created_at AS createdAt, last_active_at AS lastActiveAt, is_active AS isActive
         FROM hackathon_users ORDER BY created_at DESC`;

    return sqliteStateStore.database.prepare(sql).all();
  }

  updateLastActive(id) {
    sqliteStateStore.database.prepare(`
      UPDATE hackathon_users
      SET last_active_at = ?
      WHERE id = ?
    `).run(Date.now(), id);
  }

  deactivateUser(id) {
    const result = sqliteStateStore.database.prepare(`
      UPDATE hackathon_users
      SET is_active = 0
      WHERE id = ?
    `).run(id);

    return result.changes > 0;
  }

  activateUser(id) {
    const result = sqliteStateStore.database.prepare(`
      UPDATE hackathon_users
      SET is_active = 1
      WHERE id = ?
    `).run(id);

    return result.changes > 0;
  }

  regenerateApiKey(id) {
    const newApiKey = this.generateApiKey();

    const result = sqliteStateStore.database.prepare(`
      UPDATE hackathon_users
      SET api_key = ?
      WHERE id = ?
    `).run(newApiKey, id);

    return result.changes > 0 ? newApiKey : null;
  }

  getStats() {
    const total = sqliteStateStore.database.prepare(`
      SELECT COUNT(*) AS count FROM hackathon_users
    `).get();

    const active = sqliteStateStore.database.prepare(`
      SELECT COUNT(*) AS count FROM hackathon_users WHERE is_active = 1
    `).get();

    const onlineRecently = sqliteStateStore.database.prepare(`
      SELECT COUNT(*) AS count FROM hackathon_users
      WHERE is_active = 1 AND last_active_at > ?
    `).get(Date.now() - 5 * 60 * 1000);

    return {
      total: total?.count || 0,
      active: active?.count || 0,
      onlineRecently: onlineRecently?.count || 0,
    };
  }
}

const userMgr = new UserMgr();

module.exports = {
  UserMgr,
  userMgr,
};
