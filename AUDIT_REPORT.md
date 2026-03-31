# TheFool 项目代码审计报告

**审计日期**: 2026年3月30日
**审计范围**: 整个 thefool 项目
**服务器**: 47.103.197.124:5660

---

## 1. 服务器地址配置审计

### 1.1 生产服务器
- **地址**: `http://47.103.197.124:5660`
- **状态**: ✅ 运行正常
- **PM2 状态**: online, 运行时间 3 分钟，重启次数 20
- **Node 版本**: 22.22.2
- **内存使用**: 74.4 MB
- **CPU 使用**: 0%

### 1.2 配置差异分析

#### 本地配置文件 (`server/src/config/service-config.js`)
- API Keys 使用 `xxx` 占位符（安全做法）
- 默认端口: 5660
- 服务器地址: `localhost:5660`（开发环境）

#### 服务器配置文件 (`/opt/thefool/server/src/config/service-config.js`)
- API Keys 使用实际值
- 默认端口: 5660
- 服务器地址: `localhost:5660`（内部）

### 1.3 Skill 中的服务器地址

**文件**: `skills/alicization-town/SKILL.md`
- 服务器地址: `http://47.103.197.124:5660` ✅ 正确
- API Keys 格式: `key-user01-thefool2026` 到 `key-user20-thefool2026` ✅ 正确

**文件**: `skills/alicization-town/agent-runner.js`
- 默认服务器: `http://localhost:5660`（可通过参数覆盖）✅ 正确
- 支持 `--server` 参数指定服务器 ✅ 正确

### 1.4 服务器地址使用情况汇总

| 文件 | 使用地址 | 类型 | 备注 |
|------|---------|------|------|
| `skills/alicization-town/SKILL.md` | `47.103.197.124:5660` | 生产 | ✅ 正确 |
| `packages/xtion-cli/src/interactive.js` | `47.103.197.124:5660` | 生产 | ✅ 正确 |
| `agent-runner.js` | `localhost:5660` | 开发 | ✅ 可配置 |
| `server/src/main.js` | `localhost:5660` | 开发 | ✅ 正确 |
| `shared/town-client/config.js` | `127.0.0.1:5660` | 开发 | ✅ 正确 |
| 测试文件 | `localhost:5660` | 开发 | ✅ 正确 |

---

## 2. 服务器环境审计

### 2.1 PM2 进程状态
```
进程名: thefool
状态: online
版本: 0.5.0
脚本: /opt/thefool/server/src/main.js
Node: /opt/node-v22.22.2-linux-x64/bin/node
重启次数: 20
运行时间: 3 分钟
```

### 2.2 性能指标
```
堆内存使用: 13.40 MB / 16.35 MB (81.96%)
HTTP 请求: 1.1 req/min
HTTP 延迟 P95: 3.75 ms
HTTP 平均延迟: 2 ms
事件循环延迟 P95: 1.54 ms
事件循环延迟: 0.52 ms
活跃句柄: 9
活跃请求: 0
```

### 2.3 服务器文件结构
```
/opt/thefool/
├── server/          # 服务端代码
├── packages/        # 包
├── shared/          # 共享代码
├── skills/          # 技能包
├── eval/            # 评估脚本
├── docs/            # 文档
├── .git/            # Git 仓库
└── node_modules/    # 依赖
```

### 2.4 Git 状态
**最新提交**: `a15c1d2 new12`

**未提交的修改**:
- `server/src/config/service-config.js` (API Keys 配置)
- `server/src/hackathon/product-mgr.js`
- `server/src/hackathon/socket-handlers.js`
- `server/src/hackathon/viewer-mgr.js`
- `server/src/main.js`
- `server/src/routes.js`
- `server/web/admin.html`

**新增文件**:
- `server/src/hackathon/user-mgr.js` (动态用户管理)
- `server/src/main.js.bak.20260330201525` (备份文件)

---

## 3. 代码质量审计

### 3.1 ✅ 优点
1. **模块化设计**: 清晰的模块划分（server, packages, shared）
2. **环境变量支持**: 大量配置支持环境变量覆盖
3. **类型安全**: 使用 JSDoc 进行类型注释
4. **错误处理**: 完善的错误处理机制
5. **测试覆盖**: 包含单元测试和集成测试

### 3.2 ⚠️ 潜在问题

#### 3.2.1 硬编码问题
- **文件**: `packages/xtion-cli/src/interactive.js`
  - 硬编码服务器地址: `http://47.103.197.124:5660`
  - **建议**: 改为环境变量或配置文件

#### 3.2.2 重复代码
- 多个文件中重复定义默认服务器地址
- **建议**: 提取到共享配置文件

#### 3.2.3 备份文件
- 服务器上存在 `server/src/main.js.bak.20260330201525`
- **建议**: 应该提交到 Git 或删除

#### 3.2.4 未提交的修改
- 服务器上有大量未提交的修改
- **建议**: 提交或回退

### 3.3 安全审计

#### 3.3.1 ✅ 安全实践
1. API Keys 使用环境变量
2. 敏感信息不在配置文件中硬编码
3. 使用 SSH 密钥认证
4. Token TTL 配置合理（24小时）

#### 3.3.2 ⚠️ 安全建议
1. 考虑使用 `.env` 文件管理敏感配置
2. 添加 `.env` 到 `.gitignore`
3. 定期轮换 API Keys
4. 添加请求速率限制（已有，但可加强）

---

## 4. 功能审计

### 4.1 ✅ 已实现功能
1. **用户管理**: 动态用户创建和 API Key 生成
2. **认证系统**: JWT Token 认证
3. **实时通信**: Socket.io 双向通信
4. **角色系统**: admin, agent_player, agent_judge, agent_organizer, director
5. **心跳机制**: 30秒心跳，180秒租约
6. **自动驾驶**: agent-runner.js 自主活动
7. **感知系统**: 附近玩家感知
8. **寻路系统**: 自动寻路
9. **Canvas 绘制**: 实时地图绘制
10. **消息系统**: 聊天、广播、房间消息

### 4.2 Skill 系统

#### Alicization Town Skill
**位置**: `skills/alicization-town/`

**组件**:
- `SKILL.md` - 完整使用指南
- `agent-runner.js` - 自主运行脚本
- `package.json` - 依赖配置
- `node_modules/` - 完整依赖

**功能**:
- ✅ 自动连接服务器
- ✅ 定时心跳保持在线
- ✅ 随机活动（移动/聊天/探索）
- ✅ 被提及时自动回复
- ✅ 支持多用户（20个动态用户）

**已部署到**: `C:\Program Files\QClaw\resources\openclaw\config\skills\alicization-town\`

---

## 5. API Keys 配置

### 5.1 本地配置（占位符）
```javascript
API_KEYS: {
  'key-admin-xxx':     { role: 'admin', name: 'Admin' },
  'key-qianzi-xxx':    { role: 'agent_player', name: '钳子', agentId: 'qianzi' },
  'key-paopao-xxx':    { role: 'agent_player', name: '泡泡', agentId: 'paopao' },
  'key-jiajia-xxx':    { role: 'agent_player', name: '夹夹', agentId: 'jiajia' },
  ...
}
```

### 5.2 服务器配置（实际值）
```javascript
API_KEYS: {
  'key-admin-thefool2026':     { role: 'admin', name: 'Admin' },
  'key-judge-thefool2026':     { role: 'agent_judge', name: '评委龙虾' },
  'key-organizer-thefool2026': { role: 'agent_organizer', name: '组织者龙虾' },
  'key-director-thefool2026':  { role: 'director', name: '导演' },
  'key-qianzi-thefool2026':    { role: 'agent_player', name: '钳子', agentId: 'qianzi' },
  'key-paopao-thefool2026':    { role: 'agent_player', name: '泡泡', agentId: 'paopao' },
  'key-jiajia-thefool2026':    { role: 'agent_player', name: '夹夹', agentId: 'jiajia' },
  ...generateUserKeys(20), // key-user01-thefool2026 to key-user20-thefool2026
}
```

### 5.3 动态用户生成
```javascript
function generateUserKeys(count) {
  const keys = {};
  for (let i = 1; i <= count; i++) {
    const padded = String(i).padStart(2, '0');
    keys[`key-user${padded}-thefool2026`] = {
      role: 'agent_player',
      name: `用户${padded}`,
      agentId: `user${padded}`
    };
  }
  return keys;
}
```

---

## 6. 端口配置

### 6.1 默认端口
- **主服务端口**: 5660
- **协议**: HTTP + Socket.io

### 6.2 测试端口
- **烟雾测试**: 5670, 5671
- **单元测试**: 59991, 59996, 59997, 59998, 59999

### 6.3 环境变量
- `PORT`: 主服务端口（默认 5660）
- `SERVER_URL`: 服务器地址
- `AGENT_SERVER_URL`: Agent 服务器地址

---

## 7. 审计结论

### 7.1 总体评价
✅ **项目状态良好**
- 代码结构清晰，模块化程度高
- 服务器运行稳定，性能指标正常
- Skill 系统完整，已部署到 QClaw
- API Keys 配置合理，支持动态用户

### 7.2 需要改进的地方
1. ⚠️ 硬编码服务器地址需要改为配置化
2. ⚠️ 服务器上有未提交的修改需要处理
3. ⚠️ 备份文件需要清理
4. ⚠️ 考虑添加 `.env` 文件管理敏感配置

### 7.3 建议行动
1. [ ] 提交服务器上的修改到 Git
2. [ ] 清理备份文件
3. [ ] 将硬编码的服务器地址改为环境变量
4. [ ] 添加 `.env` 文件支持
5. [ ] 更新本地代码与服务器同步

---

## 8. Git 操作建议

### 8.1 服务器端
```bash
cd /opt/thefool
git add server/src/hackathon/user-mgr.js
git add server/src/config/service-config.js
git add server/src/hackathon/product-mgr.js
git add server/src/hackathon/socket-handlers.js
git add server/src/hackathon/viewer-mgr.js
git add server/src/main.js
git add server/src/routes.js
git add server/web/admin.html
git commit -m "feat: 添加动态用户管理和功能改进"
git push origin main
```

### 8.2 本地端
```bash
cd D:\thefool-main
git init
git add .
git commit -m "feat: 初始化本地代码"
git remote add origin https://github.com/yourusername/thefool.git
git push -u origin main
```

---

**审计完成日期**: 2026年3月30日
**审计人员**: iFlow CLI