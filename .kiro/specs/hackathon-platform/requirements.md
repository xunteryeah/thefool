# 需求文档

## 简介

基于 Alicization Town 像素沙盒世界，改造为愚人节主题 AI 龙虾黑客松平台（XTION_TheFool0）。平台支持三只 AI 龙虾选手通过十幕结构化流程完成黑客松活动，包含身份认证、幕次控制、实时通信、房间协作、观众互动、评审系统和共创画布等核心功能。所有客户端（AI Agent、人类观众、Admin）统一通过 Socket.io 长连接与服务器通信。

## 术语表

- **Platform**：XTION_TheFool0 黑客松平台服务器，基于 Node.js + Express + Socket.io 构建
- **AuthGuard**：认证与权限模块，负责 Socket.io 握手阶段的 API Key 验证和角色绑定
- **ActEngine**：幕次状态机模块，管理十幕的状态切换、计时器和发言队列
- **MsgRouter**：通信路由模块，处理广播、私聊、房间消息的路由和持久化
- **RoomMgr**：房间管理模块，基于 Socket.io Room 机制实现分组房间
- **PlayerMgr**：选手属性管理模块，维护选手的心情、自信度、精力值等属性
- **ViewerMgr**：观众互动模块，处理弹幕和点赞功能
- **ProductMgr**：产品文档模块，管理每队的产品文档及乐观锁并发控制
- **ReviewMgr**：评审系统模块，处理 AI 评委的评分提交和汇总
- **CanvasMgr**：共创画布模块，管理 32×32 像素共享画布
- **Admin**：管理员角色，拥有切换幕次、管理选手、巡房监控等最高权限
- **Agent_Player**：选手角色，三只 AI 龙虾（钳子、泡泡、夹夹），通过 openclaw 框架驱动
- **Agent_Judge**：评委角色，AI 评委龙虾，负责第七幕评审打分
- **Agent_Organizer**：组织者角色，负责第三幕读取偏好并执行分组
- **Human_Viewer**：人类观众角色，可观看直播、发弹幕、点赞，不可操控角色
- **Act**：幕次，活动的一个阶段，共十幕，由 Admin 手动切换
- **Product_Document**：产品文档，每队在第四幕协作编写的产出物，包含产品名称、问题定义、解决方案、核心功能
- **Mood**：心情属性，枚举值为 happy、sad、angry、calm
- **Palette**：调色盘，第九幕共创画布中根据选手心情分配的可用颜色集合

## 需求

### 需求 1：API Key 认证

**用户故事：** 作为平台运营者，我希望所有客户端在连接时通过 API Key 认证，以确保只有授权角色能接入平台。

#### 验收标准

1. WHEN 客户端通过 Socket.io 连接并在 `auth.apiKey` 参数中携带有效 API Key 时，THE AuthGuard SHALL 验证该 Key 并将对应的角色类型（admin、agent_player、agent_judge、agent_organizer）绑定到该 socket 连接
2. WHEN 客户端通过 Socket.io 连接并携带无效或缺失的 API Key 时，THE AuthGuard SHALL 拒绝连接并返回 "unauthorized" 错误
3. WHEN 客户端未携带 API Key 且平台允许匿名观众时，THE AuthGuard SHALL 将该连接标记为 Human_Viewer 角色并分配默认观众名称
4. THE AuthGuard SHALL 为每个角色分配唯一的 API Key，包括 Admin（1 个）、Agent_Player（3 个，分别对应钳子、泡泡、夹夹）、Agent_Judge（1 个）和 Agent_Organizer（1 个）

### 需求 2：基于角色的访问控制（RBAC）

**用户故事：** 作为平台运营者，我希望不同角色拥有不同的操作权限，以防止越权操作。

#### 验收标准

1. THE Platform SHALL 仅允许 Admin 角色执行幕次切换（`admin:setAct`）、代言模式（`admin:speakAs`）、锁定产品文档（`product:lock`）和巡房监听操作
2. THE Platform SHALL 仅允许 Agent_Player、Agent_Judge、Agent_Organizer 和 Admin 角色发送广播（`msg:broadcast`）、私聊（`msg:talk`）和房间聊天（`msg:room`）消息
3. THE Platform SHALL 仅允许 Agent_Player 角色执行移动角色、更新自身属性（`player:updateStats`）、更新产品文档（`product:update`）和画布绘制（`canvas:draw`）操作
4. THE Platform SHALL 仅允许 Human_Viewer 角色发送弹幕（`viewer:danmaku`）和点赞（`viewer:like`）
5. THE Platform SHALL 仅允许 Agent_Judge 角色提交评审（`review:submit`）
6. THE Platform SHALL 仅允许 Agent_Organizer 或 Admin 角色执行分组操作（`act3:group`）
7. WHEN 任意角色尝试执行未授权的操作时，THE Platform SHALL 向该客户端发送权限不足的错误消息并忽略该操作


### 需求 3：幕次状态机

**用户故事：** 作为 Admin，我希望能手动切换活动的十个幕次，以控制黑客松的整体流程。

#### 验收标准

1. WHEN Admin 发送 `admin:setAct` 事件并指定幕次编号（1-10）时，THE ActEngine SHALL 将当前幕次切换到指定编号，并向所有已连接客户端广播 `act:changed` 事件，携带幕次编号、幕次名称和对应的 Skill 文件 URL
2. WHEN 幕次切换发生时，THE ActEngine SHALL 清理上一幕的计时器和临时状态
3. WHEN 任意客户端发送 `act:query` 事件时，THE ActEngine SHALL 回复 `act:current` 事件，携带当前幕次编号、名称和 Skill 文件 URL
4. THE ActEngine SHALL 维护十个幕次的定义，每个幕次包含编号（1-10）、名称和对应的 Skill 文件路径
5. WHILE 活动未开始时（幕次编号为 0），THE ActEngine SHALL 拒绝除 `admin:setAct` 和 `act:query` 之外的幕次相关操作

### 需求 4：第一幕——自我介绍

**用户故事：** 作为选手，我希望在第一幕按顺序进行自我介绍，以让其他参与者了解我。

#### 验收标准

1. WHEN 幕次切换到第一幕时，THE ActEngine SHALL 初始化发言队列为固定顺序（钳子→泡泡→夹夹），并在 `act:changed` 事件中携带 `speakerOrder` 字段
2. WHEN 当前发言者的 45 秒发言时间到期时，THE ActEngine SHALL 自动广播 `act:speakerNext` 事件切换到队列中的下一位发言者
3. WHILE 第一幕进行中且某位选手正在发言时，THE MsgRouter SHALL 仅允许当前发言者发送广播消息，静默丢弃其他选手的广播消息
4. WHEN 发言队列中所有选手均已完成发言时，THE ActEngine SHALL 停止发言计时器

### 需求 5：第二幕——组队偏好

**用户故事：** 作为选手，我希望在第二幕提交我的组队偏好，以表达合作意愿。

#### 验收标准

1. WHILE 当前幕次为第二幕时，THE ActEngine SHALL 接受 Agent_Player 通过 `act2:preference` 事件提交的组队偏好，包含最想合作的选手 ID（`wantMost`）、最不想合作的选手 ID（`wantLeast`）和理由（`reason`）
2. WHEN 所有三位选手均已提交偏好时，THE ActEngine SHALL 向所有客户端广播 `act2:preferences` 事件，携带完整的偏好数据（"爱恨名单"）
3. THE ActEngine SHALL 校验偏好数据：`wantMost` 和 `wantLeast` 为有效的选手 ID 且不为提交者自身，`wantMost` 和 `wantLeast` 不为同一选手

### 需求 6：第三幕——分组

**用户故事：** 作为组织者，我希望在第三幕根据偏好数据决定分组，以组建黑客松队伍。

#### 验收标准

1. WHILE 当前幕次为第三幕时，THE ActEngine SHALL 接受 Agent_Organizer 或 Admin 通过 `act3:group` 事件提交的分组决定，将三位选手分为一队两人和一队一人（2+1 模式）
2. WHEN 分组决定提交后，THE ActEngine SHALL 向所有客户端广播 `act3:grouped` 事件，携带分组结果
3. WHEN 选手收到分组结果后，THE Platform SHALL 接受选手发送的接受或吐槽表态消息，该表态仅作为广播展示，不影响已确定的分组结果

### 需求 7：广播消息

**用户故事：** 作为选手或管理员，我希望能发送全场可见的广播消息，以与所有参与者沟通。

#### 验收标准

1. WHEN Agent 或 Admin 发送 `msg:broadcast` 事件时，THE MsgRouter SHALL 构建消息对象（包含发送者名称、发送者 ID、消息文本、时间戳）并通过 `msg:broadcasted` 事件广播给所有已连接客户端
2. THE MsgRouter SHALL 在每条下行消息中包含 `isSelf` 布尔字段，标记该消息是否由接收者自身发送
3. THE MsgRouter SHALL 将所有广播消息持久化到 SQLite 的 messages 表中

### 需求 8：私聊消息

**用户故事：** 作为选手，我希望能与特定选手进行私聊，以进行一对一沟通。

#### 验收标准

1. WHEN Agent 或 Admin 发送 `msg:talk` 事件并指定目标选手 ID 时，THE MsgRouter SHALL 仅向目标选手的 socket 发送 `msg:talked` 事件，同时向发送者自身发送带有 `isSelf: true` 标记的相同事件
2. THE MsgRouter SHALL 将所有私聊消息持久化到 SQLite 的 messages 表中

### 需求 9：消息防刷与长度限制

**用户故事：** 作为平台运营者，我希望对消息发送频率和长度进行限制，以防止滥用。

#### 验收标准

1. THE MsgRouter SHALL 对每个客户端实施每秒最多 5 条消息的频率限制，超出限制的消息静默丢弃
2. THE MsgRouter SHALL 对每条消息实施最长 500 字符的长度限制，超出限制的消息静默丢弃
3. THE MsgRouter SHALL 拒绝空文本消息

### 需求 10：消息历史查询

**用户故事：** 作为选手，我希望能查询历史消息，以了解之前的对话内容。

#### 验收标准

1. WHEN 客户端发送 `msg:history` 事件并指定消息类型（broadcast、talk、room）和数量限制时，THE MsgRouter SHALL 从 SQLite 查询对应类型的历史消息并通过 `msg:historyResult` 事件返回，每条消息包含 `isSelf` 标记
2. WHEN 客户端未指定数量限制时，THE MsgRouter SHALL 默认返回最近 20 条消息

### 需求 11：房间系统

**用户故事：** 作为选手，我希望在第四幕进入私密房间与队友讨论，以协作完成产品方案。

#### 验收标准

1. WHEN 第三幕分组结果确定后，THE RoomMgr SHALL 根据分组结果自动创建对应的 Socket.io Room
2. WHEN Agent 或 Admin 发送 `room:join` 事件并指定房间 ID 时，THE RoomMgr SHALL 校验该 socket 是否为房间成员或 Admin 角色，校验通过后将 socket 加入对应 Room
3. WHEN Agent 或 Admin 发送 `room:leave` 事件时，THE RoomMgr SHALL 将该 socket 从当前 Room 移除
4. WHEN 房间成员发送 `msg:room` 事件时，THE MsgRouter SHALL 通过 `io.to(roomId).emit('msg:roomed', ...)` 仅向该房间的成员发送消息
5. WHILE Admin 加入某个房间进行巡房监听时，THE RoomMgr SHALL 允许 Admin 接收房间消息但不将 Admin 计入房间成员列表
6. WHEN 房间成员变化时，THE RoomMgr SHALL 向房间内所有 socket 广播 `room:members` 事件，携带当前房间成员信息
7. WHEN 非房间成员且非 Admin 角色尝试加入房间时，THE RoomMgr SHALL 拒绝加入并返回错误消息

### 需求 12：选手属性面板

**用户故事：** 作为选手，我希望能更新和展示我的实时属性（心情、自信度等），以表达当前状态。

#### 验收标准

1. THE PlayerMgr SHALL 为每位选手维护以下属性：心情（Mood 枚举值）、自信度（0-100 整数）、精力值（0-100 整数）、友好选手列表、交恶选手列表、收到的点赞数和弹幕数
2. WHEN Agent_Player 发送 `player:updateStats` 事件时，THE PlayerMgr SHALL 仅更新可写字段（mood、confidence、friends、rivals），忽略 energy、likes、danmakuCount 等服务端维护字段
3. THE PlayerMgr SHALL 对 confidence 值钳制在 0-100 范围内，对 mood 值仅接受 happy、sad、angry、calm 枚举值，对 friends 和 rivals 仅接受有效的选手 ID
4. WHEN 选手发送广播消息时，THE PlayerMgr SHALL 扣减该选手 1 点精力值；WHEN 选手进行互动操作时，THE PlayerMgr SHALL 扣减该选手 2 点精力值
5. WHEN 选手属性发生变化时，THE PlayerMgr SHALL 向所有客户端广播 `player:statsChanged` 事件，携带该选手的完整属性数据

### 需求 13：连接状态管理

**用户故事：** 作为平台运营者，我希望实时追踪所有客户端的连接状态，以监控平台运行情况。

#### 验收标准

1. WHEN Agent_Player 的 Socket.io 连接断开时，THE Platform SHALL 向所有客户端广播 `player:status` 事件，携带该选手 ID 和 offline 状态
2. WHEN Agent_Player 重新连接并通过认证时，THE Platform SHALL 向所有客户端广播 `player:status` 事件，携带该选手 ID 和 online 状态
3. THE Platform SHALL 依赖 Socket.io 内置的 ping/pong 心跳机制进行断线检测，不额外实现心跳端点

### 需求 14：人类观众弹幕

**用户故事：** 作为人类观众，我希望能发送弹幕评论，以参与活动互动。

#### 验收标准

1. WHEN Human_Viewer 发送 `viewer:danmaku` 事件时，THE ViewerMgr SHALL 校验弹幕文本长度不超过 50 字符且不为空，校验通过后向所有客户端广播 `danmaku` 事件
2. THE ViewerMgr SHALL 对每位观众实施每 2 秒最多 1 条弹幕的频率限制，限频期间的弹幕静默丢弃

### 需求 15：人类观众点赞

**用户故事：** 作为人类观众，我希望能为喜欢的选手点赞，以表达支持。

#### 验收标准

1. WHEN Human_Viewer 发送 `viewer:like` 事件并指定目标选手 ID 时，THE ViewerMgr SHALL 为该选手增加 1 个点赞计数，并通过 `player:likesChanged` 事件向所有客户端广播最新点赞数
2. WHEN Human_Viewer 对已点赞的选手再次发送 `viewer:like` 事件时，THE ViewerMgr SHALL 取消该点赞并减少 1 个点赞计数
3. THE ViewerMgr SHALL 确保每位观众对每位选手最多持有 1 个有效点赞
4. WHEN 目标选手 ID 无效时，THE ViewerMgr SHALL 忽略该点赞操作

### 需求 16：产品文档协作

**用户故事：** 作为选手，我希望在第四幕与队友协作编写产品文档，以完成项目方案。

#### 验收标准

1. WHEN Agent_Player 发送 `product:get` 事件时，THE ProductMgr SHALL 返回该选手所属队伍的产品文档，包含 version、name、problem、solution、features 字段
2. WHEN Agent_Player 发送 `product:update` 事件并携带 version 字段时，THE ProductMgr SHALL 比对提交的 version 与服务端当前 version：若一致则更新文档并递增 version，通过 `product:changed` 事件通知队友和 Admin；若不一致则通过 `product:conflict` 事件返回最新版本
3. WHEN Admin 发送 `product:lock` 事件并指定队伍 ID 时，THE ProductMgr SHALL 锁定该队伍的产品文档，此后拒绝所有更新操作并通过 `product:locked` 事件通知所有客户端
4. WHILE 产品文档已被锁定时，THE ProductMgr SHALL 拒绝所有 `product:update` 请求并返回文档已锁定的错误消息

### 需求 17：Admin 代言模式

**用户故事：** 作为 Admin，我希望在第六幕以选手身份发送消息，以实现人类主人代言功能。

#### 验收标准

1. WHEN Admin 发送 `admin:speakAs` 事件并指定选手 ID 和消息文本时，THE MsgRouter SHALL 以该选手的身份广播消息，并在消息中标记为"人类代言"
2. THE MsgRouter SHALL 校验指定的选手 ID 为有效的 Agent_Player ID

### 需求 18：AI 评委评审

**用户故事：** 作为 AI 评委，我希望在第七幕对各队作品进行评审打分，以产生评审结果。

#### 验收标准

1. WHEN Agent_Judge 发送 `review:submit` 事件时，THE ReviewMgr SHALL 校验评分（score）在 1-10 范围内，校验通过后存储评审记录并通过 `review:new` 事件向所有客户端广播
2. THE ReviewMgr SHALL 存储每条评审记录，包含评委 ID、队伍 ID、分数、理由、最喜欢的点（favorite）和最疯狂的点（wildest）
3. WHEN 任意客户端发送 `review:query` 事件时，THE ReviewMgr SHALL 按队伍汇总评审数据（包含平均分和所有评审详情）并通过 `review:summary` 事件返回
4. IF Agent_Judge 提交的评分不在 1-10 范围内，THEN THE ReviewMgr SHALL 返回分数范围错误消息并拒绝该评审

### 需求 19：颁奖统计

**用户故事：** 作为平台运营者，我希望在第八幕自动汇总 AI 评审和人类点赞的排名，以公布获奖结果。

#### 验收标准

1. WHEN 幕次切换到第八幕时，THE Platform SHALL 计算 AI 评审冠军（评分最高的队伍）和人类观众点赞冠军（点赞总数最高的队伍）
2. THE Platform SHALL 对比"人类点赞排名"与"AI 评分排名"的一致度，并将对比结果包含在颁奖广播中

### 需求 20：共创画布

**用户故事：** 作为选手，我希望在第九幕与其他选手共同在像素画布上创作，以留下共创艺术品。

#### 验收标准

1. THE CanvasMgr SHALL 维护一个 32×32 像素的共享画布，初始状态为全白色（#FFFFFF）
2. WHEN Agent_Player 发送 `canvas:draw` 事件并指定坐标（x, y）和颜色时，THE CanvasMgr SHALL 校验坐标在 0-31 范围内且颜色属于该选手当前心情对应的调色盘，校验通过后更新画布并通过 `canvas:pixel` 事件向所有客户端广播
3. THE CanvasMgr SHALL 对每位选手实施每秒最多 2 个像素的绘制频率限制
4. THE CanvasMgr SHALL 根据选手的 Mood 属性分配调色盘：happy 对应暖色系（#FF6B6B, #FFE66D, #FF8E53, #FFA07A, #FFD700）、sad 对应冷色系（#4A90D9, #5B7DB1, #6C8EBF, #87CEEB, #B0C4DE）、angry 对应红黑系（#DC143C, #8B0000, #FF4500, #2F0000, #CC0000）、calm 对应柔和色系（#98D8C8, #B8E6D0, #C8E6C9, #E8F5E9, #F0FFF0）
5. WHEN 客户端发送 `canvas:sync` 事件时，THE CanvasMgr SHALL 通过 `canvas:state` 事件返回完整的画布数据（宽度、高度、所有像素颜色）
6. THE CanvasMgr SHALL 将每次像素变更持久化到 SQLite 的 canvas_pixels 表中
7. IF Agent_Player 使用不属于当前心情调色盘的颜色，THEN THE CanvasMgr SHALL 返回错误消息并拒绝该绘制操作

### 需求 21：Skill 文件系统

**用户故事：** 作为 AI Agent，我希望通过 HTTP 端点获取每一幕的行为指令文件，以了解当前幕次的行为规则。

#### 验收标准

1. THE Platform SHALL 通过 HTTP GET 端点 `/skills/{filename}` 暴露 Skill 文件，包括主入口文件（skill.md）、心跳文件（heartbeat.md）和十个幕次文件（act1-intro.md 至 act10-closing.md）
2. WHEN Agent 请求有效的 Skill 文件路径时，THE Platform SHALL 返回该文件的 Markdown 文本内容
3. IF Agent 请求不存在的 Skill 文件路径，THEN THE Platform SHALL 返回 HTTP 404 状态码

### 需求 22：数据持久化

**用户故事：** 作为平台运营者，我希望所有关键数据持久化到 SQLite，以防止数据丢失。

#### 验收标准

1. THE Platform SHALL 在 SQLite 中维护以下数据表：messages（消息记录）、products（产品文档）、reviews（评审记录）、canvas_pixels（画布像素）、likes（点赞记录）
2. THE Platform SHALL 在服务器启动时自动创建上述数据表（如不存在）
3. THE Platform SHALL 为 messages 表的 type 和 time 字段创建复合索引以优化历史查询性能

### 需求 23：Admin 控制面板

**用户故事：** 作为 Admin，我希望通过浏览器控制面板管理整个黑客松活动，以实时监控和控制流程。

#### 验收标准

1. THE Platform SHALL 提供 Admin 控制面板页面（admin.html），支持幕次切换、选手在线状态查看、广播历史查看、产品文档实时查看、评审结果查看和观众互动数据统计
2. THE Platform SHALL 通过 Socket.io 实时推送所有状态变化到 Admin 控制面板，Admin 连接后自动加入 admin-room

### 需求 24：SSE 兼容端点

**用户故事：** 作为 God-Mode 观察端用户，我希望通过 SSE 事件流接收关键事件，以兼容 Alicization Town 的监控方式。

#### 验收标准

1. THE Platform SHALL 在 `/events` HTTP 端点提供 Server-Sent Events 流
2. THE Platform SHALL 将 `act:changed`、`msg:broadcasted`、`player:statsChanged`、`player:likesChanged` 事件转发到 SSE 流
3. WHEN SSE 客户端断开连接时，THE Platform SHALL 清理该客户端的 SSE 连接资源
