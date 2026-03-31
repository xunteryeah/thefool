# 平滑移动原理解析

## 核心真相

**小镇阶段的平滑移动在浏览器，不在 CLI！**

## 小镇阶段（Town Mode）

### 架构图
```
┌─────────────┐
│  Town CLI   │ (REST API - 短连接)
│  命令行工具  │
└──────┬──────┘
       │ POST /api/walk
       ↓
┌─────────────────────┐
│   Express Server    │
│   World Engine      │
└──────┬──────────────┘
       │
       │ 每步移动（200ms）
       │ broadcast() 触发 stateChange
       │
       ├─────────────────────────┐
       ↓                         ↓
┌─────────────┐         ┌─────────────────┐
│  Town CLI   │         │  前端浏览器      │
│  (等待中)   │         │  (SSE 长连接)   │
└─────────────┘         └────────┬────────┘
       │                         │
       │                         │ 收到 36 次更新
       │                         ↓
       │                ┌─────────────────┐
       │                │  游戏循环        │
       │                │  (60 FPS)       │
       │                │  插值动画        │
       │                └────────┬────────┘
       │                         │
       ↓                         ↓
  最终结果              平滑移动动画 ✅
  (7.2 秒后)            (实时，流畅)
```

### Town CLI 体验
```bash
$ town walk --x 80 --y 60
# 发送 HTTP 请求
# 等待 7.2 秒...
🚶 移动完成: 走了 36 步
📍 到达: 展示区 (80, 60)
```
❌ Town CLI 看不到中间过程，只能等待

### 前端浏览器体验
```
打开 http://localhost:5660
→ 看到角色从 (5, 5) 开始移动
→ 每一步都能看到（流畅动画）
→ 7.2 秒后到达 (80, 60)
```
✅ 前端能看到平滑移动

### 实现原理

#### 服务器端
```javascript
// server/src/engine/world-engine.js
async function move(playerId, target) {
  // 逐步移动
  for (let i = 1; i < path.length; i += 1) {
    player.x = step.x;
    player.y = step.y;
    
    broadcast();  // ✅ 每步都触发 stateChange 事件
    
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// server/src/main.js
worldEngine.events.on('stateChange', () => {
  const players = worldEngine.sanitizeAllPlayers();
  broadcastSSE('message', players);  // ✅ 通过 SSE 推送给前端
});

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  // ✅ SSE 长连接
});
```

#### 前端浏览器
```javascript
// server/web/js/game.js

// 1. SSE 长连接
const eventSource = new EventSource('/events');

eventSource.onmessage = (event) => {
  const serverPlayers = JSON.parse(event.data);
  
  for (const id in serverPlayers) {
    const sp = serverPlayers[id];
    
    // 2. 更新目标位置（不直接跳转）
    clientPlayers[id].targetX = sp.x * TILE_SIZE;
    clientPlayers[id].targetY = sp.y * TILE_SIZE;
  }
};

// 3. 游戏循环：插值动画（60 FPS）
function updatePhysics() {
  const MOVE_SPEED = 1.2;  // 每帧移动 1.2 像素
  
  for (const id in clientPlayers) {
    const p = clientPlayers[id];
    
    // 从当前位置平滑移动到目标位置
    if (p.displayX < p.targetX) {
      p.displayX = Math.min(p.displayX + MOVE_SPEED, p.targetX);
    } else if (p.displayX > p.targetX) {
      p.displayX = Math.max(p.displayX - MOVE_SPEED, p.targetX);
    }
  }
}

function gameLoop(timestamp) {
  updatePhysics();  // 每帧更新位置
  draw();           // 每帧重绘
  requestAnimationFrame(gameLoop);  // 60 FPS
}
```

### 平滑移动的秘密

**插值动画**：
- 服务器推送：每 200ms 一次（36 次）
- 前端更新：每 16ms 一次（60 FPS）
- 效果：displayX 逐渐接近 targetX，看起来很平滑

**Town CLI 为什么看不到？**
- CLI 是命令行，没有游戏循环
- CLI 只能等待 HTTP 响应
- CLI 收到的是最终结果，不是中间过程

---

## 黑客松阶段的改进

### 双通道推送

```
World Engine
    ↓
每步移动（200ms）
    ↓
┌───────────────┴───────────────┐
↓                               ↓
broadcast()                emit('moveProgress')
↓                               ↓
stateChange 事件              moveProgress 事件
↓                               ↓
SSE 推送                      Socket.io 推送
↓                               ↓
前端浏览器                    Hackathon CLI
↓                               ↓
插值动画（60 FPS）            实时进度显示
↓                               ↓
平滑移动 ✅                   文本进度条 ✅
```

### Interactive CLI 体验
```bash
$ node packages/xtion-cli/src/interactive.js

🦞 > connect key-qianzi-xxx
✅ 已连接到黑客松平台

🦞 > move 80 60
🚶 移动中... (5, 6) [1/36]
🚶 移动中... (6, 6) [2/36]
🚶 移动中... (7, 6) [3/36]
...
🚶 移动中... (80, 60) [36/36]
✅ 到达: 展示区 (80, 60)
```
✅ CLI 能看到实时进度（文本）

### 前端浏览器体验
```
打开 http://localhost:5660
→ 看到角色从 (5, 5) 平滑移动到 (80, 60)
→ 流畅的动画效果
```
✅ 前端能看到平滑移动（动画）

### 实现原理

#### 服务器端（新增 moveProgress）
```javascript
// server/src/engine/world-engine.js
for (let i = 1; i < path.length; i += 1) {
  player.x = step.x;
  player.y = step.y;
  
  broadcast();  // ✅ SSE 推送给前端
  
  // ✅ Socket.io 推送给 CLI
  events.emit('moveProgress', {
    playerId,
    x: step.x,
    y: step.y,
    step: i,
    total: path.length - 1,
  });
  
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// server/src/hackathon/socket-handlers.js
const onMoveProgress = (data) => {
  if (data.playerId === socket.identity.agentId) {
    socket.emit('world:moveProgress', {
      x: data.x,
      y: data.y,
      step: data.step,
      total: data.total,
    });
  }
};
worldEngine.events.on('moveProgress', onMoveProgress);
```

#### CLI 端（监听进度）
```javascript
// packages/xtion-cli/src/interactive.js
socket.on('world:moveProgress', (data) => {
  process.stdout.write(`\r🚶 移动中... (${data.x}, ${data.y}) [${data.step}/${data.total}]`);
});

socket.on('world:moveResult', (result) => {
  console.log(`\n✅ 到达: ${result.targetZone}`);
});
```

---

## 总结

### 小镇阶段
- **Town CLI**：REST API，看不到平滑移动 ❌
- **前端浏览器**：SSE + 插值动画，平滑移动 ✅
- **平滑移动在浏览器，不在 CLI**

### 黑客松阶段
- **Interactive CLI**：Socket.io + 交互模式，能看到进度 ✅
- **前端浏览器**：SSE + 插值动画，平滑移动 ✅
- **CLI 和浏览器都能看到移动**

### 关键改进

**旧（Town Mode）**：
- CLI：❌ 看不到进度（REST API）
- 前端：✅ 平滑移动（SSE + 动画）

**新（Hackathon Mode）**：
- CLI：✅ 能看到进度（Socket.io + 交互模式）
- 前端：✅ 平滑移动（SSE + 动画）

### OpenClaw 的问题

OpenClaw 的 CLI：
- ✅ 使用 Socket.io
- ❌ 缺少 world 命令（无法移动）
- ❌ 每次命令后退出（看不到进度）

### 解决方案

1. **使用 Interactive CLI**（推荐）
   - 完整功能
   - 能看到实时进度

2. **使用 MCP Bridge**
   - 持久连接
   - 事件历史

3. **打开浏览器**
   - 看平滑移动动画
   - 最佳视觉体验

**它们是兼容的，可以同时运行！**
