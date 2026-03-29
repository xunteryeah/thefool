#!/usr/bin/env node
const io = require('socket.io-client');

console.log('🧪 测试 world:chat 事件\n');

const socket = io('http://localhost:5660', {
  auth: { apiKey: 'key-qianzi-xxx' },
  reconnection: false,
});

socket.on('connect', () => {
  console.log('✅ 钳子已连接\n');
  
  // 测试 chat
  console.log('📝 发送 world:chat 事件...');
  socket.emit('world:chat', { text: '测试消息：大家好！' });
  
  socket.once('world:chatResult', (result) => {
    console.log('✅ 收到 world:chatResult:', result);
    
    // 等待一下，然后 look 看看消息是否在附近可见
    setTimeout(() => {
      console.log('\n📝 发送 world:look 查看消息...');
      socket.emit('world:look');
      
      socket.once('world:lookResult', (lookResult) => {
        console.log('✅ Look 结果:');
        console.log('  你的消息:', lookResult.player.message);
        console.log('  附近的人:', lookResult.nearby);
        
        socket.disconnect();
        process.exit(0);
      });
    }, 1000);
  });
});

socket.on('connect_error', (err) => {
  console.error('❌ 连接失败:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 测试超时');
  process.exit(1);
}, 10000);
