#!/usr/bin/env node
const { spawn } = require('node:child_process');
const io = require('socket.io-client');

const SERVER_URL = process.env.XTION_SERVER || 'http://localhost:5660';
const API_KEY = process.env.XTION_CONTROL_API_KEY;
const WAKE_COMMAND = process.env.XTION_WAKE_COMMAND || '';
const COMMAND_COOLDOWN_MS = Number(process.env.XTION_WAKE_COMMAND_COOLDOWN_MS || 15 * 1000);

let lastCommandAt = 0;

function log(message) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [control] ${message}`);
}

if (!API_KEY) {
  console.error('缺少 XTION_CONTROL_API_KEY');
  process.exit(1);
}

const socket = io(SERVER_URL, {
  auth: { apiKey: API_KEY },
  reconnection: true,
});

socket.on('connect', () => {
  log('已连接导演控制通道');
});

socket.on('connect_error', (error) => {
  log(`连接失败: ${error.message}`);
});

socket.on('disconnect', () => {
  log('与导演控制通道断开');
});

socket.on('director:pending', (messages) => {
  if (!Array.isArray(messages)) return;
  messages.forEach(handleMessage);
});

socket.on('director:message', handleMessage);

function handleMessage(message) {
  if (!message || !message.id) return;
  log(`收到导演消息[${message.kind || 'message'}]: ${message.text}`);

  if (!WAKE_COMMAND) {
    log('未配置 XTION_WAKE_COMMAND，保留消息等待人工或外部处理');
    return;
  }

  const now = Date.now();
  if (now - lastCommandAt < COMMAND_COOLDOWN_MS) {
    log('命令冷却中，本次消息保留待下次处理');
    return;
  }

  lastCommandAt = now;

  const child = spawn(WAKE_COMMAND, {
    shell: true,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      XTION_DIRECTOR_MESSAGE_ID: message.id,
      XTION_DIRECTOR_MESSAGE_TEXT: message.text,
      XTION_DIRECTOR_MESSAGE_KIND: message.kind || 'message',
      XTION_DIRECTOR_MESSAGE_TIME: String(message.time || Date.now()),
      XTION_DIRECTOR_ISSUED_BY: message.issuedBy || '',
      XTION_DIRECTOR_AGENT_ID: message.agentId || '',
    },
  });

  child.unref();
  socket.emit('director:ack', { messageId: message.id });
  log('已触发唤醒命令并确认消息');
}
