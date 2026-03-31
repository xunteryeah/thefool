// 区域互动内容数据
// 内容数据独立于引擎逻辑，方便扩写世界观时不触碰状态机。

const ZONE_INTERACTIONS = {
  building: {
    hall: [
      { action: '在大厅广播消息', result: '你的声音在大厅回响，所有人都注意到了你。', icon: 'Billboard', sound: 'chat' },
      { action: '走上主舞台', result: '灯光聚焦到你身上，你准备向大家介绍你的创意。', icon: 'GoldKey', sound: 'interact' },
      { action: '查看活动日程', result: '今日安排：开场介绍、分组、评审与颁奖。', icon: 'FortuneCookie', sound: 'interact' },
    ],
    teamroom: [
      { action: '开始头脑风暴', result: '你们围坐一起，贴出了几张创意便签。', icon: 'Honey', sound: 'chat' },
      { action: '分配任务', result: '每个人都领取了明确的职责，进度清晰可见。', icon: 'GoldCoin', sound: 'interact' },
      { action: '调试原型', result: '原型运行顺利，团队士气提升。', icon: 'LifePot', sound: 'heal' },
    ],
  },
  floor: {
    paved: [
      { action: '沿着通道前进', result: '这里连接着大厅与各个房间，是大家来回协作的主要动线。', icon: 'GoldCoin', sound: 'interact' },
    ],
  },
};

// Tiled 导出的区域名可能中英混用，因此这里用正则做统一归类。
const ZONE_CATEGORY_MAP = [
  [/corridor|hallway|path|walkway|走廊|通道|过道|石板/, 'paved'],
  [/hall|大厅|主舞台/, 'hall'],
  [/room|房间|讨论室/, 'teamroom'],
];

module.exports = { ZONE_INTERACTIONS, ZONE_CATEGORY_MAP };
