#!/usr/bin/env node
'use strict';

const io = require('socket.io-client');
const { spawn } = require('node:child_process');

const SERVER_URL = process.env.XTION_SERVER || 'http://localhost:5660';
const API_KEY = process.env.XTION_CONTROL_API_KEY;
const WAKE_COMMAND = process.env.XTION_WAKE_COMMAND || '';
const COMMAND_COOLDOWN_MS = Number(process.env.XTION_WAKE_COMMAND_COOLDOWN_MS || 15 * 1000);
const BRAIN_ATTACH_COMMAND = process.env.XTION_BRAIN_ATTACH_COMMAND || WAKE_COMMAND;
const BRAIN_RELEASE_COMMAND = process.env.XTION_BRAIN_RELEASE_COMMAND || '';
const RUNNER_SYNC_COMMAND = process.env.XTION_RUNNER_SYNC_COMMAND || '';

let lastCommandAt = 0;

function log(message, details) {
  const t = new Date().toISOString().slice(11, 19);
  if (details === undefined) {
    console.log(`[${t}] [control] ${message}`);
    return;
  }
  console.log(`[${t}] [control] ${message}`, details);
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

function runShellCommand(command, message, envExtras) {
  if (!command) {
    log(`未配置命令，保留消息等待外部处理: ${message.kind || 'message'}`);
    return false;
  }

  const now = Date.now();
  if (now - lastCommandAt < COMMAND_COOLDOWN_MS) {
    log(`命令冷却中，本次消息保留待下次处理: ${message.kind || 'message'}`);
    return false;
  }

  lastCommandAt = now;

  const child = spawn(command, {
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
      ...(envExtras || {}),
    },
  });

  child.unref();
  return true;
}

function pickCommandForMessage(message) {
  const kind = String((message && message.kind) || 'wakeup').trim();
  if (kind === 'takeover' || kind === 'wakeup') {
    return BRAIN_ATTACH_COMMAND;
  }
  if (kind === 'release') {
    return BRAIN_RELEASE_COMMAND;
  }
  if (kind === 'sync') {
    return RUNNER_SYNC_COMMAND || BRAIN_ATTACH_COMMAND;
  }
  if (kind === 'task') {
    return BRAIN_ATTACH_COMMAND;
  }
  return WAKE_COMMAND || BRAIN_ATTACH_COMMAND;
}

function handleMessage(message) {
  if (!message || !message.id) return;
  const kind = message.kind || 'message';
  log(`收到导演消息[${kind}]: ${message.text}`);

  const command = pickCommandForMessage(message);
  const ok = runShellCommand(command, message, {
    XTION_CONTROL_MODE: kind,
  });

  if (!ok) {
    return;
  }

  socket.emit('director:ack', { messageId: message.id });
  log(`已执行控制命令并确认消息: ${kind}`);
}
