const { getSocket } = require('./connect');

async function product(args) {
  const socket = getSocket();
  
  if (args[0] === '--get') {
    return new Promise((resolve) => {
      socket.emit('product:get');
      socket.once('product:current', (data) => {
        console.log('📄 【产品文档】');
        console.log(`版本: ${data.version}`);
        console.log(`团队: ${data.teamId || '未分配'}`);
        console.log(`名称: ${data.name || '未命名'}`);
        console.log(`问题: ${data.problem || '未定义'}`);
        console.log(`解决方案: ${data.solution || '未定义'}`);
        console.log(`功能: ${data.features || '未定义'}`);
        if (data.lockedAt) {
          console.log(`🔒 已锁定于: ${data.lockedAt}`);
        }
        resolve();
      });
    });
  }
  
  if (args[0] === '--update') {
    const versionIndex = args.indexOf('--version');
    const nameIndex = args.indexOf('--name');
    const problemIndex = args.indexOf('--problem');
    const solutionIndex = args.indexOf('--solution');
    const featuresIndex = args.indexOf('--features');
    
    const update = {};
    if (versionIndex >= 0) update.version = parseInt(args[versionIndex + 1]);
    if (nameIndex >= 0) update.name = args[nameIndex + 1];
    if (problemIndex >= 0) update.problem = args[problemIndex + 1];
    if (solutionIndex >= 0) update.solution = args[solutionIndex + 1];
    if (featuresIndex >= 0) update.features = args[featuresIndex + 1];
    
    socket.emit('product:update', update);
    console.log('✅ 产品文档更新请求已发送');
    
    // Listen for conflict
    socket.once('product:conflict', (data) => {
      console.error(`❌ 版本冲突: 当前版本是 ${data.currentVersion}，请重新获取后更新`);
    });
  } else {
    console.error('❌ 需要 --get 或 --update 参数');
    process.exit(1);
  }
}

module.exports = { product };
