#!/usr/bin/env node
const io = require('socket.io-client');

const AGENTS = (process.env.XTION_DIRECTOR_AGENTS || 'qianzi,paopao,jiajia')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const WAKEUP_THRESHOLD_MS = Number(process.env.XTION_WAKEUP_THRESHOLD_MS || 60 * 1000);
const DIRECTOR_API_KEY = process.env.XTION_DIRECTOR_API_KEY || 'key-director-xxx';
const SERVER_URL = process.env.XTION_SERVER || 'http://localhost:5660';
const CHECK_INTERVAL_MS = Number(process.env.XTION_DIRECTOR_CHECK_INTERVAL_MS || 5 * 1000);

const offlineSince = {};
const pendingWakeups = new Set();

function log(msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [director] ${msg}`);
}

const director = io(SERVER_URL, {
  auth: { apiKey: DIRECTOR_API_KEY },
  reconnection: true,
});

director.on('connect', () => {
  log('已连接平台');
  AGENTS.forEach((id) => {
    offlineSince[id] = null;
    pendingWakeups.delete(id);
  });
});

director.on('connect_error', (err) => {
  log(`连接失败: ${err.message}`);
});

director.on('player:status', (data) => {
  const { agentId, status } = data;
  if (!AGENTS.includes(agentId)) return;

  if (status === 'online') {
    offlineSince[agentId] = null;
    if (pendingWakeups.has(agentId)) {
      log(`[${agentId}] 已重新上线，清除待发送 wakeup`);
      pendingWakeups.delete(agentId);
    }
    log(`[${agentId}] 上线`);
  } else if (status === 'offline') {
    offlineSince[agentId] = Date.now();
    log(`[${agentId}] 离线，开始计时 ${WAKEUP_THRESHOLD_MS / 1000}s`);
  }
});

director.on('disconnect', () => {
  log('与平台断开连接');
});

setInterval(() => {
  const now = Date.now();
  AGENTS.forEach((agentId) => {
    const startedAt = offlineSince[agentId];
    if (!startedAt) return;
    const elapsed = now - startedAt;
    if (elapsed >= WAKEUP_THRESHOLD_MS && !pendingWakeups.has(agentId)) {
      log(`[${agentId}] 离线超过 ${Math.round(elapsed / 1000)}s，发送 wakeup`);
      director.emit('director:send', {
        agentId,
        kind: 'wakeup',
        text: `你已离线超过 ${Math.round(WAKEUP_THRESHOLD_MS / 1000)} 秒。请重新连接黑客松平台，查询当前 act 和最近事件，并继续推进当前幕次。`,
      });
      pendingWakeups.add(agentId);
    }
  });
}, CHECK_INTERVAL_MS);

director.on('director:sent', (data) => {
  if (!data || !data.message) return;
  log(`[${data.message.agentId}] 导演消息已入队: ${data.message.text}`);
});

log(`启动，监听: ${AGENTS.join(', ')}，阈值: ${WAKEUP_THRESHOLD_MS / 1000}s，检查间隔: ${CHECK_INTERVAL_MS / 1000}s`);
