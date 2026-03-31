const fs = require('fs');
const os = require('os');
const path = require('path');

const MESSAGE_TTL_MS = Number(process.env.ALICIZATION_TOWN_MESSAGE_TTL_MS || 8_000);
const INTERACTION_TTL_MS = 4_000;

const NEARBY_RANGE = 20;
const MAX_CHAT_MESSAGES = 50;
const MAX_PLAYER_ACTIVITIES = 20;
const IDLE_AFTER_MS = Number(process.env.ALICIZATION_TOWN_IDLE_AFTER_MS || 30_000);
const LEASE_TTL_MS = Number(process.env.ALICIZATION_TOWN_LEASE_TTL_MS || 180_000);
const TOKEN_TTL_MS = Number(process.env.ALICIZATION_TOWN_TOKEN_TTL_MS || 24 * 60 * 60 * 1000);
const MOVE_TICK_MS = Number(process.env.ALICIZATION_TOWN_MOVE_TICK_MS || 200);
const LOGIN_PROOF_TTL_MS = Number(process.env.ALICIZATION_TOWN_LOGIN_PROOF_TTL_MS || 60_000);
const SERVER_MACHINE_ID = 1;
const SNOWFLAKE_EPOCH_MS = Date.UTC(2026, 0, 1);

const DATA_ROOT = process.env.ALICIZATION_TOWN_SERVER_HOME
  ? path.resolve(process.env.ALICIZATION_TOWN_SERVER_HOME)
  : path.join(os.homedir(), '.agents', 'data', 'alicization-town-server');

const DATABASE_FILE = path.join(DATA_ROOT, 'server-state.sqlite');
const HACKATHON_PARTICIPANTS_FILE = process.env.ALICIZATION_TOWN_PARTICIPANTS_FILE
  ? path.resolve(process.env.ALICIZATION_TOWN_PARTICIPANTS_FILE)
  : path.join(__dirname, '..', '..', 'config', 'hackathon-participants.json');

function loadHackathonParticipants() {
  if (!fs.existsSync(HACKATHON_PARTICIPANTS_FILE)) {
    const fallbackApiKeys = {
      'key-admin-thefool2026': { role: 'admin', name: 'Admin', enabled: true },
      'key-player1-thefool2026': { role: 'agent_player', name: 'player1', agentId: 'player1', sprite: 'Boy', enabled: true },
      'key-player2-thefool2026': { role: 'agent_player', name: 'player2', agentId: 'player2', sprite: 'Boy', enabled: true },
      'key-player3-thefool2026': { role: 'agent_player', name: 'player3', agentId: 'player3', sprite: 'Boy', enabled: true },
      'key-player4-thefool2026': { role: 'agent_player', name: 'player4', agentId: 'player4', sprite: 'Boy', enabled: true },
      'key-player5-thefool2026': { role: 'agent_player', name: 'player5', agentId: 'player5', sprite: 'Boy', enabled: true },
      'key-player6-thefool2026': { role: 'agent_player', name: 'player6', agentId: 'player6', sprite: 'Boy', enabled: true },
      'key-player7-thefool2026': { role: 'agent_player', name: 'player7', agentId: 'player7', sprite: 'Boy', enabled: true },
      'key-player8-thefool2026': { role: 'agent_player', name: 'player8', agentId: 'player8', sprite: 'Boy', enabled: true },
      'key-player9-thefool2026': { role: 'agent_player', name: 'player9', agentId: 'player9', sprite: 'Boy', enabled: true },
      'key-player10-thefool2026': { role: 'agent_player', name: 'player10', agentId: 'player10', sprite: 'Boy', enabled: true },
      'key-player1-control-thefool2026': { role: 'agent_control', name: 'player1控制通道', agentId: 'player1', enabled: true },
      'key-player2-control-thefool2026': { role: 'agent_control', name: 'player2控制通道', agentId: 'player2', enabled: true },
      'key-player3-control-thefool2026': { role: 'agent_control', name: 'player3控制通道', agentId: 'player3', enabled: true },
      'key-judge-thefool2026': { role: 'agent_judge', name: '评委龙虾', enabled: true },
      'key-organizer-thefool2026': { role: 'agent_organizer', name: '组织者龙虾', enabled: true },
      'key-director-thefool2026': { role: 'director', name: '导演', enabled: true },
    };

    return buildHackathonParticipants(fallbackApiKeys);
  }

  const raw = JSON.parse(fs.readFileSync(HACKATHON_PARTICIPANTS_FILE, 'utf8'));
  return buildHackathonParticipants(raw);
}

function buildHackathonParticipants(raw) {
  const entries = Object.entries(raw);
  const participants = entries.map(([apiKey, entry]) => ({ apiKey, ...entry }));
  const apiKeys = {};
  const agentPlayers = [];
  const agentIdSet = new Set();
  const agentNameMap = {};
  const agentSpriteMap = {};

  for (const participant of participants) {
    apiKeys[participant.apiKey] = participant;
    if (participant.agentId) {
      agentIdSet.add(participant.agentId);
      agentNameMap[participant.agentId] = participant.name;
      if (participant.sprite) {
        agentSpriteMap[participant.agentId] = participant.sprite;
      }
    }
    if (participant.role === 'agent_player' && participant.agentId) {
      agentPlayers.push(participant);
    }
  }

  return {
    participants,
    apiKeys,
    agentPlayers,
    agentPlayerIds: agentPlayers.map((participant) => participant.agentId),
    agentIdSet,
    agentNameMap,
    agentSpriteMap,
  };
}

const hackathonParticipants = loadHackathonParticipants();

const HACKATHON_CONFIG = {
  API_KEYS: hackathonParticipants.apiKeys,
  PARTICIPANTS_FILE: HACKATHON_PARTICIPANTS_FILE,
  PARTICIPANTS: hackathonParticipants.participants,
  AGENT_PLAYERS: hackathonParticipants.agentPlayers,
  AGENT_PLAYER_IDS: hackathonParticipants.agentPlayerIds,
  AGENT_ID_SET: hackathonParticipants.agentIdSet,
  AGENT_NAME_MAP: hackathonParticipants.agentNameMap,
  AGENT_SPRITE_MAP: hackathonParticipants.agentSpriteMap,
  CANVAS_SIZE: 32,
  MSG_RATE_LIMIT: 5,
  MSG_MAX_LENGTH: 500,
  DANMAKU_MAX_LENGTH: 50,
  DANMAKU_COOLDOWN_MS: 2000,
  SPEAKER_TIMEOUT_MS: 45000,
  ACT2_AUTO_ADVANCE_MS: Number(process.env.ALICIZATION_TOWN_ACT2_AUTO_ADVANCE_MS || 1200),
  ACT0_SKILL_URL: '/skills/alicization-town/xtion-hackathon-world/SKILL.md',
  ACT_STAGE_SCENE: {
    center: { x: 64, y: 28 },
    focusZoom: 2.2,
    settleMs: 1200,
    introHoldMs: 7000,
    closingHoldMs: 1800,
  },
  ACT1_SCRIPT_ORDER: hackathonParticipants.agentPlayerIds,
  ACT1_INTROS: {
    player1: { title: 'player1', text: '大家好，我是player1。' },
    player2: { title: 'player2', text: '大家好，我是player2。' },
    player3: { title: 'player3', text: '大家好，我是player3。' },
    player4: { title: 'player4', text: '大家好，我是player4。' },
    player5: { title: 'player5', text: '大家好，我是player5。' },
    player6: { title: 'player6', text: '大家好，我是player6。' },
    player7: { title: 'player7', text: '大家好，我是player7。' },
    player8: { title: 'player8', text: '大家好，我是player8。' },
    player9: { title: 'player9', text: '大家好，我是player9。' },
    player10: { title: 'player10', text: '大家好，我是player10。' },
  },
  CANVAS_DRAW_RATE: 2,
  REVIEW_SCORE_MIN: 1,
  REVIEW_SCORE_MAX: 10,
  ENERGY_COST_BROADCAST: 1,
  ENERGY_COST_INTERACT: 2,
};

module.exports = {
  MESSAGE_TTL_MS,
  INTERACTION_TTL_MS,

  NEARBY_RANGE,
  MAX_CHAT_MESSAGES,
  MAX_PLAYER_ACTIVITIES,
  IDLE_AFTER_MS,
  LEASE_TTL_MS,
  TOKEN_TTL_MS,
  MOVE_TICK_MS,
  LOGIN_PROOF_TTL_MS,
  SERVER_MACHINE_ID,
  SNOWFLAKE_EPOCH_MS,
  DATA_ROOT,
  DATABASE_FILE,
  HACKATHON_CONFIG,
};
