'use strict';

const { HACKATHON_CONFIG } = require('../config/service-config');

const { CANVAS_SIZE, CANVAS_DRAW_RATE } = HACKATHON_CONFIG;

const MOOD_PALETTES = {
  happy: ['#FF6B6B', '#FFE66D', '#FF8E53', '#FFA07A', '#FFD700'],
  sad:   ['#4A90D9', '#5B7DB1', '#6C8EBF', '#87CEEB', '#B0C4DE'],
  angry: ['#DC143C', '#8B0000', '#FF4500', '#2F0000', '#CC0000'],
  calm:  ['#98D8C8', '#B8E6D0', '#C8E6C9', '#E8F5E9', '#F0FFF0'],
};

const DEFAULT_COLOR = '#FFFFFF';

class CanvasMgr {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('../persistence/sqlite-state-store').SQLiteStateStore} db
   */
  constructor(io, db) {
    this.io = io;
    this.db = db;

    /** @type {string[]} flat array of 1024 hex color strings */
    this._pixels = new Array(CANVAS_SIZE * CANVAS_SIZE).fill(DEFAULT_COLOR);

    /** @type {Map<string, number[]>} agentId → array of draw timestamps */
    this._drawTimestamps = new Map();

    // Restore persisted pixels from SQLite
    this._restoreFromDb();
  }

  /**
   * Restore canvas state from SQLite on startup
   */
  _restoreFromDb() {
    if (!this.db) return;
    try {
      const rows = this.db.getAllPixels();
      for (const row of rows) {
        const idx = row.y * CANVAS_SIZE + row.x;
        if (idx >= 0 && idx < this._pixels.length) {
          this._pixels[idx] = row.color;
        }
      }
    } catch (_) {
      // If DB read fails, start with blank canvas
    }
  }

  /**
   * Draw a pixel on the canvas.
   * Validates coordinates, palette membership, and rate limit.
   * @param {import('socket.io').Socket} socket
   * @param {{ x: number, y: number, color: string }} data
   * @param {import('./player-mgr')} playerMgr
   */
  draw(socket, { x, y, color }, playerMgr) {
    const agentId = socket.identity && socket.identity.agentId;
    if (!agentId) return;

    // Validate coordinates [0, 31] — silently drop invalid
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE) return;

    // Get player's current mood palette
    const player = playerMgr && playerMgr.getPlayer(agentId);
    if (!player) return;

    const palette = MOOD_PALETTES[player.mood];
    if (!palette) return;

    // Validate color belongs to player's mood palette — emit error if not
    if (!palette.includes(color)) {
      socket.emit('error', {
        message: `当前心情只能使用: ${palette.join(', ')}`,
      });
      return;
    }

    // Rate limit: max CANVAS_DRAW_RATE pixels per second per agent
    const now = Date.now();
    if (!this._drawTimestamps.has(agentId)) {
      this._drawTimestamps.set(agentId, []);
    }
    const timestamps = this._drawTimestamps.get(agentId);

    // Remove timestamps older than 1 second
    const windowStart = now - 1000;
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= CANVAS_DRAW_RATE) {
      // Rate exceeded — silently drop
      return;
    }

    timestamps.push(now);

    // Update canvas
    const idx = y * CANVAS_SIZE + x;
    this._pixels[idx] = color;

    // Broadcast pixel change
    this.io.emit('canvas:pixel', { x, y, color, agentId, time: now });

    // Persist to SQLite
    if (this.db) {
      try {
        this.db.savePixel({ x, y, color, agentId, time: now });
      } catch (_) {
        // Log failure but don't block the operation
      }
    }
  }

  /**
   * Return the full canvas state to the requesting socket.
   * @param {import('socket.io').Socket} socket
   */
  sync(socket) {
    socket.emit('canvas:state', {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      pixels: [...this._pixels],
    });
  }
}

module.exports = CanvasMgr;
