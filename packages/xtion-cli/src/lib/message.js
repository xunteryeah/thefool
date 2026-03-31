const { getSocket } = require('./connect');

async function broadcast(args) {
  const socket = getSocket();
  const textIndex = args.indexOf('--text');
  
  if (textIndex < 0) {
    console.error('❌ 需要 --text 参数');
    process.exit(1);
  }
  
  const text = args[textIndex + 1];
  socket.emit('msg:broadcast', { text });
  console.log(`📢 已广播: "${text}"`);
}

async function talk(args) {
  const socket = getSocket();
  const toIndex = args.indexOf('--to');
  const textIndex = args.indexOf('--text');
  
  if (toIndex < 0 || textIndex < 0) {
    console.error('❌ 需要 --to 和 --text 参数');
    process.exit(1);
  }
  
  const to = args[toIndex + 1];
  const text = args[textIndex + 1];
  
  socket.emit('msg:talk', { to, text });
  console.log(`💬 已私聊 ${to}: "${text}"`);
}

async function room(args) {
  const socket = getSocket();
  const textIndex = args.indexOf('--text');
  
  if (textIndex < 0) {
    console.error('❌ 需要 --text 参数');
    process.exit(1);
  }
  
  const text = args[textIndex + 1];
  socket.emit('msg:room', { text });
  console.log(`👥 队内消息: "${text}"`);
}

module.exports = { broadcast, talk, room };
