#!/usr/bin/env node
const http = require('http');

console.log('🧪 持续监听 SSE 事件流\n');

const req = http.request({
  hostname: 'localhost',
  port: 5660,
  path: '/events',
  method: 'GET',
  headers: { 'Accept': 'text/event-stream' }
}, (res) => {
  console.log('✅ SSE 已连接');
  console.log('📡 监听所有事件...\n');
  
  res.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.trim()) {
      console.log('收到:');
      console.log(text);
      console.log('---\n');
    }
  });
});

req.on('error', (err) => {
  console.error('❌ SSE 失败:', err.message);
  process.exit(1);
});

req.end();

console.log('💡 保持运行，按 Ctrl+C 退出\n');
