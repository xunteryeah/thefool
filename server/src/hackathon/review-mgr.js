'use strict';

const { HACKATHON_CONFIG } = require('../config/service-config');

const { REVIEW_SCORE_MIN, REVIEW_SCORE_MAX } = HACKATHON_CONFIG;

/**
 * ReviewMgr — 评审系统模块
 *
 * 处理 AI 评委的评分提交、存储和汇总查询。
 * - submit(socket, data): 校验 score 范围，存储评审记录，广播 review:new
 * - query(socket): 按队伍汇总评审数据（平均分 + 评审详情），返回 review:summary
 */
class ReviewMgr {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('../persistence/sqlite-state-store').SQLiteStateStore} db
   */
  constructor(io, db) {
    this.io = io;
    this.db = db;
  }

  /**
   * 提交评审（score 1-10）
   * - 校验 score 在 [REVIEW_SCORE_MIN, REVIEW_SCORE_MAX] 范围内
   * - 存储评审记录到内存和 SQLite
   * - 广播 review:new 事件给所有客户端
   * @param {import('socket.io').Socket} socket
   * @param {{ teamId: string, score: number, reason: string, favorite: string, wildest: string }} data
   */
  submit(socket, { teamId, score, reason, favorite, wildest }) {
    // Validate score range
    if (typeof score !== 'number' || score < REVIEW_SCORE_MIN || score > REVIEW_SCORE_MAX) {
      socket.emit('error', { message: '分数范围 1-10' });
      return;
    }

    // Derive judgeId from socket identity
    const judgeId = (socket.identity && (socket.identity.agentId || socket.identity.name)) || 'unknown';

    const record = {
      judgeId,
      teamId,
      score,
      reason: reason || null,
      favorite: favorite || null,
      wildest: wildest || null,
      time: Date.now(),
    };

    // Persist to SQLite
    this.db.saveReview(record);

    // Broadcast review:new to all clients
    this.io.emit('review:new', record);
  }

  /**
   * 按队伍汇总评审数据
   * - 从 SQLite 读取所有评审记录
   * - 按 teamId 分组，计算平均分，附带所有评审详情
   * - 通过 review:summary 返回给请求者
   * @param {import('socket.io').Socket} socket
   */
  query(socket) {
    const allReviews = this.db.getReviews();

    // Group by teamId
    const teamMap = new Map();
    for (const r of allReviews) {
      if (!teamMap.has(r.teamId)) {
        teamMap.set(r.teamId, []);
      }
      teamMap.get(r.teamId).push(r);
    }

    // Build summary array
    const summary = [];
    for (const [teamId, reviews] of teamMap) {
      const totalScore = reviews.reduce((sum, r) => sum + r.score, 0);
      const avgScore = reviews.length > 0 ? totalScore / reviews.length : 0;
      summary.push({
        teamId,
        avgScore,
        reviews,
      });
    }

    socket.emit('review:summary', summary);
  }
}

module.exports = ReviewMgr;
