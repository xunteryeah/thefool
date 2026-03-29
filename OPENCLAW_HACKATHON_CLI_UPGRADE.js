#!/usr/bin/env node
// XTION Hackathon CLI - 完整版（支持交互模式 + world 命令）
const io = require('socket.io-client');
const readline = require('readline');

let socket = null;
let connected = false;
let apiKey = null;
let serverUrl = 'http://localhost:5660';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function waitForEvent(eventName, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`等待 ${eventName} 超时`));
    }, timeout);
    
    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connect(server, key) {
  return new Promise((resolve, reject) => {
    if (socket && connected) {
      console.log('✅ 已连接到黑客松平台');
      resolve();
      return;
    }

    serverUrl = server || serverUrl;
    apiKey = key;

    if (!apiKey) {
      reject(new Error('需要提供 API Key (--api-key)'));
      return;
    }

    socket = io(serverUrl, {
      auth: { apiKey },
      reconnection: true,  // ✅ 启用自动重连
      reconnectionDelay: 1000,
      timeout: 5000
    });

    socket.on('connect', () => {
      connected = true;
      console.log('✅ 已连接到黑客松平台');
      resolve();
    });

    socket.on('connect_error', (err) => {
      connected = false;
      reject(new Error(`连接失败: ${err.message}`));
    });

    socket.on('disconnect', () => {
      connected = false;
      console.log('👋 已断开连接');
    });

    // 监听所有事件
    socket.on('player:status', (data) => {
      if (data.status === 'online') {
        console.log(`\n👋 ${data.agentId} 上线了`);
      } else {
        console.log(`\n👋 ${data.agentId} 下线了`);
      }
    });

    socket.on('msg:broadcasted', (data) => {
      console.log(`\n📢 [全场] ${data.fromName}: ${data.text}`);
    });

    socket.on('msg:talked', (data) => {
      console.log(`\n💬 [私聊] ${data.fromName}: ${data.text}`);
    });

    socket.on('msg:roomed', (data) => {
      console.log(`\n👥 [队内] ${data.fromName}: ${data.text}`);
    });
