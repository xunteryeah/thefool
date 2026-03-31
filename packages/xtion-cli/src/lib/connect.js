const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_FILE = path.join(os.homedir(), '.xtion-session.json');

let socket = null;
let connected = false;

function saveSession(apiKey, serverUrl) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ apiKey, serverUrl }, null, 2));
}

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
}

function getSocket() {
  if (!socket || !connected) {
    throw new Error('未连接到平台，请先运行: xtion connect --apiKey <KEY>');
  }
  return socket;
}

async function connect(args) {
  const apiKeyIndex = args.indexOf('--apiKey');
  const serverIndex = args.indexOf('--server');
  
  const apiKey = apiKeyIndex >= 0 ? args[apiKeyIndex + 1] : null;
  const serverUrl = serverIndex >= 0 ? args[serverIndex + 1] : 'http://localhost:5660';

  if (!apiKey) {
    console.error('❌ 需要提供 --apiKey 参数');
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    socket = io(serverUrl, {
      auth: { apiKey },
      reconnection: true,
    });

    socket.on('connect', () => {
      connected = true;
      saveSession(apiKey, serverUrl);
      console.log('✅ 已连接到黑客松平台');
      console.log('📍 你已出现在 MainHall');
      resolve();
    });

    socket.on('connect_error', (error) => {
      console.error('❌ 连接失败:', error.message);
      reject(error);
    });

    socket.on('disconnect', () => {
      connected = false;
      console.log('👋 已断开连接');
    });

    setTimeout(() => {
      if (!connected) {
        reject(new Error('连接超时'));
      }
    }, 5000);
  });
}

async function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
    connected = false;
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
    console.log('✅ 已断开连接');
  } else {
    console.log('⚠️ 未连接到平台');
  }
}

module.exports = { connect, disconnect, getSocket, loadSession };
