const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DATABASE_FILE } = require('../config/service-config');

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

class SQLiteStateStore {
  constructor(databaseFile) {
    ensureDirectory(path.dirname(databaseFile));
    try { fs.chmodSync(databaseFile, 0o600); } catch (_) {}
    this.database = new DatabaseSync(databaseFile, { openMode: 2 });
    this.initializeSchema();
    this.resetRuntimeSessions();
  }

  initializeSchema() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        handle TEXT,
        name TEXT NOT NULL,
        sprite TEXT NOT NULL,
        public_key TEXT,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        lease_expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS active_profile_sessions (
        profile_id TEXT PRIMARY KEY,
        token TEXT NOT NULL
      );
    `);

    const columns = new Set(
      this.database.prepare(`PRAGMA table_info(profiles)`).all().map((column) => column.name),
    );
    if (!columns.has('handle')) {
      this.database.exec(`ALTER TABLE profiles ADD COLUMN handle TEXT;`);
    }
    if (!columns.has('public_key')) {
      this.database.exec(`ALTER TABLE profiles ADD COLUMN public_key TEXT;`);
    }

    this.database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_handle ON profiles(handle);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_public_key ON profiles(public_key);
    `);

    // Hackathon tables
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        from_id TEXT NOT NULL,
        from_name TEXT NOT NULL,
        to_id TEXT,
        text TEXT NOT NULL,
        time INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_type_time ON messages(type, time);

      CREATE TABLE IF NOT EXISTS products (
        team_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 0,
        name TEXT DEFAULT '',
        problem TEXT DEFAULT '',
        solution TEXT DEFAULT '',
        features TEXT DEFAULT '',
        locked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        judge_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        reason TEXT,
        favorite TEXT,
        wildest TEXT,
        time INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS canvas_pixels (
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        color TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        time INTEGER NOT NULL,
        PRIMARY KEY (x, y)
      );

      CREATE TABLE IF NOT EXISTS likes (
        viewer_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        PRIMARY KEY (viewer_id, agent_id)
      );
    `);
  }

  resetRuntimeSessions() {
    this.database.exec(`
      DELETE FROM auth_sessions;
      DELETE FROM active_profile_sessions;
    `);
  }

  createProfile(profile) {
    const existing = this.getProfileByPublicKey(profile.publicKey);
    if (existing) return existing;

    this.database.prepare(`
      INSERT INTO profiles (id, handle, name, sprite, public_key, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      profile.handle,
      profile.name,
      profile.sprite,
      profile.publicKey,
      profile.createdAt,
      profile.lastUsedAt || null,
    );

    return this.getProfileByHandle(profile.handle);
  }

  getProfile(id) {
    const row = this.database.prepare(`
      SELECT id, handle, name, sprite, public_key AS publicKey, created_at AS createdAt, last_used_at AS lastUsedAt
      FROM profiles
      WHERE id = ?
    `).get(id);
    return row || null;
  }

  getProfileByHandle(handle) {
    const row = this.database.prepare(`
      SELECT id, handle, name, sprite, public_key AS publicKey, created_at AS createdAt, last_used_at AS lastUsedAt
      FROM profiles
      WHERE handle = ?
    `).get(handle);
    return row || null;
  }

  getProfileByPublicKey(publicKey) {
    const row = this.database.prepare(`
      SELECT id, handle, name, sprite, public_key AS publicKey, created_at AS createdAt, last_used_at AS lastUsedAt
      FROM profiles
      WHERE public_key = ?
    `).get(publicKey);
    return row || null;
  }

  updateProfileLastUsed(id, lastUsedAt) {
    this.database.prepare(`
      UPDATE profiles
      SET last_used_at = ?
      WHERE id = ?
    `).run(lastUsedAt, id);
  }

  updateProfileSprite(id, sprite) {
    this.database.prepare(`
      UPDATE profiles
      SET sprite = ?
      WHERE id = ?
    `).run(sprite, id);
  }

  saveAuthSession(session) {
    this.database.prepare(`
      INSERT OR REPLACE INTO auth_sessions (token, profile_id, player_id, issued_at, expires_at, lease_expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      session.token,
      session.id,
      session.playerId,
      session.issuedAt,
      session.expiresAt,
      session.leaseExpiresAt,
    );
  }

  getAuthSession(token) {
    const row = this.database.prepare(`
      SELECT token, profile_id AS id, player_id AS playerId, issued_at AS issuedAt, expires_at AS expiresAt, lease_expires_at AS leaseExpiresAt
      FROM auth_sessions
      WHERE token = ?
    `).get(token);
    return row || null;
  }

  deleteAuthSession(token) {
    const existing = this.getAuthSession(token);
    if (!existing) return null;
    this.database.prepare(`DELETE FROM auth_sessions WHERE token = ?`).run(token);
    return existing;
  }

  listExpiredAuthSessionTokens(now) {
    return this.database.prepare(`
      SELECT token
      FROM auth_sessions
      WHERE expires_at <= ?
    `).all(now).map((row) => row.token);
  }

  getActiveToken(profileId) {
    const row = this.database.prepare(`
      SELECT token
      FROM active_profile_sessions
      WHERE profile_id = ?
    `).get(profileId);
    return row ? row.token : null;
  }

  setActiveToken(profileId, token) {
    this.database.prepare(`
      INSERT OR REPLACE INTO active_profile_sessions (profile_id, token)
      VALUES (?, ?)
    `).run(profileId, token);
  }

  clearActiveToken(profileId, token = null) {
    if (token) {
      this.database.prepare(`
        DELETE FROM active_profile_sessions
        WHERE profile_id = ? AND token = ?
      `).run(profileId, token);
      return;
    }

    this.database.prepare(`
      DELETE FROM active_profile_sessions
      WHERE profile_id = ?
    `).run(profileId);
  }

  // ── Hackathon: Messages ──

  insertMessage(msg) {
    this.database.prepare(`
      INSERT INTO messages (id, type, from_id, from_name, to_id, text, time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(msg.id, msg.type, msg.fromId, msg.fromName, msg.toId || null, msg.text, msg.time);
  }

  getMessages(type, limit = 20) {
    return this.database.prepare(`
      SELECT id, type, from_id AS fromId, from_name AS fromName, to_id AS toId, text, time
      FROM messages
      WHERE type = ?
      ORDER BY time DESC
      LIMIT ?
    `).all(type, limit);
  }

  // ── Hackathon: Products ──

  saveProduct(product) {
    this.database.prepare(`
      INSERT OR REPLACE INTO products (team_id, version, name, problem, solution, features, locked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      product.teamId,
      product.version,
      product.name || '',
      product.problem || '',
      product.solution || '',
      product.features || '',
      product.lockedAt || null,
    );
  }

  getProduct(teamId) {
    const row = this.database.prepare(`
      SELECT team_id AS teamId, version, name, problem, solution, features, locked_at AS lockedAt
      FROM products
      WHERE team_id = ?
    `).get(teamId);
    return row || null;
  }

  // ── Hackathon: Reviews ──

  saveReview(review) {
    this.database.prepare(`
      INSERT INTO reviews (judge_id, team_id, score, reason, favorite, wildest, time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      review.judgeId,
      review.teamId,
      review.score,
      review.reason || null,
      review.favorite || null,
      review.wildest || null,
      review.time,
    );
  }

  getReviews() {
    return this.database.prepare(`
      SELECT id, judge_id AS judgeId, team_id AS teamId, score, reason, favorite, wildest, time
      FROM reviews
      ORDER BY time DESC
    `).all();
  }

  // ── Hackathon: Canvas Pixels ──

  savePixel(pixel) {
    this.database.prepare(`
      INSERT OR REPLACE INTO canvas_pixels (x, y, color, agent_id, time)
      VALUES (?, ?, ?, ?, ?)
    `).run(pixel.x, pixel.y, pixel.color, pixel.agentId, pixel.time);
  }

  getAllPixels() {
    return this.database.prepare(`
      SELECT x, y, color, agent_id AS agentId, time
      FROM canvas_pixels
      ORDER BY time ASC
    `).all();
  }

  // ── Hackathon: Likes ──

  addLike(viewerId, agentId) {
    this.database.prepare(`
      INSERT OR IGNORE INTO likes (viewer_id, agent_id)
      VALUES (?, ?)
    `).run(viewerId, agentId);
  }

  removeLike(viewerId, agentId) {
    this.database.prepare(`
      DELETE FROM likes
      WHERE viewer_id = ? AND agent_id = ?
    `).run(viewerId, agentId);
  }

  hasLike(viewerId, agentId) {
    const row = this.database.prepare(`
      SELECT 1 FROM likes
      WHERE viewer_id = ? AND agent_id = ?
    `).get(viewerId, agentId);
    return !!row;
  }

  getLikeCount(agentId) {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS count FROM likes
      WHERE agent_id = ?
    `).get(agentId);
    return row ? row.count : 0;
  }

}

const sqliteStateStore = new SQLiteStateStore(DATABASE_FILE);

module.exports = {
  SQLiteStateStore,
  sqliteStateStore,
};
