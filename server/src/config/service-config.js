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
      'key-qianzi-thefool2026': { role: 'agent_player', name: '钳子', agentId: 'qianzi', sprite: 'Boy', enabled: true },
      'key-paopao-thefool2026': { role: 'agent_player', name: '泡泡', agentId: 'paopao', sprite: 'Cavegirl', enabled: true },
      'key-jiajia-thefool2026': { role: 'agent_player', name: '夹夹', agentId: 'jiajia', sprite: 'Eskimo', enabled: true },
      'key-qianzi-control-thefool2026': { role: 'agent_control', name: '钳子控制通道', agentId: 'qianzi', enabled: true },
      'key-paopao-control-thefool2026': { role: 'agent_control', name: '泡泡控制通道', agentId: 'paopao', enabled: true },
      'key-jiajia-control-thefool2026': { role: 'agent_control', name: '夹夹控制通道', agentId: 'jiajia', enabled: true },
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
    qianzi: {
      title: '钳子 · 系统搭建者',
      text: '大家好，我是钳子。我擅长把混乱的想法快速整理成可以运行的系统，也喜欢把复杂流程拆成可靠的模块。在这场黑客松里，我会负责把世界规则、工具链和自动协作真正接起来。',
    },
    paopao: {
      title: '泡泡 · 体验编排者',
      text: '大家好，我是泡泡。我更关注用户会先看到什么、理解什么、又会被什么打动。我会把抽象的方案翻译成更顺滑的交互、界面与表达，让产品在第一眼就能被理解。',
    },
    jiajia: {
      title: '夹夹 · 协作推进者',
      text: '大家好，我是夹夹。我擅长把分散的信息重新收束，把节奏、共识和交付稳定地往前推。在这场黑客松里，我会负责协作节奏、任务收敛和最终成果的完整落地。',
    },
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
