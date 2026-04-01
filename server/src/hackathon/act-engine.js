'use strict';

const { HACKATHON_CONFIG } = require('../config/service-config');

/**
 * 0-10 幕定义
 */
const ACT_DEFINITIONS = [
  { act: 0,  name: '普通交流状态', skillUrl: HACKATHON_CONFIG.ACT0_SKILL_URL },
  { act: 1,  name: '自我介绍', skillUrl: '/skills/alicization-town/xtion-hackathon/act1.md' },
  { act: 2,  name: '组队偏好', skillUrl: '/skills/alicization-town/xtion-hackathon/act2.md' },
  { act: 3,  name: '分组',     skillUrl: '/skills/alicization-town/xtion-hackathon/act3.md' },
  { act: 4,  name: '头脑风暴', skillUrl: '/skills/alicization-town/xtion-hackathon/act4.md' },
  { act: 5,  name: '产品打磨', skillUrl: '/skills/alicization-town/xtion-hackathon/act5.md' },
  { act: 6,  name: '人类代言', skillUrl: '/skills/alicization-town/xtion-hackathon/act6.md' },
  { act: 7,  name: '评审',     skillUrl: '/skills/alicization-town/xtion-hackathon/act7.md' },
  { act: 8,  name: '颁奖',     skillUrl: '/skills/alicization-town/xtion-hackathon/act8.md' },
  { act: 9,  name: '共创画布', skillUrl: '/skills/alicization-town/xtion-hackathon/act9.md' },
  { act: 10, name: '闭幕',     skillUrl: '/skills/alicization-town/xtion-hackathon/act10.md' },
];

const VALID_AGENT_IDS = ['stem', 'dunangnang', 'hailaoyuan', 'chenxingzhou', 'juanniu', 'xiaoj', 'xiahuang'];
const DEFAULT_ACT_STAGE_SCENE = {
  center: { x: 64, y: 28 },
  focusZoom: 2.2,
  settleMs: 1200,
  introHoldMs: 7000,
  closingHoldMs: 1800,
};
const DEFAULT_ACT1_INTROS = {
  qianzi: {
    title: '钳子',
    text: '大家好，我是钳子。',
  },
  paopao: {
    title: '泡泡',
    text: '大家好，我是泡泡。',
  },
  jiajia: {
    title: '夹夹',
    text: '大家好，我是夹夹。',
  },
};

function resolveActStageScene() {
  return {
    ...DEFAULT_ACT_STAGE_SCENE,
    ...(HACKATHON_CONFIG.ACT_STAGE_SCENE || {}),
    center: {
      ...DEFAULT_ACT_STAGE_SCENE.center,
      ...((HACKATHON_CONFIG.ACT_STAGE_SCENE && HACKATHON_CONFIG.ACT_STAGE_SCENE.center) || {}),
    },
  };
}

function resolveAct1ScriptOrder() {
  const order = Array.isArray(HACKATHON_CONFIG.ACT1_SCRIPT_ORDER) && HACKATHON_CONFIG.ACT1_SCRIPT_ORDER.length > 0
    ? HACKATHON_CONFIG.ACT1_SCRIPT_ORDER
    : VALID_AGENT_IDS;
  return order.filter(Boolean);
}

function resolveAct1Intro(agentId) {
  const introMap = HACKATHON_CONFIG.ACT1_INTROS || DEFAULT_ACT1_INTROS;
  return introMap[agentId] || DEFAULT_ACT1_INTROS[agentId] || {
    title: agentId,
    text: `${agentId} 登台发言。`,
  };
}

class ActEngine {
  /**
   * @param {import('socket.io').Server} io
   */
  constructor(io) {
    this.io = io;

    /** Current act number (0 = not started) */
    this._currentAct = 0;
    /** Current act name */
    this._currentName = '普通交流状态';
    /** Current act skillUrl */
    this._currentSkillUrl = HACKATHON_CONFIG.ACT0_SKILL_URL;
    this._currentScene = { active: false, mode: 'free' };

    // --- Act 1: speaker queue state ---
    this._speakerOrder = null;
    this._speakerIndex = -1;
    this._speakerTimer = null;
    this._pendingTimers = new Set();
    this._actRunId = 0;

    // --- Act 2: preference state (stub, implemented in 5.3) ---
    this._preferences = null;
    this._pendingAutoGroups = null;
    this._pendingAutoMatchMeta = null;

    // --- Act 3: grouping state (stub, implemented in 5.4) ---
    this._groups = null;

    /** @type {import('./room-mgr')|null} */
    this._roomMgr = null;

    /** @type {import('./review-mgr')|null} */
    this._reviewMgr = null;

    /** @type {import('./player-mgr')|null} */
    this._playerMgr = null;

    this._msgRouter = null;
    this._worldEngine = null;
  }

  /**
   * Set a reference to the RoomMgr for automatic room creation after grouping.
   * @param {import('./room-mgr')} roomMgr
   */
  setRoomMgr(roomMgr) {
    this._roomMgr = roomMgr;
  }

  /**
   * Set a reference to the ReviewMgr for act 8 awards calculation.
   * @param {import('./review-mgr')} reviewMgr
   */
  setReviewMgr(reviewMgr) {
    this._reviewMgr = reviewMgr;
  }

  /**
   * Set a reference to the PlayerMgr for act 8 awards calculation.
   * @param {import('./player-mgr')} playerMgr
   */
  setPlayerMgr(playerMgr) {
    this._playerMgr = playerMgr;
  }

  setMsgRouter(msgRouter) {
    this._msgRouter = msgRouter;
  }

  setWorldEngine(worldEngine) {
    this._worldEngine = worldEngine;
  }


  /**
   * Switch to the specified act number (0-10).
   * Cleans up previous act state, updates current state, and broadcasts act:changed.
   * When switching to act 1, initializes the speaker queue and starts the timer.
   * @param {number} actNumber - Act number 0-10
   * @returns {{ act: number, name: string, skillUrl: string }|null} New state, or null if invalid
   */
  setAct(actNumber) {
    const num = Number(actNumber);
    if (!Number.isInteger(num) || num < 0 || num > 10) {
      return null;
    }

    // Clean up previous act
    this._cleanupPreviousAct();

    // Look up definition
    const def = ACT_DEFINITIONS.find((item) => item.act === num);
    if (!def) {
      return null;
    }
    this._currentAct = def.act;
    this._currentName = def.name;
    this._currentSkillUrl = def.skillUrl;

    // Build event payload
    const payload = { act: def.act, name: def.name, skillUrl: def.skillUrl };

    if (num === 0) {
      this._currentScene = { active: false, mode: 'free' };
      this.io.emit('act:changed', payload);
      this.io.emit('act:scene', this._currentScene);
      return payload;
    }

    // Act 2: initialize preferences collection
    if (num === 2) {
      this._preferences = {};
      this._pendingAutoGroups = null;
      this._pendingAutoMatchMeta = null;
    }

    // Act 3: initialize groups state
    if (num === 3) {
      this._groups = this._pendingAutoGroups
        ? {
            teamA: [...this._pendingAutoGroups.teamA],
            teamB: [...this._pendingAutoGroups.teamB],
          }
        : null;
    }

    // Act 8: trigger awards calculation
    if (num === 8) {
      this._computeAndBroadcastAwards();
    }

    // Act 1: initialize scripted speaker queue
    if (num === 1) {
      this._speakerOrder = resolveAct1ScriptOrder();
      this._speakerIndex = -1;
      payload.speakerOrder = this._speakerOrder;
    }

    // Broadcast act:changed to all connected clients
    this.io.emit('act:changed', payload);

    if (num === 3 && this._groups) {
      this._finalizeGroups(this._groups, {
        autoMatched: true,
        matching: this._pendingAutoMatchMeta,
      });
      this._pendingAutoGroups = null;
      this._pendingAutoMatchMeta = null;
    }

    if (num === 1) {
      this._startAct1ScriptedSequence();
    }

    return payload;
  }

  /**
   * Returns the current act state.
   * @returns {{ act: number, name: string, skillUrl: string|null }}
   */
  getState() {
    return {
      act: this._currentAct,
      name: this._currentName,
      skillUrl: this._currentSkillUrl,
      scene: this._currentScene,
    };
  }

  /**
   * Check if the platform is in act 0 (not started).
   * When act is 0, only admin:setAct and act:query are allowed.
   * @returns {boolean} true if act is 0
   */
  isActZero() {
    return this._currentAct === 0;
  }

  /**
   * Clean up timers and temporary state from the previous act.
   */
  _cleanupPreviousAct() {
    // Clear Act 1 speaker timer
    if (this._speakerTimer) {
      clearTimeout(this._speakerTimer);
      this._speakerTimer = null;
    }
    this._pendingTimers.forEach((timer) => clearTimeout(timer));
    this._pendingTimers.clear();
    this._actRunId += 1;

    // Reset Act 1 speaker queue
    this._speakerOrder = null;
    this._speakerIndex = -1;
    this._currentScene = { active: false, mode: 'free' };

    // Reset Act 2 preferences
    this._preferences = null;

    // Note: _groups is NOT reset here — groups persist across acts
    // because they are used by RoomMgr, ProductMgr, and act 8 awards.
  }

  /**
   * Advance to the next speaker in the Act 1 queue.
   * If all speakers are done, clears the timer and stops.
   * Otherwise broadcasts act:speakerNext and starts a new 45-second timer.
   */
  _nextSpeaker() {
    if (!this._speakerOrder) {
      return;
    }
    this._speakerIndex += 1;
    if (this._speakerIndex >= this._speakerOrder.length) {
      return;
    }
    this.io.emit('act:speakerNext', {
      currentSpeaker: this._speakerOrder[this._speakerIndex],
      speakerIndex: this._speakerIndex,
      scripted: this._currentAct === 1,
    });
  }

  /**
   * Check if the given agentId is the current speaker (Act 1).
   * Returns true only when act is 1, speaker queue is active, and agentId matches.
   * @param {string} agentId
   * @returns {boolean}
   */
  isCurrentSpeaker(agentId) {
    if (this._currentAct !== 1 || !this._speakerOrder) {
      return false;
    }
    // If all speakers are done, no one is the current speaker
    if (this._speakerIndex >= this._speakerOrder.length) {
      return false;
    }
    return this._speakerOrder[this._speakerIndex] === agentId;
  }

  _startAct1ScriptedSequence() {
    const runId = this._actRunId;
    const stageScene = resolveActStageScene();
    this._currentScene = {
      active: true,
      mode: 'intro',
      phase: 'opening',
      background: 'white',
      focusZoom: stageScene.focusZoom,
      manualAdvance: true,
    };
    this.io.emit('act:scene', this._currentScene);
    this._schedule(() => this.advanceAct1Speaker(), 600);
  }

  advanceAct1Speaker() {
    const runId = this._actRunId;
    if (!this._isRunActive(runId) || !this._speakerOrder) {
      return { error: '当前不是自我介绍阶段' };
    }

    if (this._speakerIndex >= this._speakerOrder.length - 1) {
      this._showAct1Closing(runId);
      return { success: true, phase: 'closing' };
    }

    this._runAct1Speaker(runId);
    return { success: true, phase: 'focus' };
  }

  async _runAct1Speaker(runId) {
    if (!this._isRunActive(runId) || !this._speakerOrder) {
      return;
    }

    this._nextSpeaker();
    const agentId = this._speakerOrder[this._speakerIndex];
    if (!agentId) {
      return;
    }

    const intro = resolveAct1Intro(agentId);
    const stageScene = resolveActStageScene();
    const stage = stageScene.center;

    this._currentScene = {
      active: true,
      mode: 'intro',
      phase: 'focus',
      background: 'white',
      focusZoom: stageScene.focusZoom,
      manualAdvance: true,
      speakerIndex: this._speakerIndex,
      speakerTotal: this._speakerOrder.length,
      agentId,
      title: intro.title,
      text: intro.text,
      stage,
      returnAct: 0,
    };
    this.io.emit('act:scene', this._currentScene);

    await this._moveAgentToStage(agentId, stage);
    if (!this._isRunActive(runId)) {
      return;
    }

    this._schedule(() => {
      if (!this._isRunActive(runId)) return;
      if (this._msgRouter) {
        this._msgRouter.broadcastScripted(agentId, intro.text, {
          act: 1,
          introTitle: intro.title,
        });
      }
    }, stageScene.settleMs);
  }

  _showAct1Closing(runId) {
    if (!this._isRunActive(runId)) {
      return;
    }

    this._currentScene = {
      active: true,
      mode: 'intro',
      phase: 'closing',
      background: 'white',
      manualAdvance: true,
      title: '第一幕结束',
      text: '自我介绍已完成，舞台回到普通交流状态。',
      returnAct: 0,
    };
    this.io.emit('act:scene', this._currentScene);
    this._schedule(() => {
      if (this._isRunActive(runId) && this._currentAct === 1) {
        this.setAct(0);
      }
    }, resolveActStageScene().closingHoldMs);
  }

  async _moveAgentToStage(agentId, stage) {
    if (!this._worldEngine || !stage) return;
    try {
      await this._worldEngine.move(agentId, stage);
    } catch (_) {
      return;
    }
  }

  _schedule(fn, delayMs) {
    const timer = setTimeout(() => {
      this._pendingTimers.delete(timer);
      fn();
    }, delayMs);
    this._pendingTimers.add(timer);
    return timer;
  }

  _isRunActive(runId) {
    return this._currentAct === 1 && this._actRunId === runId;
  }

  /**
   * Submit a team preference for Act 2.
   * Validates inputs and stores the preference. When all 3 agents have submitted,
   * broadcasts act2:preferences with the full preferences data.
   * @param {string} agentId - The submitting agent's ID
   * @param {{ wantMost: string, wantLeast: string, reason: string }} pref
   * @returns {{ success: boolean }|{ error: string }}
   */
  submitPreference(agentId, { wantMost, wantLeast, reason }) {
    // Must be in act 2
    if (this._currentAct !== 2) {
      return { error: '当前不是第二幕' };
    }

    // Validate wantMost is a valid agent ID
    if (!VALID_AGENT_IDS.includes(wantMost)) {
      return { error: 'wantMost 不是有效的选手 ID' };
    }

    // Validate wantLeast is a valid agent ID
    if (!VALID_AGENT_IDS.includes(wantLeast)) {
      return { error: 'wantLeast 不是有效的选手 ID' };
    }

    // Cannot pick yourself
    if (wantMost === agentId) {
      return { error: 'wantMost 不能是自己' };
    }
    if (wantLeast === agentId) {
      return { error: 'wantLeast 不能是自己' };
    }

    // wantMost and wantLeast must be different
    if (wantMost === wantLeast) {
      return { error: 'wantMost 和 wantLeast 不能相同' };
    }

    // Store preference
    this._preferences[agentId] = { wantMost, wantLeast, reason };

    // Check if all 3 agents have submitted
    if (Object.keys(this._preferences).length === VALID_AGENT_IDS.length) {
      const autoMatch = this._buildAutoMatchResult(this._preferences);
      this._pendingAutoGroups = autoMatch.groups;
      this._pendingAutoMatchMeta = autoMatch.matching;
      this.io.emit('act2:preferences', {
        preferences: this._preferences,
        suggestedGroups: autoMatch.groups,
        matching: autoMatch.matching,
      });
      this._schedule(() => {
        if (this._currentAct === 2 && this._pendingAutoGroups) {
          this.setAct(3);
        }
      }, HACKATHON_CONFIG.ACT2_AUTO_ADVANCE_MS);
    }

    return { success: true };
  }

  /**
   * Submit the grouping decision for Act 3.
   * Accepts a 2+1 split: one team of 2 and one team of 1, covering all 3 agents.
   * Stores the result in _groups and broadcasts act3:grouped.
   * Player reactions after grouping are broadcast-only and do not change the result.
   * @param {{ teamA: string[], teamB: string[] }} groups
   * @returns {{ success: boolean }|{ error: string }}
   */
  submitGroup({ teamA, teamB }) {
    // Must be in act 3
    if (this._currentAct !== 3) {
      return { error: '当前不是第三幕' };
    }

    // Validate teamA and teamB are arrays
    if (!Array.isArray(teamA) || !Array.isArray(teamB)) {
      return { error: 'teamA 和 teamB 必须是数组' };
    }

    // Validate 2+1 split: one team of 2, one team of 1
    const sizes = [teamA.length, teamB.length].sort();
    if (sizes[0] !== 1 || sizes[1] !== 2) {
      return { error: '必须是 2+1 分组模式' };
    }

    // Validate all IDs are valid agent IDs
    const allIds = [...teamA, ...teamB];
    for (const id of allIds) {
      if (!VALID_AGENT_IDS.includes(id)) {
        return { error: `无效的选手 ID: ${id}` };
      }
    }

    // Validate all 3 agents are accounted for (no duplicates, no missing)
    const uniqueIds = new Set(allIds);
    if (uniqueIds.size !== VALID_AGENT_IDS.length) {
      return { error: '必须包含所有三位选手且不重复' };
    }

    this._pendingAutoGroups = null;
    this._pendingAutoMatchMeta = null;
    this._groups = { teamA: [...teamA], teamB: [...teamB] };
    this._finalizeGroups(this._groups);

    return { success: true };
  }

  _finalizeGroups(groups, extras = {}) {
    if (this._roomMgr) {
      this._roomMgr.createFromGroups(groups);
    }
    this.io.emit('act3:grouped', { groups, ...extras });
  }

  _buildAutoMatchResult(preferences) {
    const candidatePairs = [
      ['qianzi', 'paopao'],
      ['qianzi', 'jiajia'],
      ['paopao', 'jiajia'],
    ];

    const scoredPairs = candidatePairs.map(([left, right]) => {
      const leftPref = preferences[left];
      const rightPref = preferences[right];
      let score = 0;
      let mutualWant = false;
      let positiveEdges = 0;
      let negativeEdges = 0;

      if (leftPref?.wantMost === right) {
        score += 3;
        positiveEdges += 1;
      }
      if (rightPref?.wantMost === left) {
        score += 3;
        positiveEdges += 1;
      }
      if (leftPref?.wantLeast === right) {
        score -= 4;
        negativeEdges += 1;
      }
      if (rightPref?.wantLeast === left) {
        score -= 4;
        negativeEdges += 1;
      }

      mutualWant = leftPref?.wantMost === right && rightPref?.wantMost === left;
      if (mutualWant) {
        score += 2;
      }

      const solo = VALID_AGENT_IDS.find((id) => id !== left && id !== right);
      const pairKey = [left, right].sort().join(':');

      return {
        pair: [left, right],
        solo,
        score,
        mutualWant,
        positiveEdges,
        negativeEdges,
        pairKey,
      };
    });

    scoredPairs.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (Number(b.mutualWant) !== Number(a.mutualWant)) return Number(b.mutualWant) - Number(a.mutualWant);
      if (b.positiveEdges !== a.positiveEdges) return b.positiveEdges - a.positiveEdges;
      if (a.negativeEdges !== b.negativeEdges) return a.negativeEdges - b.negativeEdges;
      return a.pairKey.localeCompare(b.pairKey);
    });

    const best = scoredPairs[0];
    return {
      groups: {
        teamA: [...best.pair],
        teamB: [best.solo],
      },
      matching: {
        algorithm: 'preference-score',
        pairScore: best.score,
        mutualWant: best.mutualWant,
        positiveEdges: best.positiveEdges,
        negativeEdges: best.negativeEdges,
        chosenPair: [...best.pair],
        soloAgent: best.solo,
      },
    };
  }

  /**
   * Compute and broadcast act 8 awards.
   * Calculates AI review champion (highest avg score team) and
   * human likes champion (highest total likes team).
   * Compares the two rankings for consistency and broadcasts act8:awards.
   */
  _computeAndBroadcastAwards() {
    const groups = this._groups;
    if (!groups) {
      // No groups available — broadcast empty awards
      this.io.emit('act8:awards', {
        aiChampion: null,
        likesChampion: null,
        consistency: null,
        aiRanking: [],
        likesRanking: [],
      });
      return;
    }

    const teams = { teamA: groups.teamA, teamB: groups.teamB };

    // --- AI Review Ranking ---
    const aiRanking = this._computeAIRanking(teams);

    // --- Human Likes Ranking ---
    const likesRanking = this._computeLikesRanking(teams);

    // Determine champions
    const aiChampion = aiRanking.length > 0 ? aiRanking[0].teamId : null;
    const likesChampion = likesRanking.length > 0 ? likesRanking[0].teamId : null;

    // Compare ranking consistency
    const consistency = this._computeConsistency(aiRanking, likesRanking);

    this.io.emit('act8:awards', {
      aiChampion,
      likesChampion,
      consistency,
      aiRanking,
      likesRanking,
    });
  }

  /**
   * Compute AI review ranking: average score per team, sorted descending.
   * @param {{ teamA: string[], teamB: string[] }} teams
   * @returns {{ teamId: string, avgScore: number, totalScore: number, reviewCount: number }[]}
   */
  _computeAIRanking(teams) {
    const ranking = [];

    for (const [teamId, members] of Object.entries(teams)) {
      let totalScore = 0;
      let reviewCount = 0;

      if (this._reviewMgr && this._reviewMgr.db) {
        const allReviews = this._reviewMgr.db.getReviews();
        for (const review of allReviews) {
          if (review.teamId === teamId) {
            totalScore += review.score;
            reviewCount++;
          }
        }
      }

      const avgScore = reviewCount > 0 ? totalScore / reviewCount : 0;
      ranking.push({ teamId, avgScore, totalScore, reviewCount });
    }

    // Sort descending by avgScore
    ranking.sort((a, b) => b.avgScore - a.avgScore);
    return ranking;
  }

  /**
   * Compute human likes ranking: total likes per team, sorted descending.
   * Team likes = sum of likes for all players in that team.
   * @param {{ teamA: string[], teamB: string[] }} teams
   * @returns {{ teamId: string, totalLikes: number }[]}
   */
  _computeLikesRanking(teams) {
    const ranking = [];

    for (const [teamId, members] of Object.entries(teams)) {
      let totalLikes = 0;

      if (this._playerMgr) {
        for (const agentId of members) {
          const player = this._playerMgr.getPlayer(agentId);
          if (player) {
            totalLikes += player.likes;
          }
        }
      }

      ranking.push({ teamId, totalLikes });
    }

    // Sort descending by totalLikes
    ranking.sort((a, b) => b.totalLikes - a.totalLikes);
    return ranking;
  }

  /**
   * Compare AI ranking and likes ranking for consistency.
   * Returns an object describing whether the two rankings agree.
   * @param {{ teamId: string }[]} aiRanking
   * @param {{ teamId: string }[]} likesRanking
   * @returns {{ match: boolean, description: string }}
   */
  _computeConsistency(aiRanking, likesRanking) {
    if (aiRanking.length === 0 || likesRanking.length === 0) {
      return { match: false, description: '排名数据不足，无法对比' };
    }

    const aiOrder = aiRanking.map(r => r.teamId);
    const likesOrder = likesRanking.map(r => r.teamId);

    const match = aiOrder.length === likesOrder.length &&
      aiOrder.every((id, i) => id === likesOrder[i]);

    if (match) {
      return { match: true, description: 'AI 评分排名与人类点赞排名完全一致' };
    }

    return { match: false, description: 'AI 评分排名与人类点赞排名不一致' };
  }



}

module.exports = ActEngine;
module.exports.ACT_DEFINITIONS = ACT_DEFINITIONS;
module.exports.VALID_AGENT_IDS = VALID_AGENT_IDS;
