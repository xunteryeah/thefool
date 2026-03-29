const { getSocket } = require('./connect');

async function look() {
  const socket = getSocket();
  
  return new Promise((resolve) => {
    socket.emit('world:look');
    socket.once('world:lookResult', (result) => {
      console.log('📍 【位置感知】');
      console.log(`你当前坐标: (${result.player.x}, ${result.player.y})`);
      console.log(`你目前位于: ${result.player.zone}`);
      if (result.player.zoneDesc) {
        console.log(`环境描述: ${result.player.zoneDesc}`);
      }
      
      if (result.nearby && result.nearby.length > 0) {
        console.log('\n👥 【附近的人】');
        result.nearby.forEach(p => {
          let line = `- ${p.name} 距离你 ${p.distance} 步 (位于 ${p.zone})，在你的${p.relativeDirection}`;
          if (p.message) line += `，正在说: "${p.message}"`;
          console.log(line);
        });
      }
      
      resolve();
    });
  });
}

async function move(args) {
  const socket = getSocket();
  const target = {};
  
  const toIndex = args.indexOf('--to');
  const xIndex = args.indexOf('--x');
  const yIndex = args.indexOf('--y');
  const forwardIndex = args.indexOf('--forward');
  const rightIndex = args.indexOf('--right');
  
  if (toIndex >= 0) target.to = args[toIndex + 1];
  if (xIndex >= 0) target.x = parseInt(args[xIndex + 1]);
  if (yIndex >= 0) target.y = parseInt(args[yIndex + 1]);
  if (forwardIndex >= 0) target.forward = parseInt(args[forwardIndex + 1]);
  if (rightIndex >= 0) target.right = parseInt(args[rightIndex + 1]);
  
  return new Promise((resolve) => {
    socket.emit('world:move', target);
    socket.once('world:moveResult', (result) => {
      if (result.error) {
        console.error('❌', result.error);
      } else {
        console.log(`🚶 移动完成: 走了 ${result.pathLength} 步`);
        console.log(`📍 到达: ${result.targetZone} (${result.player.x}, ${result.player.y})`);
        if (result.wasBlocked) {
          console.log('⚠️ 目标被阻挡，已移动到最近的可行走位置');
        }
      }
      resolve();
    });
  });
}

async function map() {
  const socket = getSocket();
  
  return new Promise((resolve) => {
    socket.emit('world:map');
    socket.once('world:mapResult', (result) => {
      console.log('🗺️ 【地图目录】\n');
      result.forEach(place => {
        console.log(`${place.id}`);
        console.log(`  名称: ${place.name}`);
        console.log(`  坐标: (${place.x}, ${place.y})`);
        if (place.description) {
          console.log(`  描述: ${place.description}`);
        }
        console.log('');
      });
      resolve();
    });
  });
}

async function interact() {
  const socket = getSocket();
  
  return new Promise((resolve) => {
    socket.emit('world:interact');
    socket.once('world:interactResult', (result) => {
      console.log(`🎭 ${result.action}`);
      console.log(`📝 ${result.result}`);
      resolve();
    });
  });
}

async function chat(args) {
  const socket = getSocket();
  const textIndex = args.indexOf('--text');
  
  if (textIndex < 0) {
    console.error('❌ 需要 --text 参数');
    process.exit(1);
  }
  
  const text = args[textIndex + 1];
  
  return new Promise((resolve) => {
    socket.emit('world:chat', { text });
    socket.once('world:chatResult', () => {
      console.log(`💬 已说话: "${text}"`);
      resolve();
    });
  });
}

module.exports = { look, move, map, interact, chat };
