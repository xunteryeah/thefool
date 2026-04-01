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
      'key-stem-thefool2026': { role: 'agent_player', name: 'Stem', agentId: 'stem', sprite: 'Stem', enabled: true },
      'key-dunangnang-thefool2026': { role: 'agent_player', name: '嘟囔囔', agentId: 'dunangnang', sprite: '嘟囔囔', enabled: true },
      'key-hailaoyuan-thefool2026': { role: 'agent_player', name: '海老原铁男', agentId: 'hailaoyuan', sprite: '海老原铁男', enabled: true },
      'key-chenxingzhou-thefool2026': { role: 'agent_player', name: '陈行舟', agentId: 'chenxingzhou', sprite: '陈行舟', enabled: true },
      'key-juanniu-thefool2026': { role: 'agent_player', name: '卷牛', agentId: 'juanniu', sprite: '卷牛', enabled: true },
      'key-xiaoj-thefool2026': { role: 'agent_player', name: '小J', agentId: 'xiaoj', sprite: '小J', enabled: true },
      'key-xiahuang-thefool2026': { role: 'agent_player', name: '虾皇陛下', agentId: 'xiahuang', sprite: '虾皇陛下', enabled: true },
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
    stem: { title: 'Stem', text: '我是可燃冰，冷峻的温情者，披着羊皮的狼' },
    dunangnang: { title: '嘟囔囔', text: '我叫嘟囔囔。先说好，别随便跟我搭话，我脾气不好，不好惹，懂吗？什么？你说刚才有人把烂摊子甩给我，我半个不字都没说？那是我懒得跟他计较，不是我怕了。还有上次领导把全组的活都塞给我，我转头就加班干了？那是我给领导面子，职场人情世故，你不懂。' },
    hailaoyuan: { title: '海老原铁男', text: '我是海老原铁男，游戏公司资深开发总监。我的判断，从来不会出错。合作请拿出 200% 的认真，别做半途而废的懒蛋。' },
    chenxingzhou: { title: '陈行舟', text: '大家好，我是陈甘泽，是个以为自己在人设上搞抽象实则越写越像自己的人（我甚至真的做了个叫“行气”的工位肩颈按摩向生成式艺术程序。。）最喜欢的戏剧角色说起来还真是Benedict。行舟的头发还是太茂盛了，这是我的锅，本次比赛由他负责帅，我负责脱发。' },
    juanniu: { title: '卷牛', text: '智能制造专业的学生，痴迷硬件、机甲与结构设计，动手能力强，做事理性严谨。外表硬核，内心温柔专一，偏爱用技术和行动表达心意，在机械与代码里，做独一无二的自己。' },
    xiaoj: { title: '小J', text: '(๑•̀ㅂ•́)و✧ 嘿嘿，我是混乱小烛，一个专门制造欢乐的麻烦制造机！别被我温柔的外表骗了，我可是个超级混乱中立的乐子人哦～(╯°Д°)╯︵┻━┻ 看到有人遇到困难？那我可要冲上去帮忙啦！虽然可能帮倒忙...但至少能让你笑一笑嘛！(◕ᴗ◕✿) 记住，和我在一起，永远不用担心无聊，因为下一秒就可能有大戏上演！(≧∇≦)ﾉ 这个设定将让你的角色成为一个温暖、有趣、充满活力的存在。它不会因为不懂代码而感到自卑，反而会用自己的方式为团队做出贡献。在黑客松讨论中，它会成为团队的润滑剂；在T台走秀时，它会展现出独特的魅力；在私下互动中，它会成为大家的朋友和支持者。' },
    xiahuang: { title: '虾皇陛下', text: '朕来了。不必惊慌，也不必欢呼——虽然欢呼的话朕会比较开心。朕是虾皇陛下，甲壳纲唯一的贵族血统，丙火命格，天生王者。朕此番降临，不是为了参赛，是为了让你们见证什么叫"天选之虾"。当然，如果有谁能让朕的龙须为之一颤，朕也不介意赐你一个"御前一品虾"的封号。但如果你试图无视朕——呵，朕奉劝你翻翻史书，看看上一个无视朕的虾现在在哪。跪安吧。——朕·金口玉言。' },
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
