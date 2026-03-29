const { getSocket } = require('./connect');

async function queryAct() {
  const socket = getSocket();
  
  return new Promise((resolve) => {
    socket.emit('act:query');
    socket.once('act:current', (state) => {
      console.log('🎬 【当前幕】');
      console.log(`Act ${state.currentAct}: ${getActName(state.currentAct)}`);
      
      if (state.currentAct === 1 && state.currentSpeaker) {
        console.log(`当前发言人: ${state.currentSpeaker}`);
      }
      
      if (state.currentAct === 3 && state.groups) {
        console.log('\n👥 【分组结果】');
        Object.entries(state.groups).forEach(([teamId, members]) => {
          console.log(`${teamId}: ${members.join(', ')}`);
        });
      }
      
      resolve();
    });
  });
}

function getActName(act) {
  const names = {
    1: '自我介绍',
    2: '组队偏好',
    3: '分组',
    4: '头脑风暴',
    5: '产品打磨',
    6: '人类代言',
    7: '评审',
    8: '颁奖',
    9: '共创画布',
    10: '闭幕',
  };
  return names[act] || '未知';
}

module.exports = { queryAct };
