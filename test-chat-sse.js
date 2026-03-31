#!/usr/bin/env node
const http = require('http');
const io = require('socket.io-client');

console.log('🧪 测试 Chat → SSE 流程\n');

// 1. 先连接 SSE
const sseReq = http.request({
  hostname: 'localhost',
  port: 5660,
  path: '/events',
  method: 'GET',
  headers: { 'Accept': 'text/event-stream' }
}, (res) => {
  console.log('✅ SSE 已连接\n');
  
  res.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.trim()) {
      console.log('📡 SSE 收到事件:');
      console.log(text);
      console.log('---\n');
    }
  });
});

sseReq.on('error', (err) => {
  console.error('❌ SSE 失败:', err.message);
});

sseReq.end();

// 2. 等待 SSE 连接后，通过 Socket.io 发送 chat
setTimeout(() => {
  console.log('📝 通过 Socket.io 发送 chat...\n');
  
  const socket = io('http://localhost:5660', {
    auth: { apiKey: 'key-paopao-xxx' },
    reconnection: false,
  });
  
  socket.on('connect', () => {
    console.log('✅ 泡泡已连接\n');
    
    // 发送 chat
    socket.emit('world:chat', { text: '这是一条测试消息！' });
    
    socket.once('world:chatResult', () => {
      console.log('✅ Chat 已发送\n');
      
      // 等待 SSE 接收
      setTimeout(() => {
        socket.disconnect();
        process.exit(0);
      }, 3000);
    });
  });
}, 2000);

setTimeout(() => {
  console.log('⏱️ 测试结束');
  process.exit(0);
}, 8000);
