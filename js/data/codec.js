/**
 * codec.js
 * 关卡紧凑编码 / 解码（分享用）—— 全项目唯一编解码来源。
 *
 * 格式（v2）：v2|{cols}x{rows}|{grid}|{player}
 *  - grid：每格一字符，物品 / 检查门直接合并进网格
 *      P<物品> 压力板+物品 / P. 空压力板
 *      G<要求> 检查门+要求物品 / Gt 检查门要求任意标签
 *      W/F/D  地形单字符；b/c/C/1~4 物品单字符（表示「地板 + 物品」）
 *  - player：3 字符（坐标x + 坐标y + 起手码，空手为 '.'）
 *
 * 供游戏（index.html 分享入口 / URL 参数）与编辑器共用，
 * 避免两份编解码逻辑漂移。格式向后兼容 v2。
 */

import { TYPES, TAG_REQUIRE } from './types.js';

export const CODE_VER = 'v2';

const COORDS = 'abcdefghijklmnopqrstuvwxyz'; // a=0 ... z=25
const TYPE_TO_CODE = {
  [TYPES.BEANS]: 'b',
  [TYPES.CUP]: 'c',
  [TYPES.COFFEE]: 'C',
  [TYPES.TAG_BEANS]: '1',
  [TYPES.TAG_CUP]: '2',
  [TYPES.TAG_COFFEE]: '3',
  [TYPES.TAG_TAG]: '4',
  [TAG_REQUIRE]: 't', // 检查门 require 通配
};
const CODE_TO_TYPE = {};
for (const [k, v] of Object.entries(TYPE_TO_CODE)) CODE_TO_TYPE[v] = k;
const coord = n => COORDS[n] ?? '?';
const uncoord = ch => COORDS.indexOf(ch);

// v2 网格字符分类
//   地形单字符：W 墙 / F 地板 / D 机关门（P、G 有双字符组合，单独处理）
//   物品单字符：b 豆 / c 杯 / C 咖啡 / 1~4 tag（表示「地板 + 物品」）
const TERRAIN_SINGLE = 'WFD';
const ITEM_SINGLE = 'bcC1234';

/** 把关卡对象编码为紧凑 Code 字符串 */
export function encodeLevel(level) {
  const itemsMap = new Map(level.items.map(it => [`${it.x},${it.y}`, it.type]));
  const gatesMap = new Map((level.gates || []).map(g => [`${g.x},${g.y}`, g.require]));
  let gridStr = '';
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const t = level.grid[y][x];
      const item = itemsMap.get(`${x},${y}`);
      const gate = gatesMap.get(`${x},${y}`);
      if (t === 'P' && item) gridStr += 'P' + TYPE_TO_CODE[item];
      else if (t === 'P') gridStr += 'P.'; // 空压力板，避免与「P+物品」歧义
      else if (t === 'G' && gate) gridStr += 'G' + TYPE_TO_CODE[gate];
      else if (t === 'F' && item) gridStr += TYPE_TO_CODE[item];
      else gridStr += t;
    }
  }
  const playerStr = coord(level.player.x) + coord(level.player.y)
    + (level.player.hand ? TYPE_TO_CODE[level.player.hand] : '.');
  return `${CODE_VER}|${level.cols}x${level.rows}|${gridStr}|${playerStr}`;
}

/** 解析关卡 Code，返回关卡对象；格式错误抛异常 */
export function decodeLevel(code) {
  const parts = code.split('|');
  if (parts.length < 4) throw new Error('格式不完整');
  const [ver, size, gridStr, playerStr] = parts;
  if (ver !== CODE_VER) throw new Error('版本不支持');

  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) throw new Error('尺寸格式错误');
  const cols = +m[1], rows = +m[2];
  if (cols < 4 || cols > 12 || rows < 4 || rows > 12) throw new Error(`尺寸 ${cols}×${rows} 超出 4~12`);

  // 解析合并网格：地形 + 物品 + 检查门
  const flat = [];
  const items = [];
  const gates = [];
  let i = 0, idx = 0;
  while (i < gridStr.length) {
    if (idx >= cols * rows) throw new Error('网格数据过长');
    const x = idx % cols, y = Math.floor(idx / cols);
    const ch = gridStr[i];
    if (ch === 'P') { // 压力板：P<物品> 带物品，P. 空压力板
      const nx = gridStr[i + 1];
      if (ITEM_SINGLE.includes(nx)) {
        flat.push('P');
        items.push({ type: CODE_TO_TYPE[nx], x, y });
        i += 2;
      } else if (nx === '.') {
        flat.push('P');
        i += 2;
      } else {
        throw new Error('压力板字符格式错误');
      }
    } else if (ch === 'G') { // 检查门（带要求物品，双字符）
      const nx = gridStr[i + 1];
      if (ITEM_SINGLE.includes(nx) || nx === 't') {
        flat.push('G');
        gates.push({ x, y, require: CODE_TO_TYPE[nx] });
        i += 2;
      } else {
        flat.push('G');
        gates.push({ x, y, require: TYPES.BEANS });
        i++;
      }
    } else if (TERRAIN_SINGLE.includes(ch)) {
      flat.push(ch);
      i++;
    } else if (ITEM_SINGLE.includes(ch)) {
      flat.push('F');
      items.push({ type: CODE_TO_TYPE[ch], x, y });
      i++;
    } else {
      throw new Error('未知字符: ' + ch);
    }
    idx++;
  }
  if (idx !== cols * rows) throw new Error('网格长度不符');

  const grid = [];
  for (let y = 0; y < rows; y++) grid.push(flat.slice(y * cols, (y + 1) * cols));

  // 玩家
  if (playerStr.length !== 3) throw new Error('玩家数据错误');
  const px = uncoord(playerStr[0]), py = uncoord(playerStr[1]);
  if (px < 0 || py < 0) throw new Error('玩家坐标错误');
  const hand = playerStr[2] === '.' ? null : CODE_TO_TYPE[playerStr[2]] || null;

  return {
    id: 'shared',
    name: '分享关卡',
    hanaLine: '',
    cols, rows, grid,
    player: { x: px, y: py, hand },
    items, gates,
  };
}
