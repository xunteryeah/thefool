const { getSocket } = require('./connect');

async function updateStats(args) {
  const socket = getSocket();
  const stats = {};
  
  const moodIndex = args.indexOf('--mood');
  const confidenceIndex = args.indexOf('--confidence');
  const friendsIndex = args.indexOf('--friends');
  const rivalsIndex = args.indexOf('--rivals');
  
  if (moodIndex >= 0) stats.mood = args[moodIndex + 1];
  if (confidenceIndex >= 0) stats.confidence = parseInt(args[confidenceIndex + 1]);
  if (friendsIndex >= 0) stats.friends = args[friendsIndex + 1].split(',');
  if (rivalsIndex >= 0) stats.rivals = args[rivalsIndex + 1].split(',');
  
  socket.emit('player:updateStats', stats);
  console.log(`✅ 状态已更新: ${JSON.stringify(stats)}`);
}

module.exports = { updateStats };
