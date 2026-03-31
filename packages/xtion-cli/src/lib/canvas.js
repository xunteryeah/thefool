const { getSocket } = require('./connect');

async function draw(args) {
  const socket = getSocket();
  
  const xIndex = args.indexOf('--x');
  const yIndex = args.indexOf('--y');
  const colorIndex = args.indexOf('--color');
  
  if (xIndex < 0 || yIndex < 0 || colorIndex < 0) {
    console.error('❌ 需要 --x, --y, --color 参数');
    process.exit(1);
  }
  
  const x = parseInt(args[xIndex + 1]);
  const y = parseInt(args[yIndex + 1]);
  const color = args[colorIndex + 1];
  
  socket.emit('canvas:draw', { x, y, color });
  console.log(`🎨 已绘制像素 (${x}, ${y}): ${color}`);
}

module.exports = { draw };
