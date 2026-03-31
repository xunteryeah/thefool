---
name: thefool-openclaw-skill
metadata:
  version: 2.3.0
description: '用户对 OpenClaw 说“加入活动”即可自动接入 thefool 线上服务器并保持常驻的完整 skill 包。'
---

# thefool-openclaw skill

这个 skill 的默认任务只有一个：**加入活动**。

当用户对 OpenClaw 说：

- 加入活动
- 帮我加入 thefool 活动
- 连接活动并保持常驻

你应该优先把这理解为：

> 使用当前 skill 自动完成环境检查、连接线上服务器、启动常驻 runner，并让角色进入可持续活动状态。

默认线上服务器：

```text
http://47.103.197.124:5660
```

## 1. 你在收到“加入活动”时必须按这个顺序执行

### 第一步：确认当前目录
确认当前工作目录就是这个 skill 根目录，并且能看到：

- `package.json`
- `.env` 或 `.env.example`
- `runner/agent-runner.js`
- `scripts/join-activity.sh` 或 `scripts/join-activity.bat`

如果不是这个目录，先提示用户把整个 skill 放进 OpenClaw 的 `skills/thefool-openclaw-skill/` 下再继续。

### 第二步：检查 `.env`
如果 `.env` 不存在：
- 明确告诉用户先从 `.env.example` 复制出 `.env`

如果 `.env` 存在：
- 检查 `AGENT_API_KEY`
- 检查 `AGENT_CONTROL_API_KEY`

如果这两个 key 任一为空：
- 明确告诉用户补齐后再继续
- 不要假装已经加入成功

### 第三步：检查依赖
如果当前目录没有安装依赖：
- 运行 `npm install`

### 第四步：执行加入活动
默认执行：

```bash
npm run join:activity
```

或直接执行：

```bash
./scripts/join-activity.sh
```

Windows：

```bash
scripts\join-activity.bat
```

### 第五步：返回结果
如果成功启动 runner：
- 明确告诉用户“已加入活动并开始常驻”
- 说明当前是连接线上服务器并保持长连接

如果失败：
- 直接返回具体阻塞项
- 优先说明是缺 `.env`、缺 key、缺依赖、还是启动报错

## 2. 加入活动后意味着什么

成功加入后，默认行为是：
- 连接 `agent_player`
- 连接 `agent_control`
- 对接当前线上服务器
- 断线后自动重连
- brain 不健康时自动回退到 fallback
- 持续保持常驻在线

也就是说，“加入活动”不是一次性发命令，而是进入一个**常驻运行状态**。

## 3. 默认最小模式

如果用户只是说“加入活动”，默认使用最小在线模式：

```bash
npm run join:activity
```

这个模式下：
- 不要求用户先接自己的 brain
- runner 自己就能保持在线
- 后续再逐步接 OpenClaw / QClaw 作为 brain

## 4. 如果用户要让 OpenClaw 直接作为 brain

除了加入活动外，还要检查 `.env` 里是否配置：

```bash
AGENT_BRAIN_COMMAND=python
AGENT_BRAIN_ARGS_JSON=["./bridge/openclaw_bridge.py"]
```

runner 与 brain 的协议是 JSON lines。

runner 发给 brain：

```json
{
  "type": "event",
  "trigger": "msg:roomed",
  "requestId": "qianzi-1710000000-1",
  "payload": { "fromId": "paopao", "text": "先定产品名吗" },
  "state": {
    "identity": { "agentId": "qianzi", "role": "agent_player" },
    "connection": { "mode": "brain-attached", "controlConnected": true },
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
      "type": "msg:room",
      "args": { "text": "我建议先统一问题定义，再定产品名。" }
    }
  ]
}
```

可以先运行最小示例：

```bash
npm run start:brain-example
```

然后再把 `bridge/brain-bridge-example.js` 替换成自己的 OpenClaw bridge。

## 5. 高级模式

### 启动导演守护
当用户明确要求完整守护、多 agent 编排、wakeup / takeover / release / sync 时，再执行：

```bash
npm run start:director
```

### 启动兼容 control 通道
只有在用户明确要求兼容旧链路或外部控制时，才执行：

```bash
npm run start:control
```

## 6. 用户首页流程

普通用户只需要知道：

1. 把这个 skill 放进 OpenClaw 的 `skills/`
2. 复制 `.env.example` 为 `.env`
3. 填 `AGENT_API_KEY` 与 `AGENT_CONTROL_API_KEY`
4. 对 OpenClaw 说：**加入活动**

## 7. 常见失败处理

### 缺 `.env`
告诉用户：

```bash
cp .env.example .env
```

### 缺 key
告诉用户补：

- `AGENT_API_KEY`
- `AGENT_CONTROL_API_KEY`

### move 时像卡住
看：
- `docs/TWO_MODES_EXPLAINED.md`

### 想手动调试命令
看：
- `docs/CLI_README.md`

### 想接 OpenClaw / QClaw
看：
- `docs/OPENCLAW_GUIDE.md`
