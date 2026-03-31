const { getSocket } = require('./connect');

const eventLog = [];

function startEventListener(socket) {
  const events = [
    'act:changed',
    'act:speakerNext',
    'msg:broadcasted',
    'msg:talked',
    'msg:roomed',
    'player:status',
    'player:statsChanged',
    'product:changed',
    'product:locked',
    'product:conflict',
    'canvas:pixel',
    'review:new',
    'act8:awards',
    'act2:preferences',
    'act3:grouped',
  ];
  
  events.forEach(eventName => {
    socket.on(eventName, (data) => {
      eventLog.push({
        type: eventName,
        timestamp: new Date().toISOString(),
        data,
      });
    });
  });
}

async function getEvents(args) {
  const socket = getSocket();
  
  // Start listener if not already started
  if (eventLog.length === 0) {
    startEventListener(socket);
  }
  
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) : 10;
  
  const recentEvents = eventLog.slice(-limit);
  
  if (recentEvents.length === 0) {
    console.log('📭 暂无事件');
    return;
  }
  
  console.log(`📬 【最近 ${recentEvents.length} 个事件】\n`);
  recentEvents.forEach(e => {
    console.log(`[${e.timestamp}] ${e.type}`);
    console.log(JSON.stringify(e.data, null, 2));
    console.log('');
  });
}

module.exports = { getEvents, startEventListener };
