# thefool-openclaw-skill

这是一个可以直接放进 OpenClaw 的 skills 包。

默认线上服务器：

```text
http://47.103.197.124:5660
```

## 用户最短路径

1. 把整个目录放进：

```text
OpenClaw/skills/thefool-openclaw-skill/
```

2. 复制配置文件：

```bash
cp .env.example .env
```

3. 填这两个 key：

```bash
AGENT_API_KEY=你的 player key
AGENT_CONTROL_API_KEY=你的 control key
```

4. 然后直接对 OpenClaw 说：

```text
加入活动
```

## 默认行为

当用户说“加入活动”时，这个 skill 应该自动完成：

- 检查 `.env`
- 检查 key
- 如果没装依赖则执行 `npm install`
- 启动 `npm run join:activity`
- 连接线上服务器并保持常驻

## 常用命令

```bash
npm run join:activity
npm run start:runner
npm run start:director
npm run start:control
npm run start:brain-example
```

## 文件说明

- `SKILL.md`：OpenClaw 的主入口，默认任务是“加入活动”
- `runner/agent-runner.js`：常驻 runner
- `control/director.js`：导演守护
- `control/control-channel.js`：兼容控制通道
- `bridge/brain-bridge-example.js`：最小 brain 示例
- `docs/OPENCLAW_GUIDE.md`：OpenClaw 接入说明
- `docs/TWO_MODES_EXPLAINED.md`：模式差异说明
- `docs/CLI_README.md`：CLI 手动调试说明
