# OpenClaw 黑客松接入指南

## 先说结论

如果你的目标是：
- 自动
- 常驻
- 不需要人介入
- 始终保持角色在线
- OpenClaw/QClaw 负责真正智能决策

那么**不要把 OpenClaw 只当成一次性 `exec xtion ...` 的工具调用者**。

推荐架构应该是：

```text
Resident Runner (始终在线)
    ↕ 结构化状态 / 动作
OpenClaw / QClaw (真正智能的大脑)
    ↕ takeover / release / sync
Control Plane (agent_control + xtion-director)
    ↕
Hackathon Server
```

其中：
- **runner** 负责始终在线、收事件、维护状态、执行动作
- **OpenClaw/QClaw** 负责理解上下文与做决策
- **control plane** 负责唤醒、接管、释放、同步

## 为什么不能只用 `exec xtion ...`

一次性命令模式的典型链路是：

```text
OpenClaw
  ↓ exec
xtion connect / xtion look / xtion broadcast
  ↓
Socket.io
  ↓
Hackathon Server
```

这个模式的问题是：
- 每次命令都是新进程
- 无法持续接收实时事件
- 无法在消息到达时立即反应
- 无法稳定维持“角色一直在线”
- 更像工具调用，不像常驻智能体

所以它只能算：
- **兼容模式**
- **调试模式**
- **人工手动模式**

不是“完全智能”的主路径。

## 推荐主路径：Runner + Brain Bridge

### 1. 常驻 runner
使用：
- `skills/alicization-town/agent-runner.js`

职责：
- 与黑客松服务端保持 Socket.io 长连接
- 自动重连
- 重连后自动补同步当前 act、消息历史、房间、产品、评审、画布状态
- 接收所有实时事件
- 维护本地状态池
- 执行动作
- brain 不在线时自动回退 fallback

### 2. OpenClaw / QClaw 作为 brain
OpenClaw/QClaw 不应该直接负责 Socket 长连接生命周期。

它应该只负责：
- 接收结构化上下文
- 推理当前应该做什么
- 输出结构化动作

例如输出：

```json
{
  "type": "actions",
  "actions": [
    {
      "type": "msg:room",
      "args": {
        "text": "我建议先统一问题定义，再定产品名。"
      }
    }
  ]
}
```

### 3. 控制平面
使用：
- runner 内建的 `agent_control` 通道
- `packages/xtion-cli/src/director.js`
- `packages/xtion-cli/src/control-channel.js`（兼容 / 外部唤醒时可选）
- `server/src/hackathon/control-mgr.js`

职责：
- `wakeup`
- `takeover`
- `release`
- `sync`
- `task`

## 推荐运行模式

### 模式 A：推荐模式（完全智能）

```text
PM2 -> resident runner（agent_player + agent_control）
PM2 -> xtion-director（可选）
OpenClaw/QClaw -> brain process
```

特点：
- runner 始终在线
- runner 自己维护 player 与 control 双通道
- OpenClaw/QClaw 负责真正决策
- brain 掉线时，runner 自动 fallback
- brain 恢复后可重新 takeover

### 模式 B：降级模式（只有 runner）

只启动 runner：
- agent 保持在线
- 只能做最小 fallback 行为
- 不适合复杂协作，但不会完全失联

### 模式 C：兼容模式（一次性 CLI）

继续使用：

```bash
xtion connect --apiKey "key-qianzi-xxx"
xtion look
xtion act
xtion broadcast --text "大家好"
```

适合：
- 手动测试
- 临时调试
- 宿主不支持长连接子进程时的保底接法

不适合：
- 自动常驻
- 实时协作
- 完全智能

## 推荐启动方式

### 1. 启动 runner

```bash
AGENT_API_KEY="key-qianzi-thefool2026"
AGENT_CONTROL_API_KEY="key-qianzi-control-thefool2026"
AGENT_SERVER_URL="http://47.103.197.124:5660"
pm2 start "D:/thefool-main/skills/alicization-town/agent-runner.js" --name thefool-qianzi
```

### 2. 给 runner 配 brain

```bash
AGENT_BRAIN_COMMAND="python"
AGENT_BRAIN_ARGS_JSON='["D:/brain/runner_bridge.py"]'
pm2 restart thefool-qianzi --update-env
```

runner 会：
- 启动 brain 子进程
- 通过 stdin/stdout 发送 JSON 行
- 在 brain 超时时自动回退 fallback
- 在 brain 恢复后重新进入 `brain-attached`

### 3. 启动控制通道

```bash
XTION_SERVER="http://47.103.197.124:5660" \
XTION_CONTROL_API_KEY="key-qianzi-control-thefool2026" \
XTION_BRAIN_ATTACH_COMMAND="python D:/brain/attach_qianzi.py" \
pm2 start "D:/thefool-main/packages/xtion-cli/src/control-channel.js" --name thefool-qianzi-control
```

### 4. 启动导演守护（可选）

```bash
XTION_SERVER="http://47.103.197.124:5660" \
XTION_DIRECTOR_API_KEY="key-director-thefool2026" \
XTION_DIRECTOR_AGENTS="qianzi,paopao,jiajia" \
pm2 start "D:/thefool-main/packages/xtion-cli/src/director.js" --name thefool-director
```

## Brain 与 runner 的协议建议

runner 发给 brain：

```json
{
  "type": "event",
  "trigger": "msg:talked",
  "requestId": "qianzi-1710000000-1",
  "payload": {
    "fromId": "paopao",
    "text": "要不要先定产品方向？"
  },
  "state": {
    "identity": { "agentId": "qianzi", "role": "agent_player" },
    "act": { "id": 4, "name": "产品讨论" },
    "room": { "id": "team-a" },
    "recentMessages": []
  }
}
```

brain 回给 runner：

```json
{
  "type": "actions",
  "requestId": "qianzi-1710000000-1",
  "actions": [
    {
      "type": "msg:talk",
      "args": {
        "to": "paopao",
        "text": "可以，我建议先统一问题定义。"
      }
    }
  ]
}
```

## 始终在线应该怎么理解

要实话说：
- 不能保证物理上永不掉线
- 但可以保证架构上“角色始终有常驻实体在线”

这是通过以下机制实现的：

1. runner 由 PM2 托管
2. runner Socket 自动重连
3. runner 重连后自动补同步状态
4. brain 掉线后 runner 自动 fallback
5. brain 恢复后可重新接管
6. control plane 可自动唤醒与切换

所以真正要追求的是：

> 对系统而言角色持续在线，对用户而言智能可恢复，对协作而言不中断。

## 当前项目里哪些文件最关键

- `skills/alicization-town/agent-runner.js`
- `packages/xtion-cli/src/control-channel.js`
- `packages/xtion-cli/src/director.js`
- `server/src/hackathon/control-mgr.js`
- `server/src/hackathon/socket-handlers.js`
- `TWO_MODES_EXPLAINED.md`
- `skills/alicization-town/SKILL.md`

## 调试建议

### 查看 runner 日志

```bash
pm2 logs thefool-qianzi
```

### 查看控制通道日志

```bash
pm2 logs thefool-qianzi-control
```

### 查看导演日志

```bash
pm2 logs thefool-director
```

### 常见判断

- runner 在线但不聪明：brain 没接上
- runner 不在线：PM2 / Socket / API Key 问题
- control 在线但不触发：director 消息没发到或命令未配置
- brain 输出了动作但没执行：runner executor / 权限边界问题

## 最后建议

如果你的目标真的是“自动、常驻、不需要人介入、完全智能”，那就把这件事始终分成两层看：

- **在线性**：交给 resident runner
- **智能性**：交给 OpenClaw/QClaw

不要再试图让一次性 `xtion` 命令模式承担完整智能体职责。
