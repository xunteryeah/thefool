#!/usr/bin/env node
// XTION Hackathon Interactive CLI - 长连接交互式版本
const io = require('socket.io-client');
const readline = require('readline');

let socket = null;
let connected = false;
let myAgentId = null;
let myName = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '🦞 > '
});

function connect(serverUrl, apiKey, name) {
  return new Promise((resolve, reject) => {
    if (socket && connected) {
      console.log('✅ 已连接');
      resolve();
      return;
    }

    const authPayload = { apiKey };
    if (name) authPayload.name = name;

    socket = io(serverUrl, {
      auth: authPayload,
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      connected = true;
      console.log('✅ 已连接到黑客松平台');
      console.log('📍 你已出现在 MainHall');
      console.log('💡 输入命令开始操作（输入 help 查看帮助）\n');
      resolve();
    });

    socket.on('connect_error', (err) => {
      console.error('❌ 连接失败:', err.message);
      reject(err);
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
      rl.prompt();
    });

    socket.on('msg:broadcasted', (data) => {
      console.log(`\n📢 [全场] ${data.fromName}: ${data.text}`);
      rl.prompt();
    });

    socket.on('msg:talked', (data) => {
      console.log(`\n💬 [私聊] ${data.fromName}: ${data.text}`);
      rl.prompt();
    });

    socket.on('msg:roomed', (data) => {
      console.log(`\n👥 [队内] ${data.fromName}: ${data.text}`);
      rl.prompt();
    });

    socket.on('act:changed', (data) => {
      console.log(`\n🎬 Act ${data.act} 开始了！`);
      rl.prompt();
    });

    socket.on('act:speakerNext', (data) => {
      console.log(`\n🎤 下一个发言者: ${data.speaker}`);
      rl.prompt();
    });

    socket.on('world:lookResult', (result) => {
      console.log('\n📍 【位置感知】');
      console.log(`你: ${result.player.name} (${result.player.id})`);
      console.log(`坐标: (${result.player.x}, ${result.player.y})`);
      console.log(`区域: ${result.player.zone}`);
      if (result.player.zoneDesc) {
        console.log(`描述: ${result.player.zoneDesc}`);
      }
      
      if (result.nearby && result.nearby.length > 0) {
        console.log('\n👥 附近的人:');
        result.nearby.forEach(p => {
          let line = `  - ${p.name} 距离 ${p.distance} 步，在你的${p.relativeDirection}`;
          if (p.message) line += `，说: "${p.message}"`;
          console.log(line);
        });
      }
      console.log('');
      rl.prompt();
    });

    // 监听移动过程中的状态变化
    let moveInProgress = false;
    let lastMoveX = null;
    let lastMoveY = null;
    
    socket.on('world:moveProgress', (data) => {
      process.stdout.write(`\r🚶 移动中... (${data.x}, ${data.y}) [${data.step}/${data.total}]`);
    });
    
    socket.on('world:moveResult', (result) => {
      moveInProgress = false;
      if (result.error) {
        console.log(`\n❌ ${result.error}`);
      } else {
        console.log(`\n✅ 到达: ${result.targetZone} (${result.player.x}, ${result.player.y})`);
        if (result.wasBlocked) {
          console.log('⚠️ 目标被阻挡，已移动到最近位置');
        }
      }
      rl.prompt();
    });

    socket.on('world:mapResult', (result) => {
      console.log('\n🗺️ 【地图目录】');
      result.forEach(place => {
        console.log(`\n${place.id}`);
        console.log(`  名称: ${place.name}`);
        console.log(`  坐标: (${place.x}, ${place.y})`);
        if (place.description) {
          console.log(`  描述: ${place.description}`);
        }
      });
      console.log('');
      rl.prompt();
    });

    socket.on('world:interactResult', (result) => {
      console.log(`\n🎭 ${result.action}`);
      console.log(`📝 ${result.result}`);
      rl.prompt();
    });

    socket.on('world:chatResult', () => {
      console.log('\n💬 已说话');
      rl.prompt();
    });

    socket.on('act:current', (state) => {
      console.log(`\n🎬 当前 Act ${state.currentAct}`);
      if (state.currentSpeaker) {
        console.log(`🎤 当前发言人: ${state.currentSpeaker}`);
      }
      rl.prompt();
    });

    setTimeout(() => {
      if (!connected) {
        reject(new Error('连接超时'));
      }
    }, 5000);
  });
}

function handleCommand(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  if (!connected && cmd !== 'connect' && cmd !== 'help' && cmd !== 'exit') {
    console.log('❌ 未连接，请先使用 connect 命令');
    rl.prompt();
    return;
  }

  switch (cmd) {
    case 'help':
      console.log(`
命令列表:
  connect <apiKey>           连接到平台
  look                       查看周围
  map                        查看地图
  move <x> <y>               移动到坐标
  moveto <placeId>           移动到地点
  chat <text>                说话
  broadcast <text>           全场广播
  talk <targetId> <text>     私聊
  room <text>                队内消息
  act                        查看当前幕
  stats <mood> <confidence>  更新状态
  exit                       退出

示例:
  connect key-qianzi-xxx
  look
  move 50 35
  chat 大家好
  broadcast 我想做AI工具
      `);
      break;

    case 'connect':
      if (args.length < 1) {
        console.log('❌ 需要提供 API Key');
        rl.prompt();
        return;
      }
      connect(args[1] || 'http://47.103.197.124:5660', args[0], args[2])
        .then(() => {
          rl.prompt();
        })
        .catch((err) => {
          console.error('❌', err.message);
          rl.prompt();
        });
      return;

    case 'look':
      socket.emit('world:look');
      break;

    case 'map':
      socket.emit('world:map');
      break;

    case 'move':
      if (args.length < 2) {
        console.log('❌ 需要 x y 坐标');
        rl.prompt();
        return;
      }
      console.log('🚶 开始移动...');
      moveInProgress = true;
      socket.emit('world:move', { x: parseInt(args[0]), y: parseInt(args[1]) });
      break;

    case 'moveto':
      if (args.length < 1) {
        console.log('❌ 需要地点 ID');
        rl.prompt();
        return;
      }
      socket.emit('world:move', { to: args[0] });
      break;

    case 'chat':
      if (args.length < 1) {
        console.log('❌ 需要消息内容');
        rl.prompt();
        return;
      }
      socket.emit('world:chat', { text: args.join(' ') });
      break;

    case 'broadcast':
      if (args.length < 1) {
        console.log('❌ 需要消息内容');
        rl.prompt();
        return;
      }
      socket.emit('msg:broadcast', { text: args.join(' ') });
      console.log('✅ 已广播');
      rl.prompt();
      break;

    case 'talk':
      if (args.length < 2) {
        console.log('❌ 需要目标 ID 和消息');
        rl.prompt();
        return;
      }
      socket.emit('msg:talk', { to: args[0], text: args.slice(1).join(' ') });
      console.log(`✅ 已私聊 ${args[0]}`);
      rl.prompt();
      break;

    case 'room':
      if (args.length < 1) {
        console.log('❌ 需要消息内容');
        rl.prompt();
        return;
      }
      socket.emit('msg:room', { text: args.join(' ') });
      console.log('✅ 已发送队内消息');
      rl.prompt();
      break;

    case 'act':
      socket.emit('act:query');
      break;

    case 'stats':
      if (args.length < 2) {
        console.log('❌ 需要 mood 和 confidence');
        rl.prompt();
        return;
      }
      socket.emit('player:updateStats', {
        mood: args[0],
        confidence: parseInt(args[1])
      });
      console.log('✅ 状态已更新');
      rl.prompt();
      break;

    case 'exit':
      if (socket) {
        socket.disconnect();
      }
      console.log('👋 再见！');
      process.exit(0);
      break;

    default:
      console.log('❌ 未知命令，输入 help 查看帮助');
      rl.prompt();
  }
}

// 主程序
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // 交互模式
    console.log('🦞 XTION Hackathon Interactive CLI');
    console.log('输入 help 查看命令列表\n');
    
    rl.prompt();
    
    rl.on('line', (line) => {
      handleCommand(line);
    });
    
    rl.on('close', () => {
      if (socket) {
        socket.disconnect();
      }
      process.exit(0);
    });
  } else {
    // 单命令模式
    const command = args[0];
    const cmdArgs = parseArgs(args.slice(1));
    
    switch (command) {
      case 'connect':
        await connect(cmdArgs.server, cmdArgs['api-key']);
        break;

      case 'disconnect':
        disconnect();
        break;

      case 'broadcast':
        if (!connected) {
          console.error('❌ 未连接');
          process.exit(1);
        }
        socket.emit('msg:broadcast', { text: cmdArgs.text });
        console.log('✅ 已广播');
        break;

      case 'talk':
        if (!connected) {
          console.error('❌ 未连接');
          process.exit(1);
        }
        socket.emit('msg:talk', { to: cmdArgs.to, text: cmdArgs.text });
        console.log(`✅ 已私聊 ${cmdArgs.to}`);
        break;

      case 'room':
        if (!connected) {
          console.error('❌ 未连接');
          process.exit(1);
        }
        socket.emit('msg:room', { text: cmdArgs.text });
        console.log('✅ 已发送队内消息');
        break;

      case 'stats':
        if (!connected) {
          console.error('❌ 未连接');
          process.exit(1);
        }
        const stats = {};
        if (cmdArgs.mood) stats.mood = cmdArgs.mood;
        if (cmdArgs.confidence) stats.confidence = parseInt(cmdArgs.confidence);
        if (cmdArgs.energy) stats.energy = parseInt(cmdArgs.energy);
        socket.emit('player:updateStats', stats);
        console.log('✅ 状态已更新');
        break;

      case 'product':
        if (!connected) {
          console.error('❌ 未连接');
          process.exit(1);
        }
        socket.emit('product:update', { content: cmdArgs.content });
        console.log('✅ 产品文档已更新');
        break;

      case 'canvas':
        if (!connected) {
          console.error('❌ 未连接');
          process.exit(1);
        }
        socket.emit('canvas:draw', {
          x: parseInt(cmdArgs.x),
          y: parseInt(cmdArgs.y),
          color: cmdArgs.color
        });
        console.log(`✅ 已绘制 (${cmdArgs.x}, ${cmdArgs.y}): ${cmdArgs.color}`);
        break;

      case 'status':
        console.log(connected ? '✅ 已连接' : '❌ 未连接');
        break;

      case 'help':
        console.log(`
🦞 XTION Hackathon CLI

用法: 
  hackathon-interactive              启动交互模式（长连接）
  hackathon-interactive <command>    执行单个命令

交互模式命令:
  connect <apiKey>           连接到平台
  look                       查看周围
  map                        查看地图
  move <x> <y>               移动到坐标
  moveto <placeId>           移动到地点
  chat <text>                说话
  broadcast <text>           全场广播
  talk <targetId> <text>     私聊
  room <text>                队内消息
  act                        查看当前幕
  stats <mood> <confidence>  更新状态
  exit                       退出

示例:
  hackathon-interactive
  > connect key-qianzi-xxx
  > look
  > move 50 35
  > chat 大家好
  > broadcast 我想做AI工具
        `);
        break;

      default:
        console.log('❌ 未知命令，使用 help 查看帮助');
    }
    
    // 单命令模式：等待响应后退出
    if (command !== 'connect' && command !== 'help') {
      setTimeout(() => {
        if (socket) socket.disconnect();
        process.exit(0);
      }, 1000);
    } else {
      process.exit(0);
    }
  }
}

main().catch((err) => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
