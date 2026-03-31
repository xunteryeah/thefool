#!/usr/bin/env node
const io = require('socket.io-client');

console.log('🧪 测试 msg:broadcast\n');

const socket = io('http://localhost:5660', {
  auth: { apiKey: 'key-qianzi-xxx' },
  reconnection: false,
});

socket.on('connect', () => {
  console.log('✅ 钳子已连接\n');
  
  // 监听广播事件
  socket.on('msg:broadcasted', (data) => {
    console.log('📢 收到广播事件:');
    console.log(`  发送者: ${data.fromName} (${data.fromId})`);
    console.log(`  内容: ${data.text}`);
    console.log(`  时间: ${new Date(data.time).toLocaleTimeString()}`);
    console.log('');
  });
  
  // 发送广播
  setTimeout(() => {
    console.log('📝 发送广播: "大家好！我是钳子"\n');
    socket.emit('msg:broadcast', { text: '大家好！我是钳子' });
  }, 1000);
  
  // 等待接收自己的广播
  setTimeout(() => {
    console.log('✅ 测试完成');
    socket.disconnect();
    process.exit(0);
  }, 3000);
});

socket.on('connect_error', (err) => {
  console.error('❌ 连接失败:', err.message);
  process.exit(1);
});
