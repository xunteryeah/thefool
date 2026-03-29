#!/usr/bin/env node
const http = require('http');

console.log('🧪 测试 SSE 事件流\n');

const req = http.request({
  hostname: 'localhost',
  port: 5660,
  path: '/events',
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream',
  }
}, (res) => {
  console.log('✅ SSE 连接成功\n');
  console.log('📡 监听事件...\n');
  
  res.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.trim()) {
      console.log('收到事件:');
      console.log(text);
      console.log('---');
    }
  });
});

req.on('error', (err) => {
  console.error('❌ SSE 连接失败:', err.message);
  process.exit(1);
});

req.end();

// 10 秒后退出
setTimeout(() => {
  console.log('\n✅ 测试完成');
  process.exit(0);
}, 10000);
