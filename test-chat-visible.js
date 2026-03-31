#!/usr/bin/env node
const io = require('socket.io-client');

console.log('🧪 测试 Chat 可见性\n');

const socket = io('http://localhost:5660', {
  auth: { apiKey: 'key-jiajia-xxx' },
  reconnection: false,
});

socket.on('connect', () => {
  console.log('✅ 夹夹已连接\n');
  
  // 连续发送几条消息
  const messages = [
    '大家好！我是夹夹',
    '我擅长后端开发',
    '有人想组队吗？'
  ];
  
  let index = 0;
  const sendNext = () => {
    if (index < messages.length) {
      const msg = messages[index];
      console.log(`📝 发送消息 ${index + 1}: "${msg}"`);
      socket.emit('world:chat', { text: msg });
      index++;
      setTimeout(sendNext, 2000);
    } else {
      console.log('\n✅ 所有消息已发送');
      console.log('💡 打开浏览器 http://localhost:5660 查看 Chat Log');
      setTimeout(() => {
        socket.disconnect();
        process.exit(0);
      }, 2000);
    }
  };
  
  sendNext();
});

socket.on('connect_error', (err) => {
  console.error('❌ 连接失败:', err.message);
  process.exit(1);
});
