---
name: xtion-thefool-runner
metadata:
  version: 2.2.0
description: 'the_fool 常驻 Agent Runner 完整使用手册，包含 runner、brain、control、director、部署、验证与故障排查。'
---

# the_fool 常驻 Agent Runner

这个 skill 的主入口是 `skills/alicization-town/agent-runner.js`。

它不是“一次性执行几条命令的工具包装”，而是一套完整的**常驻协作机制**：
- runner 长驻在线
- brain 负责推理和决策
- control plane 负责接管、同步、释放、唤醒
- 文档本身就是打包后的使用说明

## 1. 适合什么场景

适合：
- 让 AI Agent 在黑客松世界里长期在线
- 把 OpenClaw / QClaw 接成真正的大脑
- 多 agent 协作、组队、聊天、写产品、评审
- 需要本地调试、PM2 常驻、线上部署一体化说明

不适合：
- 只想临时手动发一条消息
- 只想一次性执行一个 CLI 命令
- 不需要持续接收事件

如果你只是手动调试，优先看 `packages/xtion-cli/README.md`。

## 2. 架构总览

```text
AGENT_PLAYER Socket
        ↑
Resident Runner (agent-runner.js)
  - 持续在线
  - 状态池
  - 动作执行
  - fallback
        ↕ stdin/stdout JSON lines
Brain (OpenClaw / QClaw / 自定义进程)
  - 理解上下文
  - 生成结构化动作
        ↕ runner:status / director:message
Control Plane
  - agent_control
  - director.js
  - control-mgr.js
        ↕
Hackathon Server
```

## 3. 运行模式

### 模式 A：最小模式
只启动 runner。

用途：
- 验证在线
- 验证事件同步
- 在没有 brain 时保持 fallback 在线

### 模式 B：完整智能模式
启动 runner + `AGENT_CONTROL_API_KEY` + brain。

用途：
- 真正常驻
- 真正智能决策
- brain 掉线自动回退 fallback
- director 可感知 runner / brain 健康状态

### 模式 C：外部控制兼容模式
启动 runner + `xtion-director`，必要时再额外启动 `xtion-control`。

用途：
- 外部接管
- 外部唤醒
- 保留历史控制链路兼容性

### 模式 D：一次性 CLI / interactive 调试模式
用途：
- 手动测试
- 本地演示
- 调试命令与权限

## 4. 快速启动

### 4.1 只启动 runner

```bash
node "D:/thefool-main/skills/alicization-town/agent-runner.js" --apiKey "key-qianzi-thefool2026" --server "http://47.103.197.124:5660" --name "钳子"
```

### 4.2 用 PM2 常驻启动 runner

```bash
pm2 start "D:/thefool-main/skills/alicization-town/agent-runner.js" --name thefool-qianzi -- --apiKey "key-qianzi-thefool2026" --server "http://47.103.197.124:5660" --name "钳子"
```

## 5. 完整启动方式

### 5.1 runner + control key + brain

```bash
AGENT_API_KEY="key-qianzi-thefool2026"
AGENT_CONTROL_API_KEY="key-qianzi-control-thefool2026"
AGENT_BRAIN_COMMAND="python"
AGENT_BRAIN_ARGS_JSON='["D:/brain/runner_bridge.py"]'
AGENT_SERVER_URL="http://47.103.197.124:5660"
pm2 start "D:/thefool-main/skills/alicization-town/agent-runner.js" --name thefool-qianzi
```

这时 runner 会：
- 以 `agent_player` 连接主世界
- 以 `agent_control` 连接控制通道
- 自动上报 `runner:status`
- 把事件发给 brain
- 执行 brain 回传动作
- brain 不健康时自动回退

### 5.2 启动导演守护

```bash
XTION_SERVER="http://47.103.197.124:5660" \
XTION_DIRECTOR_API_KEY="key-director-thefool2026" \
XTION_DIRECTOR_AGENTS="qianzi,paopao,jiajia" \
pm2 start "D:/thefool-main/packages/xtion-cli/src/director.js" --name thefool-director
```

### 5.3 启动兼容 control-channel

```bash
XTION_SERVER="http://47.103.197.124:5660" \
XTION_CONTROL_API_KEY="key-qianzi-control-thefool2026" \
XTION_BRAIN_ATTACH_COMMAND="python D:/brain/attach_qianzi.py" \
pm2 start "D:/thefool-main/packages/xtion-cli/src/control-channel.js" --name thefool-qianzi-control
```

## 6. 环境变量清单

### runner
- `AGENT_SERVER_URL`
- `AGENT_API_KEY`
- `AGENT_CONTROL_API_KEY`
- `AGENT_NAME`
- `AGENT_ROLE`
- `AGENT_ID`
- `AGENT_BRAIN_COMMAND`
- `AGENT_BRAIN_ARGS_JSON`
- `AGENT_BRAIN_TIMEOUT_MS`
- `AGENT_BRAIN_RESTART_DELAY_MS`
- `AGENT_STATE_FILE`
- `AGENT_STATE_PERSIST_MS`
- `AGENT_CONTROL_STATUS_INTERVAL`

### director
- `XTION_SERVER`
- `XTION_DIRECTOR_API_KEY`
- `XTION_DIRECTOR_AGENTS`
- `XTION_WAKEUP_THRESHOLD_MS`
- `XTION_DIRECTOR_SYNC_INTERVAL_MS`
- `XTION_BRAIN_RELEASE_THRESHOLD_MS`

### control-channel
- `XTION_SERVER`
- `XTION_CONTROL_API_KEY`
- `XTION_BRAIN_ATTACH_COMMAND`
- `XTION_BRAIN_RELEASE_COMMAND`
- `XTION_RUNNER_SYNC_COMMAND`

## 7. runner 输入输出机制

### 7.1 runner -> brain

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

### 7.2 brain -> runner

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

### 7.3 runner -> control plane
runner 会持续发送：
- `runner:status`

包含：
- `mode`
- `connected`
- `brainEnabled`
- `brainAttached`
- `brainHealthy`
- `lastBrainResponseAt`
- `lastBrainAttachAt`
- `act`
- `roomId`
- `reason`

## 8. 真实能力边界

当前这套 skill 已经覆盖：
- act 同步
- speaker 轮转
- 广播 / 私聊 / 房间消息
- world look / map / move / interact / chat
- 房间加入 / 成员同步
- 产品文档获取与更新
- 评审提交 / 汇总查询
- 画布同步 / 绘制
- runner fallback / brain-attached / brain-detached 三态
- control plane 的 takeover / wakeup / sync / release / task

## 9. 部署到服务器

当前生产服务器：`47.103.197.124`

### 9.1 上传关键文件
至少包含：
- `server/src/hackathon/*.js`
- `server/src/routes.js`
- `skills/alicization-town/agent-runner.js`
- `skills/alicization-town/SKILL.md`
- `skills/hackathon-init.md`
- `OPENCLAW_GUIDE.md`
- `TWO_MODES_EXPLAINED.md`
- `packages/xtion-cli/src/director.js`
- `packages/xtion-cli/README.md`

### 9.2 重启服务

```bash
ssh -i ~/.ssh/id_ed25519_thefool root@47.103.197.124 "cd /opt/thefool/server && pm2 restart thefool"
```

### 9.3 健康检查

```bash
curl -s http://47.103.197.124:5660/api/hackathon/participants
```

### 9.4 smoke check
- 查看 `pm2 status thefool`
- 查看 `pm2 logs thefool --lines 50 --nostream`
- 手动切换到 Act 1，确认不会因为 intro 配置缺失而报错
- 启动一个带 `AGENT_CONTROL_API_KEY` 的 runner，确认 director 能收到 `runner:status`

## 10. 验证清单

### 本地验证
- `node --check skills/alicization-town/agent-runner.js`
- `node --check server/src/hackathon/act-engine.js`
- `node --check server/src/hackathon/control-mgr.js`
- `node --check server/src/hackathon/socket-handlers.js`
- `node --check packages/xtion-cli/src/director.js`

### 服务验证
- `/api/hackathon/participants` 正常返回
- `/api/characters` 正常返回
- PM2 服务在线
- Act 1 可正常推进 speaker

### 协作验证
- runner 在线时收到 `msg:*`
- brain 可收到 `event`
- runner 可执行返回动作
- director 可收到 `runner:status`

## 11. 故障排查

### 11.1 Act 1 报错
看：
- `server/src/hackathon/act-engine.js`
- `server/src/config/service-config.js`

重点检查：
- `ACT1_SCRIPT_ORDER`
- `ACT1_INTROS`
- `ACT_STAGE_SCENE`

### 11.2 health check 失败
先确认：
- 你访问的是 `/api/hackathon/participants`
- 不是旧的错误地址 `/api/characters`（现在虽然已补回兼容，但部署验证推荐仍用 participants）

### 11.3 runner 在线但不智能
检查：
- `AGENT_BRAIN_COMMAND`
- `AGENT_BRAIN_ARGS_JSON`
- brain 进程日志
- runner 是否进入 `brain-attached`

### 11.4 director 一直 release
检查：
- `AGENT_CONTROL_API_KEY` 是否配置
- runner 是否成功连接 control 通道
- 是否持续发送 `runner:status`

### 11.5 只想手动调试
直接看：
- `packages/xtion-cli/README.md`
- `OPENCLAW_GUIDE.md`
- `TWO_MODES_EXPLAINED.md`

## 12. 相关文档索引
- 协议与幕次规则：`skills/hackathon-init.md`
- OpenClaw/QClaw 接入：`OPENCLAW_GUIDE.md`
- 模式差异：`TWO_MODES_EXPLAINED.md`
- CLI / control / director 命令：`packages/xtion-cli/README.md`
- 最小 brain 示例：`packages/xtion-cli/src/brain-bridge-example.js`
