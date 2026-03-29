#!/usr/bin/env node
const io = require('socket.io-client');

console.log('🧪 测试 Socket.io 连接...\n');

const socket = io('http://localhost:5660', {
  auth: { apiKey: 'key-qianzi-xxx' },
  reconnection: false,
  timeout: 5000
});

socket.on('connect', () => {
  console.log('✅ 连接成功！');
  console.log('Socket ID:', socket.id);
  
  // 测试 look
  console.log('\n📍 测试 world:look...');
  socket.emit('world:look');
  
  socket.once('world:lookResult', (result) => {
    console.log('✅ Look 结果:', JSON.stringify(result, null, 2));
    
    // 测试 act
    console.log('\n🎬 测试 act:query...');
    socket.emit('act:query');
    
    socket.once('act:current', (state) => {
      console.log('✅ Act 状态:', JSON.stringify(state, null, 2));
      
      console.log('\n✅ 所有测试通过！');
      socket.disconnect();
      process.exit(0);
    });
  });
});

socket.on('connect_error', (err) => {
  console.error('❌ 连接失败:', err.message);
  process.exit(1);
});

socket.on('error', (err) => {
  console.error('❌ 错误:', err);
});

setTimeout(() => {
  console.error('❌ 连接超时');
  process.exit(1);
}, 10000);
