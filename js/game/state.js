/**
 * state.js
 * 关卡运行状态：玩家位置/手持、物品列表、胜负标记。
 * 只负责「存数据」，不负责规则判定（见 judge.js）。
 */

import { PLATE } from '../data/types.js';

/**
 * 由关卡数据创建一份独立运行状态。
 * 物品会深拷贝，避免修改 levels.js 里的源数据。
 */
export function createGameState(level) {
  return {
    levelId: level.id,
    name: level.name,
    hanaLine: level.hanaLine || '',
    cols: level.cols,
    rows: level.rows,
    grid: level.grid,
    gates: (level.gates || []).map(g => ({ ...g })), // 检查门 {x,y,require}
    // 机关门是否被压力板触发打开（玩家起点在板上，或初始物品压在板上）
    doorOpen: level.grid[level.player.y][level.player.x] === PLATE
      || (level.items || []).some(i => level.grid[i.y][i.x] === PLATE),
    player: {
      x: level.player.x,
      y: level.player.y,
      hand: level.player.hand ?? null, // null=空手，否则为物品 type
      facing: 'right', // 素材朝右，初始朝右；向左移动时翻转
    },
    items: level.items.map(i => ({ ...i })),
    win: false,
  };
}

/** 返回 (x, y) 上的物品；没有则返回 null */
export function itemAt(state, x, y) {
  return state.items.find(i => i.x === x && i.y === y) || null;
}

/** 移除指定物品 */
export function removeItem(state, item) {
  state.items = state.items.filter(i => i !== item);
}

/** 在地板上新增一个物品 */
export function addItem(state, type, x, y) {
  state.items.push({ type, x, y });
}
