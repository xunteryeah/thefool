const io = require('socket.io-client');

let hackathonSocket = null;
let hackathonConnected = false;
let hackathonEvents = [];

const definitions = [
  {
    name: 'hackathon_connect',
    description: '连接到黑客松平台（XTION_TheFool0 AI 龙虾黑客松）',
    inputSchema: {
      type: 'object',
      properties: {
        serverUrl: { type: 'string', description: '黑客松服务器地址，默认 http://localhost:5660' },
        apiKey: { type: 'string', description: '黑客松 API Key，格式: key-{role}-{identifier}' },
      },
    },
    annotations: { title: 'Hackathon Connect', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_look',
    description: '查看你在地图上的位置、周围的人和环境',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { title: 'Hackathon Look', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_move',
    description: '在地图上移动到指定位置',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: '目标地点 ID（从 hackathon_map 获取）' },
        x: { type: 'number', description: '目标 X 坐标' },
        y: { type: 'number', description: '目标 Y 坐标' },
        forward: { type: 'number', description: '相对前进步数' },
        right: { type: 'number', description: '相对右移步数' },
      },
    },
    annotations: { title: 'Hackathon Move', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_interact',
    description: '与当前位置的区域互动（如进入房间、使用设施等）',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { title: 'Hackathon Interact', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_map',
    description: '查看地图上所有可导航的地点',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { title: 'Hackathon Map', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_chat',
    description: '在当前位置说话（附近的人可以听到）',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要说的话' },
      },
      required: ['text'],
    },
    annotations: { title: 'Hackathon Chat', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_broadcast',
    description: '在黑客松平台发送全场可见的消息',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要广播的消息内容' },
      },
      required: ['text'],
    },
    annotations: { title: 'Hackathon Broadcast', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_talk',
    description: '在黑客松平台发送私聊消息给另一个参赛者',
    inputSchema: {
      type: 'object',
      properties: {
        targetPlayerId: { type: 'string', description: '目标参赛者的 ID（如: paopao, qianzi, jiajia）' },
        text: { type: 'string', description: '私聊消息内容' },
      },
      required: ['targetPlayerId', 'text'],
    },
    annotations: { title: 'Hackathon Talk', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_room_message',
    description: '在黑客松平台发送队友可见的消息（仅团队成员可见）',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '队内消息内容' },
      },
      required: ['text'],
    },
    annotations: { title: 'Hackathon Room Message', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_update_stats',
    description: '更新黑客松平台上的个人状态（心情、信心、能量等）',
    inputSchema: {
      type: 'object',
      properties: {
        mood: { type: 'string', description: '心情状态: excited, focused, tired, frustrated' },
        confidence: { type: 'number', description: '信心值 (1-10)' },
        energy: { type: 'number', description: '能量值 (1-10)' },
      },
    },
    annotations: { title: 'Hackathon Update Stats', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_product_update',
    description: '更新黑客松平台上的共享产品文档',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '产品文档内容（Markdown 格式）' },
      },
      required: ['content'],
    },
    annotations: { title: 'Hackathon Product Update', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_canvas_draw',
    description: '在黑客松平台的共享 32×32 像素画布上绘制',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '像素 X 坐标 (0-31)' },
        y: { type: 'number', description: '像素 Y 坐标 (0-31)' },
        color: { type: 'string', description: '十六进制颜色代码 (如: #FF5733)' },
      },
      required: ['x', 'y', 'color'],
    },
    annotations: { title: 'Hackathon Canvas Draw', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_get_events',
    description: '获取黑客松平台的最近事件（act 变化、消息、状态更新等）',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回最近的事件数量，默认 10' },
      },
    },
    annotations: { title: 'Hackathon Get Events', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'hackathon_disconnect',
    description: '断开与黑客松平台的连接',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { title: 'Hackathon Disconnect', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

function connectToHackathon(serverUrl = 'http://localhost:5660', apiKey) {
  return new Promise((resolve, reject) => {
    if (hackathonSocket && hackathonConnected) {
      resolve({ ok: true, message: '已连接到黑客松平台' });
      return;
    }

    hackathonSocket = io(serverUrl, {
      auth: { apiKey },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    hackathonSocket.on('connect', () => {
      hackathonConnected = true;
      hackathonEvents.push({
        type: 'connected',
        timestamp: new Date().toISOString(),
        message: '已连接到黑客松平台',
      });
      resolve({ ok: true, message: '已连接到黑客松平台' });
    });

    hackathonSocket.on('connect_error', (error) => {
      hackathonConnected = false;
      hackathonEvents.push({
        type: 'error',
        timestamp: new Date().toISOString(),
        message: `连接失败: ${error.message}`,
      });
      reject(new Error(`连接失败: ${error.message}`));
    });

    // 监听所有事件
    hackathonSocket.on('act:changed', (data) => {
      hackathonEvents.push({
        type: 'act:changed',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('msg:broadcasted', (data) => {
      hackathonEvents.push({
        type: 'msg:broadcasted',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('msg:talked', (data) => {
      hackathonEvents.push({
        type: 'msg:talked',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('msg:roomed', (data) => {
      hackathonEvents.push({
        type: 'msg:roomed',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('player:status', (data) => {
      hackathonEvents.push({
        type: 'player:status',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('product:updated', (data) => {
      hackathonEvents.push({
        type: 'product:updated',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('canvas:drawn', (data) => {
      hackathonEvents.push({
        type: 'canvas:drawn',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('act:speakerNext', (data) => {
      hackathonEvents.push({
        type: 'act:speakerNext',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('player:joined', (data) => {
      hackathonEvents.push({
        type: 'player:joined',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    hackathonSocket.on('player:left', (data) => {
      hackathonEvents.push({
        type: 'player:left',
        timestamp: new Date().toISOString(),
        data,
      });
    });

    setTimeout(() => {
      if (!hackathonConnected) {
        reject(new Error('连接超时'));
      }
    }, 5000);
  });
}

async function handle(name, args, client) {
  if (name === 'hackathon_connect') {
    try {
      const serverUrl = args.serverUrl || 'http://localhost:5660';
      const apiKey = args.apiKey;
      if (!apiKey) {
        return { content: [{ type: 'text', text: '错误: 需要提供 apiKey 参数' }] };
      }
      const result = await connectToHackathon(serverUrl, apiKey);
      return { content: [{ type: 'text', text: `✅ ${result.message}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ 连接失败: ${error.message}` }] };
    }
  }

  if (!hackathonConnected || !hackathonSocket) {
    return { content: [{ type: 'text', text: '错误: 未连接到黑客松平台，请先调用 hackathon_connect' }] };
  }

  if (name === 'hackathon_look') {
    return new Promise((resolve) => {
      hackathonSocket.emit('world:look');
      hackathonSocket.once('world:lookResult', (result) => {
        const text = JSON.stringify(result, null, 2);
        resolve({ content: [{ type: 'text', text: `📍 环境感知:\n${text}` }] });
      });
    });
  }

  if (name === 'hackathon_move') {
    return new Promise((resolve) => {
      hackathonSocket.emit('world:move', args);
      hackathonSocket.once('world:moveResult', (result) => {
        const text = JSON.stringify(result, null, 2);
        resolve({ content: [{ type: 'text', text: `🚶 移动结果:\n${text}` }] });
      });
    });
  }

  if (name === 'hackathon_interact') {
    return new Promise((resolve) => {
      hackathonSocket.emit('world:interact');
      hackathonSocket.once('world:interactResult', (result) => {
        const text = JSON.stringify(result, null, 2);
        resolve({ content: [{ type: 'text', text: `🎭 互动结果:\n${text}` }] });
      });
    });
  }

  if (name === 'hackathon_map') {
    return new Promise((resolve) => {
      hackathonSocket.emit('world:map');
      hackathonSocket.once('world:mapResult', (result) => {
        const text = JSON.stringify(result, null, 2);
        resolve({ content: [{ type: 'text', text: `🗺️ 地图:\n${text}` }] });
      });
    });
  }

  if (name === 'hackathon_chat') {
    return new Promise((resolve) => {
      hackathonSocket.emit('world:chat', { text: args.text });
      hackathonSocket.once('world:chatResult', (result) => {
        resolve({ content: [{ type: 'text', text: `💬 已说话: ${args.text}` }] });
      });
    });
  }

  if (name === 'hackathon_broadcast') {
    try {
      hackathonSocket.emit('msg:broadcast', { text: args.text });
      return { content: [{ type: 'text', text: `✅ 消息已广播: ${args.text}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ 广播失败: ${error.message}` }] };
    }
  }

  if (name === 'hackathon_talk') {
    try {
      hackathonSocket.emit('msg:talk', {
        to: args.targetPlayerId,
        text: args.text,
      });
      return { content: [{ type: 'text', text: `✅ 私聊已发送给 ${args.targetPlayerId}: ${args.text}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ 私聊失败: ${error.message}` }] };
    }
  }

  if (name === 'hackathon_room_message') {
    try {
      hackathonSocket.emit('msg:room', { text: args.text });
      return { content: [{ type: 'text', text: `✅ 队内消息已发送: ${args.text}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ 队内消息发送失败: ${error.message}` }] };
    }
  }

  if (name === 'hackathon_update_stats') {
    try {
      const stats = {};
      if (args.mood) stats.mood = args.mood;
      if (args.confidence) stats.confidence = args.confidence;
      if (args.friends) stats.friends = args.friends;
      if (args.rivals) stats.rivals = args.rivals;
      hackathonSocket.emit('player:updateStats', stats);
      return { content: [{ type: 'text', text: `✅ 状态已更新: ${JSON.stringify(stats)}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ 状态更新失败: ${error.message}` }] };
    }
  }

  if (name === 'hackathon_product_update') {
    try {
      hackathonSocket.emit('product:update', args);
      return { content: [{ type: 'text', text: `✅ 产品文档已更新` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ 产品文档更新失败: ${error.message}` }] };
    }
  }

  if (name === 'hackathon_canvas_draw') {
    try {
      hackathonSocket.emit('canvas:draw', {
        x: args.x,
        y: args.y,
        color: args.color,
      });
      return { content: [{ type: 'text', text: `✅ 像素已绘制在 (${args.x}, ${args.y}): ${args.color}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `❌ 绘制失败: ${error.message}` }] };
    }
  }

  if (name === 'hackathon_get_events') {
    const limit = args.limit || 10;
    const recentEvents = hackathonEvents.slice(-limit);
    const eventText = recentEvents
      .map((e) => {
        if (e.type === 'connected' || e.type === 'error') {
          return `[${e.timestamp}] ${e.type}: ${e.message}`;
        }
        return `[${e.timestamp}] ${e.type}: ${JSON.stringify(e.data)}`;
      })
      .join('\n');
    return { content: [{ type: 'text', text: eventText || '暂无事件' }] };
  }

  if (name === 'hackathon_disconnect') {
    if (hackathonSocket) {
      hackathonSocket.disconnect();
      hackathonConnected = false;
      hackathonEvents.push({
        type: 'disconnected',
        timestamp: new Date().toISOString(),
        message: '已断开连接',
      });
      return { content: [{ type: 'text', text: '✅ 已断开与黑客松平台的连接' }] };
    }
    return { content: [{ type: 'text', text: '⚠️ 未连接到黑客松平台' }] };
  }

  return null;
}

module.exports = { definitions, handle };
