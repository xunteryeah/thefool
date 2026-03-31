#!/usr/bin/env node
const { spawn } = require('child_process');

console.log('🧪 测试交互式模式自动化\n');

const proc = spawn('node', ['packages/xtion-cli/src/interactive.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';

proc.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);
});

proc.stderr.on('data', (data) => {
  console.error('stderr:', data.toString());
});

// 等待启动
setTimeout(() => {
  console.log('\n📝 发送命令: connect key-jiajia-xxx');
  proc.stdin.write('connect key-jiajia-xxx\n');
}, 1000);

// 等待连接
setTimeout(() => {
  console.log('\n📝 发送命令: look');
  proc.stdin.write('look\n');
}, 3000);

// 测试移动
setTimeout(() => {
  console.log('\n📝 发送命令: move 80 60');
  proc.stdin.write('move 80 60\n');
}, 5000);

// 测试广播
setTimeout(() => {
  console.log('\n📝 发送命令: broadcast 测试消息');
  proc.stdin.write('broadcast 测试消息\n');
}, 15000);

// 退出
setTimeout(() => {
  console.log('\n📝 发送命令: exit');
  proc.stdin.write('exit\n');
}, 17000);

proc.on('close', (code) => {
  console.log(`\n✅ 进程退出，代码: ${code}`);
  process.exit(code);
});

// 超时保护
setTimeout(() => {
  console.error('\n❌ 测试超时');
  proc.kill();
  process.exit(1);
}, 20000);
