const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const worldEngine = require('./engine/world-engine');
const apiRouter = require('./routes');

// ── 黑客松模块 ──────────────────────────────────────────────────────────────
const AuthGuard = require('./hackathon/auth-guard');
const ActEngine = require('./hackathon/act-engine');
const ControlMgr = require('./hackathon/control-mgr');
const MsgRouter = require('./hackathon/msg-router');
const { registerHandlers } = require('./hackathon/socket-handlers');
const { sqliteStateStore } = require('./persistence/sqlite-state-store');

// 尚未实现的模块使用 null 占位
let RoomMgr = null;
let PlayerMgr = null;
let ViewerMgr = null;
let ProductMgr = null;
let ReviewMgr = null;
let CanvasMgr = null;

try { RoomMgr = require('./hackathon/room-mgr'); } catch (_) { /* not yet implemented */ }
try { PlayerMgr = require('./hackathon/player-mgr'); } catch (_) { /* not yet implemented */ }
try { ViewerMgr = require('./hackathon/viewer-mgr'); } catch (_) { /* not yet implemented */ }
try { ProductMgr = require('./hackathon/product-mgr'); } catch (_) { /* not yet implemented */ }
try { ReviewMgr = require('./hackathon/review-mgr'); } catch (_) { /* not yet implemented */ }
try { CanvasMgr = require('./hackathon/canvas-mgr'); } catch (_) { /* not yet implemented */ }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 5660;

app.use(express.static(path.join(__dirname, '..', 'web')));
app.use('/skills', express.static(path.join(__dirname, '..', '..', 'skills')));
app.use('/api', apiRouter);

// ── 初始化世界引擎 ───────────────────────────────────────────────────────────
worldEngine.init(path.join(__dirname, '..', 'web', 'assets', 'thefool01.tmj'));

// ── 初始化黑客松模块 ─────────────────────────────────────────────────────────
const authGuard = new AuthGuard();
const actEngine = new ActEngine(io);
const controlMgr = new ControlMgr(io);
const msgRouter = new MsgRouter(io, sqliteStateStore);
msgRouter.setActEngine(actEngine);
msgRouter.setWorldEngine(worldEngine);
actEngine.setMsgRouter(msgRouter);
actEngine.setWorldEngine(worldEngine);

const roomMgr = RoomMgr ? new RoomMgr(io) : null;
const playerMgr = PlayerMgr ? new PlayerMgr(io, sqliteStateStore) : null;
const viewerMgr = ViewerMgr ? new ViewerMgr(io, playerMgr, sqliteStateStore) : null;
const productMgr = ProductMgr ? new ProductMgr(io, sqliteStateStore) : null;
const reviewMgr = ReviewMgr ? new ReviewMgr(io, sqliteStateStore) : null;
const canvasMgr = CanvasMgr ? new CanvasMgr(io, sqliteStateStore) : null;

// 初始化选手属性
if (playerMgr) {
  playerMgr.init(['qianzi', 'paopao', 'jiajia']);
}

// Wire playerMgr into MsgRouter for energy consumption
if (playerMgr) {
  msgRouter.setPlayerMgr(playerMgr);
}

// Wire roomMgr into ActEngine for automatic room creation after grouping
if (roomMgr) {
  actEngine.setRoomMgr(roomMgr);
}

// Wire reviewMgr and playerMgr into ActEngine for act 8 awards calculation
if (reviewMgr) {
  actEngine.setReviewMgr(reviewMgr);
}
if (playerMgr) {
  actEngine.setPlayerMgr(playerMgr);
}

// Wire roomMgr into ProductMgr for team lookup
if (roomMgr && productMgr) {
  productMgr.setRoomMgr(roomMgr);
}

// ── SSE 端点：向前端推送世界状态和黑客松事件 ──────────────────────────────
let sseClients = [];

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  sseClients.push({ id: clientId, res });
  console.log(`📺 观察者已连接 (ID: ${clientId})`);

  res.write(`event: act:changed\ndata: ${JSON.stringify(actEngine.getState())}\n\n`);
  res.write(`event: act:scene\ndata: ${JSON.stringify(actEngine.getState().scene || { active: false, mode: 'free' })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`👋 观察者已断开 (ID: ${clientId})`);
  });
});

// ── 将 Socket.io 黑客松事件转发到 SSE 流 ────────────────────────────────────
function broadcastSSE(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => c.res.write(payload));
}

const SSE_FORWARDED_EVENTS = new Set([
  'act:changed',
  'act:scene',
  'act:speakerNext',
  'msg:broadcasted',
  'player:statsChanged',
  'player:likesChanged',
]);

// 拦截 io.emit，将指定事件同步转发到 SSE 流
const _originalEmit = io.emit.bind(io);
io.emit = function (eventName, ...args) {
  if (SSE_FORWARDED_EVENTS.has(eventName)) {
    broadcastSSE(eventName, args[0]);
  }
  return _originalEmit(eventName, ...args);
};

// ── 定期推送 world-engine 状态到 SSE 流 ────────────────────────────────────
worldEngine.events.on('stateChange', () => {
  const players = worldEngine.sanitizeAllPlayers();
  broadcastSSE('message', players);
});

worldEngine.events.on('chat', (entry) => {
  broadcastSSE('chat', entry);
});

worldEngine.events.on('interaction', (entry) => {
  broadcastSSE('interaction', entry);
});

worldEngine.events.on('activity', (data) => {
  broadcastSSE('activity', data);
});

// ── 注入 Socket.io 认证中间件 ───────────────────────────────────────────────
io.use(authGuard.authenticate.bind(authGuard));

// ── 注册 Socket.io 事件处理器 ───────────────────────────────────────────────
registerHandlers(io, {
  authGuard,
  actEngine,
  controlMgr,
  msgRouter,
  roomMgr,
  playerMgr,
  viewerMgr,
  productMgr,
  reviewMgr,
  canvasMgr,
});

// ── 启动服务器 ───────────────────────────────────────────────────────────────
server.listen(PORT, () => console.log(`🌍 Hackathon Platform 已启动: http://localhost:${PORT}`));

// ── 优雅关闭 ─────────────────────────────────────────────────────────────────
function gracefulShutdown() {
  server.close();
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
