#!/usr/bin/env node
const io = require('socket.io-client');

console.log('🧪 测试交互式移动进度...\n');

const socket = io('http://localhost:5660', {
  auth: { apiKey: 'key-paopao-xxx' },
  reconnection: false,
});

socket.on('connect', () => {
  console.log('✅ 泡泡已连接\n');
  
  // 监听移动进度
  socket.on('world:moveProgress', (data) => {
    process.stdout.write(`\r🚶 移动中... (${data.x}, ${data.y}) [${data.step}/${data.total}]`);
  });
  
  socket.on('world:moveResult', (result) => {
    console.log(`\n✅ 到达: ${result.targetZone} (${result.player.x}, ${result.player.y})`);
    console.log(`📏 总共走了 ${result.pathLength} 步\n`);
    
    // 测试完成，断开
    setTimeout(() => {
      socket.disconnect();
      console.log('✅ 测试完成！');
      process.exit(0);
    }, 1000);
  });
  
  // 开始移动到远处
  console.log('📍 开始移动到 (80, 60)...');
  socket.emit('world:move', { x: 80, y: 60 });
});

socket.on('connect_error', (err) => {
  console.error('❌ 连接失败:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 测试超时');
  process.exit(1);
}, 30000);
