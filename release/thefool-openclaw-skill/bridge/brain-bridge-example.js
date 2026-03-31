#!/usr/bin/env node
'use strict';

const readline = require('node:readline');

const AGENT_ID = process.env.XTION_AGENT_ID || 'agent';
const AGENT_NAME = process.env.XTION_AGENT_NAME || AGENT_ID;

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function shortText(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function buildRoomReply(packet) {
  const text = packet && packet.payload && packet.payload.text ? String(packet.payload.text) : '';
  if (/产品名|名字/.test(text)) {
    return '我建议先别急着定名字，先把问题定义和解决方案说清楚。';
  }
  if (/问题|痛点/.test(text)) {
    return '我建议先把目标用户和核心痛点收敛成一句话。';
  }
  return '收到，我建议我们先同步目标用户、问题和最小可行功能。';
}

function buildTalkReply(packet) {
  const fromId = packet && packet.payload ? packet.payload.fromId : '';
  return {
    type: 'msg:talk',
    args: {
      to: fromId,
      text: '收到，我在线。我先同步当前幕次和最近上下文，再继续推进。',
    },
  };
}

function buildBroadcastReply(packet) {
  const fromName = packet && packet.payload ? (packet.payload.fromName || packet.payload.from || '你') : '你';
  return {
    type: 'msg:broadcast',
    args: {
      text: `${fromName}，收到。我这边已经同步到当前讨论，会继续跟进。`,
    },
  };
}

function buildMyTurnIntro(state) {
  const actName = state && state.act ? state.act.name : '';
  return {
    type: 'msg:broadcast',
    args: {
      text: `大家好，我是${AGENT_NAME}。我会先快速同步 ${actName || '当前幕次'} 的上下文，再把想法整理成可执行方案。`,
    },
  };
}

function buildTickActions(state) {
  if (!state || !state.room || !state.room.id) return [];
  return [];
}

function decide(packet) {
  const trigger = packet && packet.trigger;
  const state = packet && packet.state;

  if (trigger === 'my_turn') {
    return [buildMyTurnIntro(state)];
  }

  if (trigger === 'msg:talked') {
    return [buildTalkReply(packet)];
  }

  if (trigger === 'msg:roomed') {
    return [];
  }

  if (trigger === 'msg:broadcasted') {
    return [buildBroadcastReply(packet)];
  }

  if (trigger === 'grouped' && state && state.room && state.room.id) {
    return [{
      type: 'msg:room',
      args: {
        text: `已进入 ${state.room.id}，我先同步当前分组上下文。`,
      },
    }];
  }

  if (trigger === 'tick') {
    return buildTickActions(state);
  }

  return [];
}

write({
  type: 'log',
  level: 'info',
  message: `Brain bridge example started for ${AGENT_ID}`,
});

rl.on('line', (line) => {
  const raw = String(line || '').trim();
  if (!raw) return;

  let packet;
  try {
    packet = JSON.parse(raw);
  } catch (error) {
    write({
      type: 'log',
      level: 'warn',
      message: 'Invalid JSON input',
      data: shortText(raw),
    });
    return;
  }

  if (packet.type === 'hello') {
    write({ type: 'mode', mode: 'brain-attached' });
    write({
      type: 'log',
      level: 'info',
      message: 'Hello received from runner',
    });
    return;
  }

  if (packet.type === 'state_snapshot') {
    write({
      type: 'ack',
      reason: packet.reason || 'state_snapshot',
    });
    return;
  }

  if (packet.type === 'event') {
    const actions = decide(packet);
    write({
      type: 'actions',
      requestId: packet.requestId,
      reason: `example brain handled ${packet.trigger}`,
      actions,
    });
    return;
  }

  write({
    type: 'log',
    level: 'debug',
    message: 'Unhandled packet type',
    data: packet.type || 'unknown',
  });
});
