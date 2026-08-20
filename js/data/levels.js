/**
 * levels.js
 * 关卡数据。每关 = 网格 + 玩家起点 + 物品列表 + hana 台词。
 *
 * grid 里 'W'=墙，'F'=地板。物品不挡路，地板可自由行走。
 *
 * 配平提示：初始 beans + cup 总数必须是偶数，才能全部合成为咖啡；
 * 多出的数量靠 tag 改写类型来配平。
 *
 *  - 关卡 1：1豆1杯             纯合成教学
 *  - 关卡 2：1豆3杯 + tag豆     tag 配平（多余的杯变豆）
 *  - 关卡 3：2豆2杯 + tag豆 + tag杯   墙 + 双 tag 交替配平
 */

export const LEVELS = [
  {
    id: 'h01',
    name: '实验室的早晨',
    hanaLine: '……咖啡呢？明明记得还有的。',
    cols: 6,
    rows: 4,
    grid: [
      ['F', 'F', 'F', 'F', 'F', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'F'],
    ],
    player: { x: 0, y: 0 },
    items: [
      { type: 'beans', x: 1, y: 1 },
      { type: 'cup',   x: 4, y: 1 },
    ],
  },
  {
    id: 'h02',
    name: '多出来的杯子',
    hanaLine: '一杯咖啡只要一杯……多出来的，就变成豆子吧。',
    cols: 6,
    rows: 4,
    grid: [
      ['F', 'F', 'F', 'F', 'F', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'F'],
    ],
    player: { x: 0, y: 0 },
    items: [
      { type: 'beans', x: 1, y: 1 },
      { type: 'cup',   x: 4, y: 1 },
      { type: 'cup',   x: 4, y: 2 },
      { type: 'cup',   x: 1, y: 2 },
      { type: 'tag_of_beans', x: 2, y: 3 },
    ],
  },
  {
    id: 'h03',
    name: '绕个路吧',
    hanaLine: '动动脑筋，总有一条路能凑齐两杯。',
    cols: 6,
    rows: 5,
    grid: [
      ['F', 'F', 'F', 'F', 'F', 'F'],
      ['F', 'W', 'F', 'F', 'W', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'F'],
      ['F', 'W', 'F', 'F', 'W', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'F'],
    ],
    player: { x: 0, y: 0 },
    items: [
      { type: 'beans', x: 1, y: 0 },
      { type: 'beans', x: 4, y: 0 },
      { type: 'cup',   x: 1, y: 4 },
      { type: 'cup',   x: 4, y: 4 },
      { type: 'tag_of_beans', x: 0, y: 2 },
      { type: 'tag_of_cup',   x: 5, y: 2 },
    ],
  },
  {
    "id": "level_04",
    "name": "杯子里的咖啡",
    "hanaLine": "只多了一个杯子……该怎么办呢？",
    "cols": 6,
    "rows": 4,
    "grid": [
      [
        "F",
        "F",
        "W",
        "W",
        "F",
        "F"
      ],
      [
        "F",
        "F",
        "W",
        "W",
        "F",
        "F"
      ],
      [
        "F",
        "W",
        "W",
        "W",
        "W",
        "F"
      ],
      [
        "F",
        "F",
        "F",
        "F",
        "F",
        "F"
      ]
    ],
    "player": {
      "x": 1,
      "y": 3,
      "hand": null
    },
    "items": [
      {
        "type": "tag_of_beans",
        "x": 1,
        "y": 0
      },
      {
        "type": "cup",
        "x": 4,
        "y": 0
      },
      {
        "type": "cup",
        "x": 0,
        "y": 1
      },
      {
        "type": "beans",
        "x": 5,
        "y": 1
      }
    ]
  },
  {
    "id": "level_05",
    "name": "生成标签？",
    "hanaLine": "地上真是一片混乱……快点清理干净吧",
    "cols": 4,
    "rows": 4,
    "grid": [
      [
        "W",
        "W",
        "F",
        "F"
      ],
      [
        "W",
        "F",
        "F",
        "F"
      ],
      [
        "F",
        "F",
        "F",
        "W"
      ],
      [
        "F",
        "F",
        "W",
        "W"
      ]
    ],
    "player": {
      "x": 0,
      "y": 3,
      "hand": null
    },
    "items": [
      {
        "type": "tag_of_beans",
        "x": 2,
        "y": 0
      },
      {
        "type": "tag_of_cup",
        "x": 3,
        "y": 0
      },
      {
        "type": "beans",
        "x": 1,
        "y": 1
      },
      {
        "type": "beans",
        "x": 2,
        "y": 1
      },
      {
        "type": "tag_of_beans",
        "x": 3,
        "y": 1
      },
      {
        "type": "tag_of_tag",
        "x": 1,
        "y": 2
      },
      {
        "type": "cup",
        "x": 2,
        "y": 2
      }
    ]
  },
  {
    "id": "level_06",
    "name": "压力计",
    "hanaLine": "有时需要上点压力才行",
    "cols": 5,
    "rows": 4,
    "grid": [
      [
        "W",
        "W",
        "F",
        "W",
        "W"
      ],
      [
        "W",
        "W",
        "D",
        "W",
        "W"
      ],
      [
        "W",
        "W",
        "F",
        "W",
        "W"
      ],
      [
        "F",
        "F",
        "P",
        "F",
        "F"
      ]
    ],
    "player": {
      "x": 0,
      "y": 3,
      "hand": null
    },
    "items": [
      {
        "type": "beans",
        "x": 2,
        "y": 0
      },
      {
        "type": "cup",
        "x": 4,
        "y": 3
      }
    ]
  },
  {
    "id": "level_07",
    "name": "限行区域",
    "hanaLine": "不同的门需要不同的打开方式，咖啡也一样。",
    "cols": 8,
    "rows": 5,
    "grid": [
      [
        "F",
        "F",
        "W",
        "W",
        "W",
        "W",
        "F",
        "F"
      ],
      [
        "F",
        "F",
        "D",
        "F",
        "F",
        "F",
        "F",
        "F"
      ],
      [
        "F",
        "P",
        "W",
        "W",
        "W",
        "W",
        "F",
        "F"
      ],
      [
        "F",
        "F",
        "G",
        "F",
        "F",
        "F",
        "F",
        "F"
      ],
      [
        "F",
        "F",
        "W",
        "W",
        "W",
        "W",
        "F",
        "F"
      ]
    ],
    "player": {
      "x": 0,
      "y": 2,
      "hand": null
    },
    "items": [
      {
        "type": "beans",
        "x": 1,
        "y": 1
      },
      {
        "type": "cup",
        "x": 4,
        "y": 1
      },
      {
        "type": "cup",
        "x": 7,
        "y": 1
      },
      {
        "type": "beans",
        "x": 1,
        "y": 3
      },
      {
        "type": "beans",
        "x": 4,
        "y": 3
      },
      {
        "type": "tag_of_cup",
        "x": 7,
        "y": 3
      }
    ],
    "gates": [
      {
        "x": 2,
        "y": 3,
        "require": "cup"
      }
    ]
  },
];
