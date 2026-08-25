/**
 * judge.js
 * 核心判定：移动、拾取、合成、转化、放下、过关。
 *
 * 规则（最终定稿）：
 *   - 空手走到物品格        -> 拾取
 *   - beans + cup           -> 合成 coffee（在目标格生成）
 *   - tag_of_X 走到非 X 物品 -> 物品变 X，tag 消耗（同类型不生效）
 *   - tag_of_tag 走到普通物品 -> 物品变「它的标签」（不作用于已有 tag，无嵌套）
 *   - 墙 / 关着的机关门 / 手持不匹配的检查门  阻挡通行
 *   - 压力板：站上去打开所有机关门，离开关闭
 *   - F 键放下：把手持物品放到脚下地板（见 drop()）
 *
 * step(state, dx, dy) 会真实移动玩家并返回动作结果，供 UI 反馈。
 */

import {
  TYPES, isTag, tagTargetType, typeToTag, requireMatches,
  WALL, DOOR, GATE, PLATE,
} from '../data/types.js';
import { itemAt, removeItem, addItem } from './state.js';

/** 目标格是否阻挡玩家进入 */
function isBlocked(state, x, y) {
  const t = state.grid[y][x];
  if (t === WALL) return true;
  if (t === DOOR && !state.doorOpen) return true;
  if (t === GATE) {
    const gate = state.gates.find(g => g.x === x && g.y === y);
    if (gate && !requireMatches(gate.require, state.player.hand)) return true;
  }
  return false;
}

/** 更新机关门状态：玩家站上压力板，或压力板上压着物品，都会开门 */
function updateDoor(state) {
  let pressed = state.grid[state.player.y][state.player.x] === PLATE;
  if (!pressed) {
    for (const item of state.items) {
      if (state.grid[item.y][item.x] === PLATE) {
        pressed = true;
        break;
      }
    }
  }
  state.doorOpen = pressed;
}

export function step(state, dx, dy) {
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;

  // 边界与阻挡：不移动
  if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) {
    return { action: 'blocked' };
  }
  if (isBlocked(state, nx, ny)) {
    return { action: 'blocked' };
  }

  // 移动玩家
  state.player.x = nx;
  state.player.y = ny;
  updateDoor(state); // 踩上/离开压力板会影响门

  const target = itemAt(state, nx, ny);
  if (!target) return { action: 'move' }; // 走到空位

  const hand = state.player.hand;

  // 1) 空手 -> 拾取（成品咖啡除外：它应该一直待在地上）
  if (hand === null) {
    if (target.type === TYPES.COFFEE) {
      return { action: 'none' }; // 不拾取咖啡，可自由走过
    }
    state.player.hand = target.type;
    removeItem(state, target);
    return { action: 'pickup', type: target.type };
  }

  // 2) 合成：豆 + 杯 = 咖啡
  if (
    (hand === TYPES.BEANS && target.type === TYPES.CUP) ||
    (hand === TYPES.CUP && target.type === TYPES.BEANS)
  ) {
    removeItem(state, target);
    addItem(state, TYPES.COFFEE, nx, ny);
    state.player.hand = null;
    return { action: 'combine' };
  }

  // 3) 改写标签：tag_of_X 作用于非 X 物品
  const tagTarget = tagTargetType(hand);
  if (tagTarget !== null && target.type !== tagTarget) {
    target.type = tagTarget;
    state.player.hand = null;
    return { action: 'transform', from: hand, to: tagTarget };
  }

  // 4) 特殊标签：tag_of_tag 作用于普通物品 -> 变成它的标签
  if (hand === TYPES.TAG_TAG && !isTag(target.type)) {
    const newType = typeToTag(target.type);
    if (newType) {
      target.type = newType;
      state.player.hand = null;
      return { action: 'transform', from: TYPES.TAG_TAG, to: newType };
    }
  }

  // 5) 其余（同类型不生效 / 无法操作）：无操作
  return { action: 'none' };
}

/**
 * 放下：把手持物品放到脚下格子（只能在普通地板/压力板上）。
 * 格子已被占用则不能放。放下后玩家空手。
 */
export function drop(state) {
  if (state.player.hand === null) return { action: 'none' };
  const t = state.grid[state.player.y][state.player.x];
  if (t === WALL || t === DOOR || t === GATE) return { action: 'none' };
  if (itemAt(state, state.player.x, state.player.y)) return { action: 'none' };

  const type = state.player.hand;
  addItem(state, type, state.player.x, state.player.y);
  state.player.hand = null;
  updateDoor(state); // 物品压到压力板上可能开门
  return { action: 'drop', type };
}

/** 过关：玩家空手，且场上所有物品都是咖啡（至少有一个） */
export function checkWin(state) {
  return state.player.hand === null
    && state.items.length > 0
    && state.items.every(i => i.type === TYPES.COFFEE);
}

/**
 * 寻路：BFS 找从玩家当前位置到 (tx, ty) 的最短路径。
 *
 * 为了让「点击格子自动移动」不误伤局面，把除目标格外的
 * 其他「有物品的格子」一律视为障碍（绕开，避免途中拾取/合成/改写）。
 * 门状态按当前 doorOpen 判定（不会考虑途中踩压力板开门，这是最小实现取舍）。
 *
 * @returns 步进数组 [[dx,dy],...]；目标不可达返回 null；已在目标返回 []。
 */
export function findPath(state, tx, ty) {
  const sx = state.player.x, sy = state.player.y;
  if (tx === sx && ty === sy) return [];
  if (tx < 0 || ty < 0 || tx >= state.cols || ty >= state.rows) return null;

  const key = (x, y) => y * state.cols + x;
  const targetK = key(tx, ty);

  const passable = (x, y) => {
    const t = state.grid[y][x];
    if (t === WALL) return false;
    if (t === DOOR && !state.doorOpen) return false;
    if (t === GATE) {
      const gate = state.gates.find(g => g.x === x && g.y === y);
      if (gate && !requireMatches(gate.require, state.player.hand)) return false;
    }
    // 途中物品视为障碍（目标格除外，最后一步可正常拾取/合成）
    if ((x !== tx || y !== ty) && itemAt(state, x, y)) return false;
    return true;
  };

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const prev = new Map();
  const visited = new Set([key(sx, sy)]);
  const queue = [[sx, sy]];

  while (queue.length) {
    const [cx, cy] = queue.shift();
    if (cx === tx && cy === ty) break;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) continue;
      const nk = key(nx, ny);
      if (visited.has(nk) || !passable(nx, ny)) continue;
      visited.add(nk);
      prev.set(nk, [cx, cy]);
      queue.push([nx, ny]);
    }
  }

  if (!visited.has(targetK)) return null;

  // 回溯得到从起点到目标每步的位移
  const steps = [];
  let cx = tx, cy = ty;
  while (cx !== sx || cy !== sy) {
    const p = prev.get(key(cx, cy));
    if (!p) return null;
    steps.push([cx - p[0], cy - p[1]]);
    cx = p[0];
    cy = p[1];
  }
  return steps.reverse();
}
