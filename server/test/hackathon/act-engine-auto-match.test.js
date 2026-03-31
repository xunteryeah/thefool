const test = require('node:test');
const assert = require('node:assert/strict');

const ActEngine = require('../../src/hackathon/act-engine');
const { HACKATHON_CONFIG } = require('../../src/config/service-config');

function createMockIO() {
  const emitted = [];
  return {
    emit(event, data) {
      emitted.push({ event, data });
    },
    _emitted: emitted,
  };
}

function createMockRoomMgr() {
  return {
    createdGroups: [],
    createFromGroups(groups) {
      this.createdGroups.push(groups);
    },
  };
}

test('Act 2 collects all preferences and computes suggested groups automatically', () => {
  const io = createMockIO();
  const engine = new ActEngine(io);

  engine.setAct(2);
  io._emitted.length = 0;

  engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'r1' });
  engine.submitPreference('paopao', { wantMost: 'qianzi', wantLeast: 'jiajia', reason: 'r2' });
  engine.submitPreference('jiajia', { wantMost: 'qianzi', wantLeast: 'paopao', reason: 'r3' });

  assert.equal(io._emitted.length, 1);
  assert.equal(io._emitted[0].event, 'act2:preferences');
  assert.deepEqual(io._emitted[0].data.suggestedGroups, {
    teamA: ['qianzi', 'paopao'],
    teamB: ['jiajia'],
  });
  assert.deepEqual(io._emitted[0].data.matching, {
    algorithm: 'preference-score',
    pairScore: 8,
    mutualWant: true,
    positiveEdges: 2,
    negativeEdges: 0,
    chosenPair: ['qianzi', 'paopao'],
    soloAgent: 'jiajia',
  });
});

test('Act 3 auto-finalizes the stored preference match into groups and rooms', () => {
  const io = createMockIO();
  const roomMgr = createMockRoomMgr();
  const engine = new ActEngine(io);
  engine.setRoomMgr(roomMgr);

  engine.setAct(2);
  io._emitted.length = 0;

  engine.submitPreference('qianzi', { wantMost: 'jiajia', wantLeast: 'paopao', reason: 'r1' });
  engine.submitPreference('paopao', { wantMost: 'qianzi', wantLeast: 'jiajia', reason: 'r2' });
  engine.submitPreference('jiajia', { wantMost: 'qianzi', wantLeast: 'paopao', reason: 'r3' });

  io._emitted.length = 0;

  const result = engine.setAct(3);

  assert.equal(result.act, 3);
  assert.deepEqual(engine._groups, {
    teamA: ['qianzi', 'jiajia'],
    teamB: ['paopao'],
  });
  assert.deepEqual(roomMgr.createdGroups, [
    { teamA: ['qianzi', 'jiajia'], teamB: ['paopao'] },
  ]);
  assert.deepEqual(io._emitted.map((item) => item.event), ['act:changed', 'act3:grouped']);
  assert.deepEqual(io._emitted[1].data, {
    groups: { teamA: ['qianzi', 'jiajia'], teamB: ['paopao'] },
    autoMatched: true,
    matching: {
      algorithm: 'preference-score',
      pairScore: 8,
      mutualWant: true,
      positiveEdges: 2,
      negativeEdges: 0,
      chosenPair: ['qianzi', 'jiajia'],
      soloAgent: 'paopao',
    },
  });
});

test('Act 2 auto-advances to Act 3 after all preferences are submitted', async () => {
  const originalDelay = HACKATHON_CONFIG.ACT2_AUTO_ADVANCE_MS;
  HACKATHON_CONFIG.ACT2_AUTO_ADVANCE_MS = 5;

  try {
    const io = createMockIO();
    const roomMgr = createMockRoomMgr();
    const engine = new ActEngine(io);
    engine.setRoomMgr(roomMgr);

    engine.setAct(2);
    io._emitted.length = 0;

    engine.submitPreference('qianzi', { wantMost: 'paopao', wantLeast: 'jiajia', reason: 'r1' });
    engine.submitPreference('paopao', { wantMost: 'qianzi', wantLeast: 'jiajia', reason: 'r2' });
    engine.submitPreference('jiajia', { wantMost: 'qianzi', wantLeast: 'paopao', reason: 'r3' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(engine.getState().act, 3);
    assert.deepEqual(engine._groups, {
      teamA: ['qianzi', 'paopao'],
      teamB: ['jiajia'],
    });
    assert.deepEqual(io._emitted.map((item) => item.event), [
      'act2:preferences',
      'act:changed',
      'act3:grouped',
    ]);
    assert.deepEqual(roomMgr.createdGroups, [
      { teamA: ['qianzi', 'paopao'], teamB: ['jiajia'] },
    ]);
  } finally {
    HACKATHON_CONFIG.ACT2_AUTO_ADVANCE_MS = originalDelay;
  }
});
