# 实施计划：XTION_TheFool0 黑客松平台

## 概述

基于 Alicization Town（Node.js + Express + Socket.io）改造为 AI 龙虾黑客松平台。按六个阶段递进实施：先搭建认证与通信基础，再逐步完善幕次控制、房间协作、观众互动、评审系统和共创画布。所有新增模块位于 `server/src/hackathon/`，复用现有世界引擎和 SQLite 框架。

## 任务

- [x] 1. 项目基础设施与配置扩展
  - [x] 1.1 扩展 service-config.js，新增黑客松配置项
    - 在 `server/src/config/service-config.js` 中新增 `HACKATHON_CONFIG` 对象
    - 包含 API_KEYS 映射表（admin、3 个 agent_player、agent_judge、agent_organizer）
    - 包含常量：CANVAS_SIZE、MSG_RATE_LIMIT、MSG_MAX_LENGTH、DANMAKU_MAX_LENGTH、DANMAKU_COOLDOWN_MS、SPEAKER_TIMEOUT_MS、CANVAS_DRAW_RATE、REVIEW_SCORE_MIN/MAX、ENERGY_COST_BROADCAST/INTERACT
    - _需求: 1.4, 9.1, 9.2, 14.2, 20.3_

  - [x] 1.2 扩展 sqlite-state-store.js，新增黑客松数据表
    - 在 `server/src/persistence/sqlite-state-store.js` 的 `initializeSchema()` 中新增 5 张表：messages、products、reviews、canvas_pixels、likes
    - 为 messages 表创建 `idx_messages_type_time` 复合索引
    - 新增数据操作方法：insertMessage、getMessages、saveProduct、saveReview、savePixel 等
    - _需求: 22.1, 22.2, 22.3_

  - [x] 1.3 创建 `server/src/hackathon/` 目录和 `server/test/hackathon/` 目录
    - 创建模块目录结构
    - _需求: 无（基础设施）_

- [x] 2. AuthGuard 认证与 RBAC 权限模块
  - [x] 2.1 实现 auth-guard.js 认证中间件
    - 创建 `server/src/hackathon/auth-guard.js`
    - 实现 `authenticate(socket, next)` 方法：从 `socket.handshake.auth.apiKey` 读取 Key，查找配置表绑定 `socket.identity`（含 role、name、agentId）
    - 有效 Key → 绑定对应角色；无效 Key → 拒绝连接返回 `Error('unauthorized')`；无 Key → 标记为 Human_Viewer 角色并分配默认观众名称
    - 实现 `requireRole(socket, ...roles)` 方法：校验角色权限，失败时 emit error 事件
    - _需求: 1.1, 1.2, 1.3, 1.4, 2.7_

  - [ ]* 2.2 编写 AuthGuard 属性测试 — Property 1: API Key 认证绑定角色
    - **Property 1: API Key 认证绑定角色**
    - 使用 fast-check 从有效 Key 集合中随机选取，验证认证后 socket.identity.role 和 name 与配置一致
    - **验证: 需求 1.1**

  - [ ]* 2.3 编写 AuthGuard 属性测试 — Property 2: 无效 API Key 拒绝连接
    - **Property 2: 无效 API Key 拒绝连接**
    - 使用 fast-check 生成随机字符串（排除有效 Key），验证 AuthGuard 拒绝连接并返回 "unauthorized"
    - **验证: 需求 1.2**

  - [ ]* 2.4 编写 RBAC 属性测试 — Property 3: 权限矩阵一致性
    - **Property 3: RBAC 权限矩阵一致性**
    - 使用 fast-check 随机组合角色 × 操作事件，验证 requireRole 结果与预定义权限矩阵完全一致
    - **验证: 需求 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

  - [ ]* 2.5 编写 AuthGuard 单元测试
    - 测试匿名观众连接（无 Key 时分配 Human_Viewer 角色和默认名称）
    - 测试重复 Key 连接场景
    - 创建 `server/test/hackathon/auth-guard.test.js` 和 `server/test/hackathon/rbac.test.js`
    - _需求: 1.3_

- [x] 3. MsgRouter 通信路由模块
  - [x] 3.1 实现 msg-router.js 核心功能
    - 创建 `server/src/hackathon/msg-router.js`
    - 实现 `broadcast(socket, { text })`：构建消息对象（id、from、fromId、text、time），通过 `msg:broadcasted` 广播给所有客户端，每条下行消息包含 `isSelf` 标记，持久化到 SQLite
    - 实现 `talk(socket, { to, text })`：仅向目标 socket 发送 `msg:talked`，同时向发送者发送带 `isSelf: true` 的相同事件，持久化到 SQLite
    - 实现 `room(socket, { text })`：通过 `io.to(roomId).emit('msg:roomed', ...)` 发送房间消息，持久化到 SQLite
    - 实现 `history(socket, { type, limit })`：从 SQLite 查询历史消息，默认 20 条，每条标记 `isSelf`
    - 实现 `speakAs(socket, { agentId, text })`：Admin 代言模式，以选手身份广播并标记"人类代言"，校验 agentId 有效性
    - 实现 `_checkRate(socketId)`：每秒最多 5 条消息限制
    - 实现 `_checkLength(text)`：非空且 ≤500 字符
    - _需求: 7.1, 7.2, 7.3, 8.1, 8.2, 9.1, 9.2, 9.3, 10.1, 10.2, 17.1, 17.2_

  - [ ]* 3.2 编写 MsgRouter 属性测试 — Property 8: 消息构建与 isSelf 标记
    - **Property 8: 消息构建与 isSelf 标记**
    - 使用 fast-check 随机生成消息文本和发送者/接收者，验证消息对象包含必要字段且 isSelf 标记正确
    - **验证: 需求 7.1, 7.2**

  - [ ]* 3.3 编写 MsgRouter 属性测试 — Property 9: 消息持久化往返
    - **Property 9: 消息持久化往返**
    - 使用 fast-check 随机生成消息类型和内容，验证发送后从 SQLite 查询能获取相同内容
    - **验证: 需求 7.3, 8.2**

  - [ ]* 3.4 编写 MsgRouter 属性测试 — Property 10: 私聊消息隔离
    - **Property 10: 私聊消息隔离**
    - 使用 fast-check 随机选取发送者、目标和旁观者，验证仅目标和发送者收到 msg:talked 事件
    - **验证: 需求 8.1**

  - [ ]* 3.5 编写 MsgRouter 属性测试 — Property 11: 消息频率与长度限制
    - **Property 11: 消息频率与长度限制**
    - 使用 fast-check 随机生成消息数量（1-20）和长度（1-1000），验证频率和长度限制行为
    - **验证: 需求 9.1, 9.2**

  - [ ]* 3.6 编写 MsgRouter 属性测试 — Property 12: 历史消息按类型和数量查询
    - **Property 12: 历史消息按类型和数量查询**
    - 使用 fast-check 随机生成类型和 limit 值，验证返回消息全部为指定类型、数量不超过 limit、按时间倒序
    - **验证: 需求 10.1**

  - [ ]* 3.7 编写 MsgRouter 属性测试 — Property 21: 代言模式身份替换
    - **Property 21: 代言模式身份替换**
    - 使用 fast-check 随机选取有效选手 ID 和文本，验证广播消息以选手身份发出并标记"人类代言"
    - **验证: 需求 17.1**

  - [ ]* 3.8 编写 MsgRouter 单元测试
    - 测试空消息拒绝、历史查询默认 20 条、代言无效选手 ID 返回错误
    - 创建 `server/test/hackathon/msg-router.test.js`
    - _需求: 9.3, 10.2, 17.2_

- [x] 4. 检查点 — 基础通信验证
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 5. ActEngine 幕次状态机模块
  - [x] 5.1 实现 act-engine.js 核心幕次切换
    - 创建 `server/src/hackathon/act-engine.js`
    - 定义 ACT_DEFINITIONS 常量（10 幕的编号、名称、skillUrl）
    - 实现 `setAct(actNumber)`：切换幕次，清理上一幕计时器和临时状态，广播 `act:changed` 事件（携带 act、name、skillUrl）
    - 实现 `getState()`：返回当前幕次状态 `{ act, name, skillUrl }`
    - 实现 `_cleanupPreviousAct()`：清理计时器、重置临时状态
    - 幕次 0 时拒绝除 `admin:setAct` 和 `act:query` 之外的幕次相关操作
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 5.2 实现第一幕发言队列与计时器
    - 切换到第一幕时初始化发言队列（钳子→泡泡→夹夹），在 `act:changed` 中携带 `speakerOrder`
    - 实现 `_nextSpeaker()`：45 秒超时自动广播 `act:speakerNext` 切换下一位
    - 实现 `isCurrentSpeaker(agentId)`：判断当前发言者
    - 在 MsgRouter 的 broadcast 中集成第一幕发言限制：仅当前发言者可广播，其他选手静默丢弃
    - 全部发言完毕后停止计时器
    - _需求: 4.1, 4.2, 4.3, 4.4_

  - [x] 5.3 实现第二幕组队偏好收集
    - 实现 `submitPreference(agentId, { wantMost, wantLeast, reason })`
    - 校验：wantMost 和 wantLeast 为有效选手 ID、不为提交者自身、wantMost ≠ wantLeast
    - 三位选手均提交后广播 `act2:preferences` 事件
    - _需求: 5.1, 5.2, 5.3_

  - [x] 5.4 实现第三幕分组逻辑
    - 实现 `submitGroup({ teamA, teamB })`：接受 Agent_Organizer 或 Admin 的分组决定（2+1 模式）
    - 广播 `act3:grouped` 事件
    - 选手表态消息仅作为广播展示，不影响分组结果
    - _需求: 6.1, 6.2, 6.3_

  - [ ]* 5.5 编写 ActEngine 属性测试 — Property 4: 幕次状态往返一致性
    - **Property 4: 幕次状态往返一致性**
    - 使用 fast-check 随机生成幕次编号 1-10，验证 setAct 后 getState 返回一致的编号、名称和 skillUrl
    - **验证: 需求 3.1, 3.3, 3.4**

  - [ ]* 5.6 编写 ActEngine 属性测试 — Property 5: 第一幕仅当前发言者可广播
    - **Property 5: 第一幕仅当前发言者可广播**
    - 使用 fast-check 随机选取选手 ID 和发言者索引，验证仅当前发言者的广播被接受
    - **验证: 需求 4.2, 4.3**

  - [ ]* 5.7 编写 ActEngine 属性测试 — Property 6: 组队偏好数据校验
    - **Property 6: 组队偏好数据校验**
    - 使用 fast-check 随机生成有效/无效偏好组合，验证校验逻辑正确拒绝无效数据
    - **验证: 需求 5.1, 5.3**

  - [ ]* 5.8 编写 ActEngine 属性测试 — Property 7: 分组结果不可变性
    - **Property 7: 分组结果不可变性**
    - 使用 fast-check 随机生成分组和表态序列，验证分组结果在表态后保持不变
    - **验证: 需求 6.1, 6.3**

  - [ ]* 5.9 编写 ActEngine 单元测试
    - 测试幕次 0 时拒绝操作、第一幕发言队列初始化顺序、所有选手提交偏好后触发广播
    - 测试完整的第一幕流程（发言队列→超时切换→全部完成）
    - 测试完整的第二幕流程（偏好提交→校验→广播）
    - 测试完整的第三幕流程（分组→广播→表态不影响结果）
    - 创建 `server/test/hackathon/act-engine.test.js`
    - _需求: 3.5, 4.1, 5.2_

- [x] 6. socket-handlers.js 事件注册总线与 main.js 改造
  - [x] 6.1 实现 socket-handlers.js 事件注册总线
    - 创建 `server/src/hackathon/socket-handlers.js`
    - 实现 `registerHandlers(io, modules)` 函数
    - 在 `io.on('connection')` 中按 `socket.identity.role` 注册事件：
      - Admin 事件 → actEngine.setAct、msgRouter.speakAs、productMgr.lock
      - Agent 通用事件 → msgRouter.broadcast/talk/room/history、actEngine.getState
      - Agent_Player 专属 → playerMgr.updateStats、actEngine.submitPreference、productMgr.get/update、canvasMgr.draw
      - Agent_Judge 专属 → reviewMgr.submit
      - Agent_Organizer 专属 → actEngine.submitGroup
      - Human_Viewer 专属 → viewerMgr.danmaku/like
      - 通用 → roomMgr.join/leave、reviewMgr.query、canvasMgr.sync
    - 处理 disconnect 事件：viewerMgr.cleanup、player:status 广播
    - Admin 连接后自动加入 admin-room
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 13.1, 13.2, 23.2_

  - [x] 6.2 改造 main.js 入口文件
    - 重构 `server/src/main.js`：去掉 NPC 系统引用
    - 引入并初始化所有黑客松模块（AuthGuard、ActEngine、MsgRouter、RoomMgr、PlayerMgr、ViewerMgr、ProductMgr、ReviewMgr、CanvasMgr）
    - 注入 Socket.io 认证中间件 `io.use(authGuard.authenticate)`
    - 调用 `playerMgr.init(['qianzi', 'paopao', 'jiajia'])`
    - 调用 `registerHandlers(io, modules)`
    - _需求: 13.3_

  - [x] 6.3 精简 routes.js 并添加 Skill 文件路由和 SSE 端点
    - 精简 `server/src/routes.js`：移除不再需要的 HTTP 业务路由
    - 添加 `/skills/*` 静态文件路由，指向 `server/skills/` 目录
    - 实现 `/events` SSE 端点：设置 Content-Type、Cache-Control、Connection 头，管理 sseClients 数组
    - 将 `act:changed`、`msg:broadcasted`、`player:statsChanged`、`player:likesChanged` 事件转发到 SSE 流
    - SSE 客户端断开时清理连接资源
    - _需求: 21.1, 24.1, 24.2, 24.3_

- [x] 7. 检查点 — 核心框架集成验证
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 8. PlayerMgr 选手属性管理模块
  - [x] 8.1 实现 player-mgr.js
    - 创建 `server/src/hackathon/player-mgr.js`
    - 实现 `init(agentIds)`：初始化三位选手默认属性（mood: calm, confidence: 50, energy: 100, friends: [], rivals: [], likes: 0, danmakuCount: 0）
    - 实现 `updateStats(agentId, { mood, confidence, friends, rivals })`：仅更新可写字段，忽略 energy/likes/danmakuCount；confidence 钳制 [0,100]；mood 仅接受枚举值；friends/rivals 仅接受有效选手 ID
    - 实现 `consumeEnergy(agentId, cost)`：扣减精力值，不低于 0
    - 实现 `addLike(agentId)` / `removeLike(agentId)`：增减点赞计数
    - 实现 `getAll()` / `getPlayer(agentId)`
    - 属性变化时广播 `player:statsChanged` 事件
    - 在 MsgRouter.broadcast 中集成精力消耗：广播消息扣 1 点，互动操作扣 2 点
    - _需求: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 8.2 编写 PlayerMgr 属性测试 — Property 16: 选手属性更新校验
    - **Property 16: 选手属性更新校验**
    - 使用 fast-check 随机生成 mood/confidence/friends/rivals 值，验证仅可写字段被更新，服务端字段不变，confidence 被钳制
    - **验证: 需求 12.2, 12.3**

  - [ ]* 8.3 编写 PlayerMgr 属性测试 — Property 17: 精力值消耗
    - **Property 17: 精力值消耗**
    - 使用 fast-check 随机生成初始精力和操作序列，验证广播扣 1 点、互动扣 2 点、不低于 0
    - **验证: 需求 12.4**

  - [ ]* 8.4 编写 PlayerMgr 单元测试
    - 测试初始化默认属性值、无效 mood 枚举值拒绝、无效选手 ID 过滤
    - 创建 `server/test/hackathon/player-mgr.test.js`
    - _需求: 12.1, 12.3_

- [x] 9. RoomMgr 房间管理模块
  - [x] 9.1 实现 room-mgr.js
    - 创建 `server/src/hackathon/room-mgr.js`
    - 实现 `createFromGroups(groups)`：根据分组结果自动创建 Socket.io Room
    - 实现 `join(socket, roomId)`：校验 socket 是否为房间成员或 Admin，通过后 socket.join(roomId)
    - 实现 `leave(socket)`：socket.leave(roomId)
    - 实现 `_broadcastMembers(roomId)`：广播 `room:members` 事件（不包含 Admin）
    - 实现 `getTeamRoom(agentId)`：获取选手所属房间 ID
    - Admin 加入房间时可接收消息但不计入成员列表
    - 非成员非 Admin 尝试加入时返回错误
    - 在 ActEngine.submitGroup 中集成：分组确定后调用 roomMgr.createFromGroups
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ]* 9.2 编写 RoomMgr 属性测试 — Property 13: 房间加入权限校验
    - **Property 13: 房间加入权限校验**
    - 使用 fast-check 随机组合角色和房间，验证加入成功当且仅当 socket 为房间成员或 Admin
    - **验证: 需求 11.2, 11.7**

  - [ ]* 9.3 编写 RoomMgr 属性测试 — Property 14: 房间消息隔离
    - **Property 14: 房间消息隔离**
    - 使用 fast-check 随机生成房间成员组合，验证仅房间内 socket 收到 msg:roomed 事件
    - **验证: 需求 11.4**

  - [ ]* 9.4 编写 RoomMgr 属性测试 — Property 15: Admin 巡房不计入成员列表
    - **Property 15: Admin 巡房不计入成员列表**
    - 使用 fast-check 随机选取房间并让 Admin 加入，验证 room:members 不包含 Admin
    - **验证: 需求 11.5, 11.6**

  - [ ]* 9.5 编写 RoomMgr 单元测试
    - 测试分组后自动创建房间、房间成员变化广播、Admin 巡房场景
    - 创建 `server/test/hackathon/room-mgr.test.js`
    - _需求: 11.1, 11.6_

- [x] 10. ProductMgr 产品文档模块
  - [x] 10.1 实现 product-mgr.js
    - 创建 `server/src/hackathon/product-mgr.js`
    - 实现 `init(teamIds)`：初始化空白产品文档（version: 0, name/problem/solution/features: '', lockedAt: null）
    - 实现 `get(socket)`：返回选手所属队伍的产品文档
    - 实现 `update(socket, { version, name, problem, solution, features })`：乐观锁校验 — version 一致则更新并递增 version，通过 `product:changed` 通知队友和 Admin；version 不一致则返回 `product:conflict`
    - 实现 `lock(teamId)`：锁定文档，此后拒绝所有更新并返回"文档已锁定"错误，广播 `product:locked`
    - 持久化到 SQLite products 表
    - _需求: 16.1, 16.2, 16.3, 16.4_

  - [ ]* 10.2 编写 ProductMgr 属性测试 — Property 20: 产品文档乐观锁
    - **Property 20: 产品文档乐观锁**
    - 使用 fast-check 随机生成版本号和更新内容，验证乐观锁行为：版本一致则更新并递增，不一致则返回 conflict，锁定后拒绝更新
    - **验证: 需求 16.1, 16.2, 16.3, 16.4**

  - [ ]* 10.3 编写 ProductMgr 单元测试
    - 测试文档初始化、版本冲突返回最新版本、锁定后拒绝更新
    - 创建 `server/test/hackathon/product-mgr.test.js`
    - _需求: 16.2, 16.4_

- [x] 11. 检查点 — 房间与产品文档验证
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 12. ViewerMgr 观众互动模块
  - [x] 12.1 实现 viewer-mgr.js
    - 创建 `server/src/hackathon/viewer-mgr.js`
    - 实现 `danmaku(socket, { text })`：校验文本非空且 ≤50 字符，每 2 秒最多 1 条限频，通过后广播 `danmaku` 事件
    - 实现 `like(socket, { targetId })`：校验 targetId 为有效选手 ID，已点赞则取消（removeLike），未点赞则添加（addLike），每位观众对每位选手最多 1 个有效点赞
    - 实现 `cleanup(socketId)`：清理断线观众的弹幕计时器
    - 点赞状态持久化到 SQLite likes 表
    - _需求: 14.1, 14.2, 15.1, 15.2, 15.3, 15.4_

  - [ ]* 12.2 编写 ViewerMgr 属性测试 — Property 18: 弹幕校验与频率限制
    - **Property 18: 弹幕校验与频率限制**
    - 使用 fast-check 随机生成文本长度和时间间隔，验证弹幕校验和频率限制行为
    - **验证: 需求 14.1, 14.2**

  - [ ]* 12.3 编写 ViewerMgr 属性测试 — Property 19: 点赞切换不变量
    - **Property 19: 点赞切换不变量**
    - 使用 fast-check 随机生成观众×选手×操作次数，验证点赞二值切换行为和最多 1 个有效点赞
    - **验证: 需求 15.1, 15.2, 15.3**

  - [ ]* 12.4 编写 ViewerMgr 单元测试
    - 测试无效选手 ID 点赞忽略、弹幕空文本拒绝、弹幕超长拒绝
    - 创建 `server/test/hackathon/viewer-mgr.test.js`
    - _需求: 15.4, 14.1_

- [ ] 13. ReviewMgr 评审系统模块
  - [x] 13.1 实现 review-mgr.js
    - 创建 `server/src/hackathon/review-mgr.js`
    - 实现 `submit(socket, { teamId, score, reason, favorite, wildest })`：校验 score 在 [1,10] 范围内，存储评审记录（judgeId、teamId、score、reason、favorite、wildest、time），广播 `review:new` 事件
    - 实现 `query(socket)`：按队伍汇总评审数据（平均分 + 所有评审详情），通过 `review:summary` 返回
    - 持久化到 SQLite reviews 表
    - _需求: 18.1, 18.2, 18.3, 18.4_

  - [x] 13.2 实现第八幕颁奖统计逻辑
    - 在 ActEngine.setAct(8) 时触发颁奖计算
    - 计算 AI 评审冠军（评分最高队伍）和人类点赞冠军（点赞总数最高队伍）
    - 对比"人类点赞排名"与"AI 评分排名"的一致度
    - 广播颁奖结果
    - _需求: 19.1, 19.2_

  - [ ] 13.3 编写 ReviewMgr 属性测试 — Property 22: 评审提交与汇总
    - **Property 22: 评审提交与汇总**
    - 使用 fast-check 随机生成评审记录集合，验证分数范围校验、平均分计算正确性
    - **验证: 需求 18.1, 18.2, 18.3**

  - [ ]* 13.4 编写 ReviewMgr 属性测试 — Property 23: 颁奖排名计算
    - **Property 23: 颁奖排名计算**
    - 使用 fast-check 随机生成评分和点赞数据，验证冠军为最高分/最高赞队伍
    - **验证: 需求 19.1, 19.2**

  - [ ]* 13.5 编写 ReviewMgr 单元测试
    - 测试评审分数越界拒绝、汇总查询空数据场景
    - 创建 `server/test/hackathon/review-mgr.test.js`
    - _需求: 18.4_

- [ ] 14. CanvasMgr 共创画布模块
  - [x] 14.1 实现 canvas-mgr.js
    - 创建 `server/src/hackathon/canvas-mgr.js`
    - 初始化 32×32 画布，全白色（#FFFFFF）
    - 实现 `draw(socket, { x, y, color }, playerMgr)`：校验坐标 [0,31]、颜色属于选手当前心情调色盘、每秒最多 2 像素频率限制；通过后更新画布并广播 `canvas:pixel`
    - 定义 MOOD_PALETTES 映射：happy→暖色系、sad→冷色系、angry→红黑系、calm→柔和色系（每组 5 色）
    - 实现 `sync(socket)`：返回完整画布状态（width、height、pixels）
    - 持久化到 SQLite canvas_pixels 表
    - _需求: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [ ]* 14.2 编写 CanvasMgr 属性测试 — Property 24: 画布绘制校验
    - **Property 24: 画布绘制校验**
    - 使用 fast-check 随机生成坐标、颜色和心情，验证坐标范围、调色盘权限和频率限制
    - **验证: 需求 20.2, 20.3**

  - [ ]* 14.3 编写 CanvasMgr 属性测试 — Property 25: 心情调色盘映射
    - **Property 25: 心情调色盘映射**
    - 使用 fast-check 随机选取心情枚举值，验证返回正确的 5 个颜色值
    - **验证: 需求 20.4**

  - [ ]* 14.4 编写 CanvasMgr 属性测试 — Property 26: 画布状态同步往返
    - **Property 26: 画布状态同步往返**
    - 使用 fast-check 随机生成绘制序列，验证 sync 返回的画布反映所有成功绘制
    - **验证: 需求 20.5, 20.6**

  - [ ]* 14.5 编写 CanvasMgr 单元测试
    - 测试画布初始全白、坐标越界拒绝、颜色不在调色盘返回错误
    - 创建 `server/test/hackathon/canvas-mgr.test.js`
    - _需求: 20.1, 20.7_

- [x] 15. 检查点 — 观众互动、评审与画布验证
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 16. Skill 文件与 HTTP 路由
  - [x] 16.1 创建 Skill 文件
    - 在 `server/skills/` 目录下创建以下 Markdown 文件：
      - `skill.md`（主入口文件）
      - `heartbeat.md`（心跳文件）
      - `act1-intro.md` 至 `act10-closing.md`（十个幕次文件）
    - 每个文件包含对应幕次的行为指令内容
    - _需求: 21.1_

  - [ ]* 16.2 编写 Skill 路由属性测试 — Property 27: Skill 文件服务
    - **Property 27: Skill 文件服务**
    - 使用 fast-check 从有效文件名集合中随机选取，验证 HTTP GET `/skills/{filename}` 返回 Markdown 内容
    - **验证: 需求 21.1**

  - [ ]* 16.3 编写 Skill 路由单元测试
    - 测试有效文件路径返回内容、不存在的文件路径返回 404
    - 创建 `server/test/hackathon/skill-routes.test.js`
    - _需求: 21.2, 21.3_

- [ ] 17. SSE 兼容端点
  - [x] 17.1 实现 SSE 事件转发逻辑
    - 在 routes.js 或 main.js 中完善 SSE 转发：监听 Socket.io 的 `act:changed`、`msg:broadcasted`、`player:statsChanged`、`player:likesChanged` 事件，写入 SSE 流
    - 确保 SSE 客户端断开时正确清理连接资源
    - _需求: 24.1, 24.2, 24.3_

  - [ ]* 17.2 编写 SSE 属性测试 — Property 28: SSE 事件转发
    - **Property 28: SSE 事件转发**
    - 使用 fast-check 随机生成事件类型和数据，验证 SSE 流收到对应事件且数据一致
    - **验证: 需求 24.2**

  - [ ]* 17.3 编写 SSE 单元测试
    - 测试 SSE 连接建立、事件接收、断开清理
    - 创建 `server/test/hackathon/sse.test.js`
    - _需求: 24.1, 24.3_

- [x] 18. Admin 控制面板前端
  - [x] 18.1 创建 admin.html 控制面板页面
    - 在 `server/web/admin.html` 创建 Admin 控制面板
    - 包含：幕次切换按钮（1-10）、选手在线状态显示、广播历史查看、产品文档实时查看、评审结果查看、观众互动数据统计（弹幕数、点赞数）
    - 通过 Socket.io 连接（携带 Admin API Key），实时接收所有状态变化
    - Admin 连接后自动加入 admin-room
    - _需求: 23.1, 23.2_

- [x] 19. 连接状态管理集成
  - [x] 19.1 完善断线重连与状态广播
    - 在 socket-handlers.js 的 disconnect 处理中：Agent_Player 断线时广播 `player:status` offline
    - Agent_Player 重连并通过认证时广播 `player:status` online
    - 依赖 Socket.io 内置 ping/pong 心跳机制，不额外实现心跳端点
    - _需求: 13.1, 13.2, 13.3_

- [x] 20. 最终检查点 — 全功能集成验证
  - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点任务确保增量验证，及时发现问题
- 属性测试使用 fast-check 库验证通用正确性属性
- 单元测试验证具体示例、边界条件和错误处理路径
- 实施顺序遵循 ARCHITECTURE.md 中的优先级：P0 基础可用 → P1 前三幕+房间 → P2 观众+评审 → P3 画布
