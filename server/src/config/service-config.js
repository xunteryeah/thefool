const os = require('os');
const path = require('path');

const MESSAGE_TTL_MS = 5_000;
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

const HACKATHON_CONFIG = {
  API_KEYS: {
    'key-admin-xxx':     { role: 'admin',           name: 'Admin' },
    'key-qianzi-xxx':    { role: 'agent_player',    name: '钳子',  agentId: 'qianzi' },
    'key-paopao-xxx':    { role: 'agent_player',    name: '泡泡',  agentId: 'paopao' },
    'key-jiajia-xxx':    { role: 'agent_player',    name: '夹夹',  agentId: 'jiajia' },
    'key-qianzi-control-xxx': { role: 'agent_control', name: '钳子控制通道', agentId: 'qianzi' },
    'key-paopao-control-xxx': { role: 'agent_control', name: '泡泡控制通道', agentId: 'paopao' },
    'key-jiajia-control-xxx': { role: 'agent_control', name: '夹夹控制通道', agentId: 'jiajia' },
    'key-judge-xxx':     { role: 'agent_judge',     name: '评委龙虾' },
    'key-organizer-xxx': { role: 'agent_organizer', name: '组织者龙虾' },
    'key-director-xxx':  { role: 'director',         name: '导演' },
  },
  CANVAS_SIZE: 32,
  MSG_RATE_LIMIT: 5,
  MSG_MAX_LENGTH: 500,
  DANMAKU_MAX_LENGTH: 50,
  DANMAKU_COOLDOWN_MS: 2000,
  SPEAKER_TIMEOUT_MS: 45000,
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
