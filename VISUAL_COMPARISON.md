# 可视化对比 - 短连接 vs 长连接

## 一、小镇阶段（Town Mode）

### Town CLI（短连接）
```
用户输入命令
    ↓
┌─────────────────────────────────────┐
│ 进程 A 启动                          │
│   ↓                                 │
│ 创建 HTTP 客户端                     │
│   ↓                                 │
│ POST /api/walk { x: 80, y: 60 }    │
│   ↓                                 │
│ 等待响应...（7.2 秒）                │
│   ↓                                 │
│ 收到响应：{ x: 80, y: 60 }          │
│   ↓                                 │
│ 显示结果                             │
│   ↓                                 │
│ 进程 A 退出 ❌                       │
└─────────────────────────────────────┘

看到的：
✅ 移动完成: (80, 60)

看不到的：
❌ 移动中... (5, 6)
❌ 移动中... (6, 6)
❌ ...
```

### 前端浏览器（长连接）
```
页面加载
    ↓
┌─────────────────────────────────────┐
│ 创建 SSE 连接                        │
│   ↓                                 │
│ const eventSource = new EventSource('/events')
│   ↓                                 │
│ 持续监听服务器推送 ✅                 │
│   ↓                                 │
│ 收到更新：{ x: 5, y: 6 }             │
│   ↓                                 │
│ 更新 targetX = 5 * 32               │
│   ↓                                 │
│ 游戏循环：displayX → targetX         │
│   ↓                                 │
│ 收到更新：{ x: 6, y: 6 }             │
│   ↓                                 │
│ 更新 targetX = 6 * 32               │
│   ↓                                 │
│ 游戏循环：displayX → targetX         │
│   ↓                                 │
│ ...（36 次更新）                     │
│   ↓                                 │
│ 连接保持打开 ✅                      │
└─────────────────────────────────────┘

看到的：
✅ 平滑移动动画（60 FPS）
✅ 从 (5, 5) 流畅移动到 (80, 60)
```


---

## 二、黑客松阶段（Hackathon Mode）

### XTION CLI（短连接）
```
用户输入命令
    ↓
┌─────────────────────────────────────┐
│ 进程 A 启动                          │
│   ↓                                 │
│ 读取 ~/.xtion-session.json          │
│   ↓                                 │
│ 创建 Socket.io 客户端                │
│   ↓                                 │
│ socket.emit('world:move', ...)      │
│   ↓                                 │
│ 等待 moveResult...（7.2 秒）         │
│   ↓                                 │
│ 收到 moveResult                      │
│   ↓                                 │
│ 显示结果                             │
│   ↓                                 │
│ 进程 A 退出 ❌                       │
└─────────────────────────────────────┘

看到的：
✅ 移动完成: (80, 60)

看不到的：
❌ 移动中... (5, 6) [1/36]
❌ 移动中... (6, 6) [2/36]
❌ ...
```

### Interactive CLI（长连接）
```
启动程序
    ↓
┌─────────────────────────────────────┐
│ 进程 I 启动                          │
│   ↓                                 │
│ 等待用户输入                         │
│   ↓                                 │
│ 用户输入：connect key-qianzi-xxx     │
│   ↓                                 │
│ 创建 Socket.io 客户端                │
│   ↓                                 │
│ 连接成功 ✅                          │
│   ↓                                 │
│ 监听所有事件 ✅                      │
│   ↓                                 │
│ 用户输入：move 80 60                 │
│   ↓                                 │
│ socket.emit('world:move', ...)      │
│   ↓                                 │
│ 收到 moveProgress [1/36] ✅          │
│   ↓                                 │
│ 显示：🚶 移动中... (5, 6) [1/36]     │
│   ↓                                 │
│ 收到 moveProgress [2/36] ✅          │
│   ↓                                 │
│ 显示：🚶 移动中... (6, 6) [2/36]     │
│   ↓                                 │
│ ...（36 次更新）                     │
│   ↓                                 │
│ 收到 moveResult ✅                   │
│   ↓                                 │
│ 显示：✅ 到达: 展示区                 │
│   ↓                                 │
│ 等待下一个命令                       │
│   ↓                                 │
│ 进程 I 继续运行 ✅                   │
└─────────────────────────────────────┘

看到的：
✅ 移动中... (5, 6) [1/36]
✅ 移动中... (6, 6) [2/36]
✅ ...
✅ 到达: 展示区
```


### MCP Bridge（持久连接）
```
启动 MCP 服务器
    ↓
┌─────────────────────────────────────┐
│ 进程 M 启动                          │
│   ↓                                 │
│ 等待 MCP 调用                        │
│   ↓                                 │
│ OpenClaw 调用：hackathon_connect     │
│   ↓                                 │
│ 创建 Socket.io 客户端                │
│   ↓                                 │
│ 连接成功 ✅                          │
│   ↓                                 │
│ 监听所有事件并保存到 hackathonEvents ✅│
│   ↓                                 │
│ OpenClaw 调用：hackathon_move        │
│   ↓                                 │
│ socket.emit('world:move', ...)      │
│   ↓                                 │
│ 收到 moveProgress [1/36] ✅          │
│   ↓                                 │
│ 保存到 hackathonEvents ✅            │
│   ↓                                 │
│ 收到 moveProgress [2/36] ✅          │
│   ↓                                 │
│ 保存到 hackathonEvents ✅            │
│   ↓                                 │
│ ...（36 次更新）                     │
│   ↓                                 │
│ 收到 moveResult ✅                   │
│   ↓                                 │
│ 返回给 OpenClaw                      │
│   ↓                                 │
│ OpenClaw 调用：hackathon_get_events  │
│   ↓                                 │
│ 返回 hackathonEvents（包含所有进度） │
│   ↓                                 │
│ 等待下一个调用                       │
│   ↓                                 │
│ 进程 M 继续运行 ✅                   │
└─────────────────────────────────────┘

看到的：
✅ 移动结果
✅ 事件历史（包含所有进度）
```


### OpenClaw CLI（半短连接）
```
用户输入命令
    ↓
┌─────────────────────────────────────┐
│ 进程 O 启动                          │
│   ↓                                 │
│ 创建 Socket.io 客户端                │
│   ↓                                 │
│ 连接成功 ✅                          │
│   ↓                                 │
│ socket.emit('msg:broadcast', ...)   │
│   ↓                                 │
│ 收到 msg:broadcasted ✅              │
│   ↓                                 │
│ 显示结果                             │
│   ↓                                 │
│ 等待用户按回车...                    │
│   ↓                                 │
│ 用户按回车                           │
│   ↓                                 │
│ 进程 O 退出 ❌                       │
└─────────────────────────────────────┘

问题：
❌ 缺少 world 命令（move、look、map）
❌ 每次命令后退出
❌ 看不到实时进度
```

---

## 三、时间线对比

### 小镇阶段（Town Mode）

**时间轴**：
```
T=0s    Town CLI 发送 POST /api/walk
        ↓
        前端浏览器收到 SSE 推送 (5, 6)
        ↓
T=0.2s  前端浏览器收到 SSE 推送 (6, 6)
        ↓
T=0.4s  前端浏览器收到 SSE 推送 (7, 6)
        ↓
        ...
        ↓
T=7.2s  前端浏览器收到 SSE 推送 (80, 60)
        ↓
        Town CLI 收到 HTTP 响应 { x: 80, y: 60 }
```

**Town CLI 看到的**：
```
T=0s    发送请求
T=7.2s  收到响应：✅ 移动完成
```

**前端浏览器看到的**：
```
T=0s    开始移动
T=0.2s  移动到 (6, 6)
T=0.4s  移动到 (7, 6)
...
T=7.2s  到达 (80, 60)
```


### 黑客松阶段（Hackathon Mode）

#### XTION CLI（短连接）
```
T=0s    XTION CLI 发送 world:move
        ↓
        前端浏览器收到 SSE 推送 (5, 6)
        ↓
T=0.2s  前端浏览器收到 SSE 推送 (6, 6)
        ↓
        ...
        ↓
T=7.2s  前端浏览器收到 SSE 推送 (80, 60)
        ↓
        XTION CLI 收到 moveResult
```

**XTION CLI 看到的**：
```
T=0s    发送请求
T=7.2s  收到响应：✅ 移动完成
```

#### Interactive CLI（长连接）
```
T=0s    Interactive CLI 发送 world:move
        ↓
        前端浏览器收到 SSE 推送 (5, 6)
        Interactive CLI 收到 moveProgress [1/36] ✅
        ↓
T=0.2s  前端浏览器收到 SSE 推送 (6, 6)
        Interactive CLI 收到 moveProgress [2/36] ✅
        ↓
        ...
        ↓
T=7.2s  前端浏览器收到 SSE 推送 (80, 60)
        Interactive CLI 收到 moveProgress [36/36] ✅
        Interactive CLI 收到 moveResult ✅
```

**Interactive CLI 看到的**：
```
T=0s    发送请求
T=0.2s  🚶 移动中... (5, 6) [1/36]
T=0.4s  🚶 移动中... (6, 6) [2/36]
...
T=7.2s  🚶 移动中... (80, 60) [36/36]
        ✅ 到达: 展示区
```

#### MCP Bridge（持久连接）
```
T=0s    OpenClaw 调用 hackathon_move
        ↓
        MCP Bridge 发送 world:move
        ↓
        前端浏览器收到 SSE 推送 (5, 6)
        MCP Bridge 收到 moveProgress [1/36] ✅
        保存到 hackathonEvents ✅
        ↓
T=0.2s  前端浏览器收到 SSE 推送 (6, 6)
        MCP Bridge 收到 moveProgress [2/36] ✅
        保存到 hackathonEvents ✅
        ↓
        ...
        ↓
T=7.2s  前端浏览器收到 SSE 推送 (80, 60)
        MCP Bridge 收到 moveProgress [36/36] ✅
        MCP Bridge 收到 moveResult ✅
        返回给 OpenClaw
```

**OpenClaw 看到的**：
```
T=0s    调用 hackathon_move
T=7.2s  收到响应：✅ 移动完成

# 查看事件历史
hackathon_get_events({ limit: 10 })
→ 看到所有 moveProgress 事件 ✅
```

