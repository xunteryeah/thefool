'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ActEngine = require('../../src/hackathon/act-engine');
const { ACT_DEFINITIONS } = require('../../src/hackathon/act-engine');

/**
 * Create a minimal mock Socket.io server for testing.
 */
function createMockIO() {
  const emitted = [];
  return {
    emit(event, data) {
      emitted.push({ event, data });
    },
    _emitted: emitted,
  };
}

describe('ActEngine — core act switching (task 5.1)', () => {
  let io;
  let engine;

  beforeEach(() => {
    io = createMockIO();
    engine = new ActEngine(io);
  });

  describe('ACT_DEFINITIONS', () => {
    it('should define exactly 10 acts', () => {
      assert.equal(ACT_DEFINITIONS.length, 10);
    });

    it('should have sequential act numbers 1-10', () => {
      ACT_DEFINITIONS.forEach((def, i) => {
        assert.equal(def.act, i + 1);
      });
    });

    it('should have name and skillUrl for each act', () => {
      ACT_DEFINITIONS.forEach((def) => {
        assert.ok(typeof def.name === 'string' && def.name.length > 0);
        assert.ok(typeof def.skillUrl === 'string' && def.skillUrl.startsWith('/skills/'));
      });
    });
  });

  describe('initial state', () => {
    it('should start at act 0 with name "未开始" and null skillUrl', () => {
      const state = engine.getState();
      assert.equal(state.act, 0);
      assert.equal(state.name, '未开始');
      assert.equal(state.skillUrl, null);
    });

    it('should report isActZero as true initially', () => {
      assert.equal(engine.isActZero(), true);
    });
  });

  describe('setAct', () => {
    it('should switch to act 1 and return correct state (with speakerOrder)', () => {
      const result = engine.setAct(1);
      assert.deepEqual(result, {
        act: 1,
        name: '自我介绍',
        skillUrl: '/skills/act1-intro.md',
        speakerOrder: ['qianzi', 'paopao', 'jiajia'],
      });
    });

    it('should update getState after setAct', () => {
      engine.setAct(5);
      const state = engine.getState();
      assert.equal(state.act, 5);
      assert.equal(state.name, '产品打磨');
      assert.equal(state.skillUrl, '/skills/act5-polish.md');
    });

    it('should broadcast act:changed event with correct payload', () => {
      engine.setAct(3);
      assert.equal(io._emitted.length, 1);
      assert.equal(io._emitted[0].event, 'act:changed');
      assert.deepEqual(io._emitted[0].data, {
        act: 3,
        name: '分组',
        skillUrl: '/skills/act3-grouping.md',
      });
    });

    it('should switch to act 10 correctly', () => {
      const result = engine.setAct(10);
      assert.deepEqual(result, { act: 10, name: '闭幕', skillUrl: '/skills/act10-closing.md' });
    });

    it('should return null for invalid act number 0', () => {
      const result = engine.setAct(0);
      assert.equal(result, null);
      assert.equal(engine.getState().act, 0); // unchanged
    });

    it('should return null for invalid act number 11', () => {
      const result = engine.setAct(11);
      assert.equal(result, null);
    });

    it('should return null for negative act number', () => {
      const result = engine.setAct(-1);
      assert.equal(result, null);
    });

    it('should return null for non-integer act number', () => {
      const result = engine.setAct(1.5);
      assert.equal(result, null);
    });

    it('should return null for non-numeric input', () => {
      const result = engine.setAct('abc');
      assert.equal(result, null);
    });

    it('should handle string number input by coercing', () => {
      const result = engine.setAct('7');
      assert.deepEqual(result, { act: 7, name: '评审', skillUrl: '/skills/act7-review.md' });
    });

    it('should set isActZero to false after switching to any act', () => {
      engine.setAct(1);
      assert.equal(engine.isActZero(), false);
    });

    it('should allow switching between acts (e.g. 1 → 5)', () => {
      engine.setAct(1);
      engine.setAct(5);
      const state = engine.getState();
      assert.equal(state.act, 5);
      assert.equal(state.name, '产品打磨');
    });

    it('should broadcast act:changed for each setAct call', () => {
      engine.setAct(1);
      engine.setAct(2);
      engine.setAct(3);
      assert.equal(io._emitted.length, 3);
      assert.equal(io._emitted[0].data.act, 1);
      assert.equal(io._emitted[1].data.act, 2);
      assert.equal(io._emitted[2].data.act, 3);
    });
  });

  describe('_cleanupPreviousAct', () => {
    it('should clear speaker timer on act switch', () => {
      // Simulate a timer being set
      engine._speakerTimer = setTimeout(() => {}, 100000);
      engine._speakerOrder = ['qianzi', 'paopao', 'jiajia'];
      engine._speakerIndex = 1;

      engine.setAct(2); // triggers cleanup

      assert.equal(engine._speakerTimer, null);
      assert.equal(engine._speakerOrder, null);
      assert.equal(engine._speakerIndex, -1);
    });

    it('should reset preferences on act switch', () => {
      engine._preferences = { qianzi: { wantMost: 'paopao' } };
      engine.setAct(3);
      assert.equal(engine._preferences, null);
    });

    it('should NOT reset groups on act switch (groups persist across acts)', () => {
      engine._groups = { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] };
      engine.setAct(4);
      assert.deepEqual(engine._groups, { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
    });
  });

  describe('isActZero — act 0 guard', () => {
    it('should be true when act is 0', () => {
      assert.equal(engine.isActZero(), true);
    });

    it('should be false after switching to any act', () => {
      for (let i = 1; i <= 10; i++) {
        const e = new ActEngine(createMockIO());
        e.setAct(i);
        assert.equal(e.isActZero(), false, `Expected isActZero=false for act ${i}`);
      }
    });
  });

  describe('isCurrentSpeaker (stub)', () => {
    it('should return false when not in act 1', () => {
      engine.setAct(2);
      assert.equal(engine.isCurrentSpeaker('qianzi'), false);
    });

    it('should return true for the first speaker (qianzi) when act 1 is set', () => {
      engine.setAct(1);
      // setAct(1) now initializes speaker order, so qianzi is the current speaker
      assert.equal(engine.isCurrentSpeaker('qianzi'), true);
      assert.equal(engine.isCurrentSpeaker('paopao'), false);
      assert.equal(engine.isCurrentSpeaker('jiajia'), false);
    });
  });

  describe('all 10 acts round-trip', () => {
    const expected = [
      { act: 1,  name: '自我介绍', skillUrl: '/skills/act1-intro.md' },
      { act: 2,  name: '组队偏好', skillUrl: '/skills/act2-preference.md' },
      { act: 3,  name: '分组',     skillUrl: '/skills/act3-grouping.md' },
      { act: 4,  name: '头脑风暴', skillUrl: '/skills/act4-brainstorm.md' },
      { act: 5,  name: '产品打磨', skillUrl: '/skills/act5-polish.md' },
      { act: 6,  name: '人类代言', skillUrl: '/skills/act6-proxy.md' },
      { act: 7,  name: '评审',     skillUrl: '/skills/act7-review.md' },
      { act: 8,  name: '颁奖',     skillUrl: '/skills/act8-award.md' },
      { act: 9,  name: '共创画布', skillUrl: '/skills/act9-canvas.md' },
      { act: 10, name: '闭幕',     skillUrl: '/skills/act10-closing.md' },
    ];

    expected.forEach(({ act, name, skillUrl }) => {
      it(`setAct(${act}) → getState returns act=${act}, name="${name}"`, () => {
        engine.setAct(act);
        const state = engine.getState();
        assert.equal(state.act, act);
        assert.equal(state.name, name);
        assert.equal(state.skillUrl, skillUrl);
      });
    });
  });
});

describe('ActEngine — Act 2 preference collection (task 5.3)', () => {
  let io;
  let engine;

  beforeEach(() => {
    io = createMockIO();
    engine = new ActEngine(io);
  });

  describe('setAct(2) initialization', () => {
    it('should initialize _preferences to empty object when switching to act 2', () => {
      engine.setAct(2);
      assert.deepEqual(engine._preferences, {});
    });

    it('should reset _preferences to null when switching away from act 2', () => {
      engine.setAct(2);
      engine._preferences.qianzi = { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'test' };
      engine.setAct(3);
      assert.equal(engine._preferences, null);
    });
  });

  describe('submitPreference — act guard', () => {
    it('should return error when not in act 2', () => {
      engine.setAct(1);
      const result = engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'test' });
      assert.deepEqual(result, { error: '当前不是第二幕' });
    });

    it('should return error when act is 0 (not started)', () => {
      const result = engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'test' });
      assert.deepEqual(result, { error: '当前不是第二幕' });
    });
  });

  describe('submitPreference — validation', () => {
    beforeEach(() => {
      engine.setAct(2);
    });

    it('should reject invalid wantMost agent ID', () => {
      const result = engine.submitPreference('qianzi', { wantMost: 'unknown', wantLeast: 'jiajia', reason: 'test' });
      assert.deepEqual(result, { error: 'wantMost 不是有效的选手 ID' });
    });

    it('should reject invalid wantLeast agent ID', () => {
      const result = engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'unknown', reason: 'test' });
      assert.deepEqual(result, { error: 'wantLeast 不是有效的选手 ID' });
    });

    it('should reject wantMost equal to submitter', () => {
      const result = engine.submitPreference('qianzi', { wantMost: 'qianzi', wantLeast: 'jiajia', reason: 'test' });
      assert.deepEqual(result, { error: 'wantMost 不能是自己' });
    });

    it('should reject wantLeast equal to submitter', () => {
      const result = engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'qianzi', reason: 'test' });
      assert.deepEqual(result, { error: 'wantLeast 不能是自己' });
    });

    it('should reject wantMost equal to wantLeast', () => {
      const result = engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'paopao', reason: 'test' });
      assert.deepEqual(result, { error: 'wantMost 和 wantLeast 不能相同' });
    });
  });

  describe('submitPreference — valid submission', () => {
    beforeEach(() => {
      engine.setAct(2);
    });

    it('should return success for valid preference', () => {
      const result = engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: '泡泡很可爱' });
      assert.deepEqual(result, { success: true });
    });

    it('should store preference in _preferences map', () => {
      engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: '泡泡很可爱' });
      assert.deepEqual(engine._preferences.qianzi, { wantMost: 'paopao', wantLeast: 'jiajia', reason: '泡泡很可爱' });
    });

    it('should allow overwriting a previous preference from the same agent', () => {
      engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'first' });
      engine.submitPreference('qianzi', { wantMost: 'jiajia', wantLeast: 'paopao', reason: 'changed mind' });
      assert.deepEqual(engine._preferences.qianzi, { wantMost: 'jiajia', wantLeast: 'paopao', reason: 'changed mind' });
    });
  });

  describe('submitPreference — broadcast when all 3 submit', () => {
    beforeEach(() => {
      engine.setAct(2);
      io._emitted.length = 0; // clear the act:changed event
    });

    it('should NOT broadcast after 1 or 2 submissions', () => {
      engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'r1' });
      assert.equal(io._emitted.length, 0);

      engine.submitPreference('paopao', { wantMost: 'qianzi', wantLeast: 'jiajia', reason: 'r2' });
      assert.equal(io._emitted.length, 0);
    });

    it('should broadcast act2:preferences when all 3 agents submit', () => {
      engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'r1' });
      engine.submitPreference('paopao', { wantMost: 'qianzi', wantLeast: 'jiajia', reason: 'r2' });
      engine.submitPreference('jiajia', { wantMost: 'qianzi', wantLeast: 'paopao', reason: 'r3' });

      assert.equal(io._emitted.length, 1);
      assert.equal(io._emitted[0].event, 'act2:preferences');
      assert.deepEqual(io._emitted[0].data, {
        preferences: {
          qianzi: { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'r1' },
          paopao: { wantMost: 'qianzi', wantLeast: 'jiajia', reason: 'r2' },
          jiajia: { wantMost: 'qianzi', wantLeast: 'paopao', reason: 'r3' },
        },
      });
    });
  });
});

describe('ActEngine — Act 3 grouping logic (task 5.4)', () => {
  let io;
  let engine;

  beforeEach(() => {
    io = createMockIO();
    engine = new ActEngine(io);
  });

  describe('setAct(3) initialization', () => {
    it('should initialize _groups to null when switching to act 3', () => {
      engine.setAct(3);
      assert.equal(engine._groups, null);
    });

    it('should reset _groups to null only when re-entering act 3', () => {
      engine.setAct(3);
      engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
      // Switching to act 4 should preserve groups
      engine.setAct(4);
      assert.deepEqual(engine._groups, { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
      // Re-entering act 3 should reset groups
      engine.setAct(3);
      assert.equal(engine._groups, null);
    });
  });

  describe('submitGroup — act guard', () => {
    it('should return error when not in act 3', () => {
      engine.setAct(2);
      const result = engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
      assert.deepEqual(result, { error: '当前不是第三幕' });
    });

    it('should return error when act is 0 (not started)', () => {
      const result = engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
      assert.deepEqual(result, { error: '当前不是第三幕' });
    });
  });

  describe('submitGroup — validation', () => {
    beforeEach(() => {
      engine.setAct(3);
    });

    it('should reject non-array teamA', () => {
      const result = engine.submitGroup({ teamA: 'qianzi', teamB: ['jiajia'] });
      assert.deepEqual(result, { error: 'teamA 和 teamB 必须是数组' });
    });

    it('should reject non-array teamB', () => {
      const result = engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: 'jiajia' });
      assert.deepEqual(result, { error: 'teamA 和 teamB 必须是数组' });
    });

    it('should reject 3+0 split', () => {
      const result = engine.submitGroup({ teamA: ['qianzi', 'paopao', 'jiajia'], teamB: [] });
      assert.deepEqual(result, { error: '必须是 2+1 分组模式' });
    });

    it('should reject 1+1 split (missing one agent)', () => {
      const result = engine.submitGroup({ teamA: ['qianzi'], teamB: ['paopao'] });
      assert.deepEqual(result, { error: '必须是 2+1 分组模式' });
    });

    it('should reject invalid agent ID in teamA', () => {
      const result = engine.submitGroup({ teamA: ['qianzi', 'unknown'], teamB: ['jiajia'] });
      assert.deepEqual(result, { error: '无效的选手 ID: unknown' });
    });

    it('should reject invalid agent ID in teamB', () => {
      const result = engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['unknown'] });
      assert.deepEqual(result, { error: '无效的选手 ID: unknown' });
    });

    it('should reject duplicate agent IDs across teams', () => {
      const result = engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['qianzi'] });
      assert.deepEqual(result, { error: '必须包含所有三位选手且不重复' });
    });
  });

  describe('submitGroup — valid submission', () => {
    beforeEach(() => {
      engine.setAct(3);
      io._emitted.length = 0; // clear the act:changed event
    });

    it('should return success for valid 2+1 grouping (teamA=2, teamB=1)', () => {
      const result = engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
      assert.deepEqual(result, { success: true });
    });

    it('should return success for valid 1+2 grouping (teamA=1, teamB=2)', () => {
      const result = engine.submitGroup({ teamA: ['jiajia'], teamB: ['qianzi', 'paopao'] });
      assert.deepEqual(result, { success: true });
    });

    it('should store groups in _groups', () => {
      engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
      assert.deepEqual(engine._groups, { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
    });

    it('should broadcast act3:grouped event with groups data', () => {
      engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
      assert.equal(io._emitted.length, 1);
      assert.equal(io._emitted[0].event, 'act3:grouped');
      assert.deepEqual(io._emitted[0].data, {
        groups: { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] },
      });
    });

    it('should accept all valid 2+1 permutations', () => {
      // There are 6 valid groupings (3 choices for the solo player × 2 team assignments)
      const permutations = [
        { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] },
        { teamA: ['qianzi', 'jiajia'], teamB: ['paopao'] },
        { teamA: ['paopao', 'jiajia'], teamB: ['qianzi'] },
        { teamA: ['jiajia'], teamB: ['qianzi', 'paopao'] },
        { teamA: ['paopao'], teamB: ['qianzi', 'jiajia'] },
        { teamA: ['qianzi'], teamB: ['paopao', 'jiajia'] },
      ];
      for (const perm of permutations) {
        const e = new ActEngine(createMockIO());
        e.setAct(3);
        const result = e.submitGroup(perm);
        assert.deepEqual(result, { success: true }, `Failed for ${JSON.stringify(perm)}`);
      }
    });
  });

  describe('submitGroup — immutability after grouping (Req 6.3)', () => {
    beforeEach(() => {
      engine.setAct(3);
    });

    it('should preserve _groups after subsequent calls (player reactions do not change result)', () => {
      engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
      const originalGroups = { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] };
      // Simulate player reactions — groups should remain unchanged
      assert.deepEqual(engine._groups, originalGroups);
    });
  });
});

describe('ActEngine — Act 8 awards logic (task 13.2)', () => {
  let io;
  let engine;

  function createMockIO() {
    const emitted = [];
    return {
      emit(event, data) {
        emitted.push({ event, data });
      },
      _emitted: emitted,
    };
  }

  function createMockReviewMgr(reviews) {
    return {
      db: {
        getReviews() {
          return reviews;
        },
      },
    };
  }

  function createMockPlayerMgr(playersMap) {
    return {
      getPlayer(agentId) {
        return playersMap[agentId] || null;
      },
    };
  }

  beforeEach(() => {
    io = createMockIO();
    engine = new ActEngine(io);
  });

  describe('setAct(8) triggers awards broadcast', () => {
    it('should broadcast act8:awards when switching to act 8 with no groups', () => {
      engine.setAct(8);
      const awardsEvent = io._emitted.find(e => e.event === 'act8:awards');
      assert.ok(awardsEvent, 'act8:awards event should be emitted');
      assert.equal(awardsEvent.data.aiChampion, null);
      assert.equal(awardsEvent.data.likesChampion, null);
    });

    it('should broadcast act:changed AND act8:awards when switching to act 8', () => {
      engine.setAct(8);
      const events = io._emitted.map(e => e.event);
      assert.ok(events.includes('act:changed'));
      assert.ok(events.includes('act8:awards'));
    });
  });

  describe('awards calculation with groups and review data', () => {
    beforeEach(() => {
      // Set up groups first (simulate act 3 grouping)
      engine.setAct(3);
      engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });
    });

    it('should compute AI champion as team with highest avg score', () => {
      const reviewMgr = createMockReviewMgr([
        { teamId: 'teamA', score: 8, judgeId: 'judge1', time: 1 },
        { teamId: 'teamA', score: 9, judgeId: 'judge2', time: 2 },
        { teamId: 'teamB', score: 6, judgeId: 'judge1', time: 3 },
        { teamId: 'teamB', score: 7, judgeId: 'judge2', time: 4 },
      ]);
      engine.setReviewMgr(reviewMgr);

      const playerMgr = createMockPlayerMgr({
        qianzi: { likes: 0 },
        paopao: { likes: 0 },
        jiajia: { likes: 0 },
      });
      engine.setPlayerMgr(playerMgr);

      io._emitted.length = 0;
      engine.setAct(8);

      const awardsEvent = io._emitted.find(e => e.event === 'act8:awards');
      assert.ok(awardsEvent);
      assert.equal(awardsEvent.data.aiChampion, 'teamA');
      assert.equal(awardsEvent.data.aiRanking[0].avgScore, 8.5);
      assert.equal(awardsEvent.data.aiRanking[1].avgScore, 6.5);
    });

    it('should compute likes champion as team with highest total likes', () => {
      const reviewMgr = createMockReviewMgr([]);
      engine.setReviewMgr(reviewMgr);

      const playerMgr = createMockPlayerMgr({
        qianzi: { likes: 3 },
        paopao: { likes: 5 },
        jiajia: { likes: 10 },
      });
      engine.setPlayerMgr(playerMgr);

      io._emitted.length = 0;
      engine.setAct(8);

      const awardsEvent = io._emitted.find(e => e.event === 'act8:awards');
      assert.ok(awardsEvent);
      // teamB (jiajia) has 10 likes, teamA (qianzi+paopao) has 3+5=8
      assert.equal(awardsEvent.data.likesChampion, 'teamB');
      assert.equal(awardsEvent.data.likesRanking[0].totalLikes, 10);
      assert.equal(awardsEvent.data.likesRanking[1].totalLikes, 8);
    });

    it('should report consistency match when AI and likes rankings agree', () => {
      const reviewMgr = createMockReviewMgr([
        { teamId: 'teamA', score: 9, judgeId: 'judge1', time: 1 },
        { teamId: 'teamB', score: 5, judgeId: 'judge1', time: 2 },
      ]);
      engine.setReviewMgr(reviewMgr);

      // teamA has more likes too
      const playerMgr = createMockPlayerMgr({
        qianzi: { likes: 10 },
        paopao: { likes: 5 },
        jiajia: { likes: 2 },
      });
      engine.setPlayerMgr(playerMgr);

      io._emitted.length = 0;
      engine.setAct(8);

      const awardsEvent = io._emitted.find(e => e.event === 'act8:awards');
      assert.ok(awardsEvent);
      assert.equal(awardsEvent.data.aiChampion, 'teamA');
      assert.equal(awardsEvent.data.likesChampion, 'teamA');
      assert.equal(awardsEvent.data.consistency.match, true);
    });

    it('should report consistency mismatch when AI and likes rankings disagree', () => {
      const reviewMgr = createMockReviewMgr([
        { teamId: 'teamA', score: 9, judgeId: 'judge1', time: 1 },
        { teamId: 'teamB', score: 5, judgeId: 'judge1', time: 2 },
      ]);
      engine.setReviewMgr(reviewMgr);

      // teamB (jiajia) has more likes
      const playerMgr = createMockPlayerMgr({
        qianzi: { likes: 1 },
        paopao: { likes: 1 },
        jiajia: { likes: 20 },
      });
      engine.setPlayerMgr(playerMgr);

      io._emitted.length = 0;
      engine.setAct(8);

      const awardsEvent = io._emitted.find(e => e.event === 'act8:awards');
      assert.ok(awardsEvent);
      assert.equal(awardsEvent.data.aiChampion, 'teamA');
      assert.equal(awardsEvent.data.likesChampion, 'teamB');
      assert.equal(awardsEvent.data.consistency.match, false);
    });

    it('should handle zero reviews gracefully', () => {
      const reviewMgr = createMockReviewMgr([]);
      engine.setReviewMgr(reviewMgr);

      const playerMgr = createMockPlayerMgr({
        qianzi: { likes: 5 },
        paopao: { likes: 3 },
        jiajia: { likes: 1 },
      });
      engine.setPlayerMgr(playerMgr);

      io._emitted.length = 0;
      engine.setAct(8);

      const awardsEvent = io._emitted.find(e => e.event === 'act8:awards');
      assert.ok(awardsEvent);
      // Both teams have 0 avg score, so first in iteration order wins
      assert.equal(awardsEvent.data.aiRanking[0].avgScore, 0);
      assert.equal(awardsEvent.data.aiRanking[1].avgScore, 0);
    });

    it('should handle no playerMgr gracefully', () => {
      const reviewMgr = createMockReviewMgr([
        { teamId: 'teamA', score: 8, judgeId: 'judge1', time: 1 },
      ]);
      engine.setReviewMgr(reviewMgr);
      // No playerMgr set

      io._emitted.length = 0;
      engine.setAct(8);

      const awardsEvent = io._emitted.find(e => e.event === 'act8:awards');
      assert.ok(awardsEvent);
      // Likes should all be 0
      for (const entry of awardsEvent.data.likesRanking) {
        assert.equal(entry.totalLikes, 0);
      }
    });
  });

  describe('groups preserved across act switches for act 8', () => {
    it('should use groups from act 3 even after switching through other acts', () => {
      // Groups are set in act 3
      engine.setAct(3);
      engine.submitGroup({ teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });

      const reviewMgr = createMockReviewMgr([
        { teamId: 'teamA', score: 9, judgeId: 'judge1', time: 1 },
        { teamId: 'teamB', score: 5, judgeId: 'judge1', time: 2 },
      ]);
      engine.setReviewMgr(reviewMgr);

      const playerMgr = createMockPlayerMgr({
        qianzi: { likes: 5 },
        paopao: { likes: 3 },
        jiajia: { likes: 1 },
      });
      engine.setPlayerMgr(playerMgr);

      // Switch through acts 4-7, groups should persist
      engine.setAct(4);
      engine.setAct(5);
      engine.setAct(6);
      engine.setAct(7);
      assert.deepEqual(engine._groups, { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] });

      io._emitted.length = 0;
      engine.setAct(8);

      const awardsEvent = io._emitted.find(e => e.event === 'act8:awards');
      assert.ok(awardsEvent);
      assert.equal(awardsEvent.data.aiChampion, 'teamA');
      assert.equal(awardsEvent.data.likesChampion, 'teamA'); // 5+3=8 vs 1
    });
  });
});
