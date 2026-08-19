/**
 * judge.js
 * 核心判定：移动、拾取、合成、转化、过关。
 *
 * 规则（最终定稿）：
 *   - 空手走到物品格        -> 拾取
 *   - beans + cup           -> 合成 coffee（在目标格生成）
 *   - tag_of_X 走到非 X 物品 -> 物品变 X，tag 消耗（同类型不生效）
 *   - tag_of_tag 走到普通物品 -> 物品变「它的标签」（不作用于已有 tag，无嵌套）
 *   - 其余情况：无操作，但玩家可以自由走过地板
 *
 * step(state, dx, dy) 会真实移动玩家并返回动作结果，供 UI 反馈。
 */

import { TYPES, isTag, tagTargetType, typeToTag } from '../data/types.js';
import { itemAt, removeItem, addItem } from './state.js';

export function step(state, dx, dy) {
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;

  // 边界与墙阻挡：不移动
  if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) {
    return { action: 'blocked' };
  }
  if (state.grid[ny][nx] === 'W') {
    return { action: 'blocked' };
  }

  // 移动玩家
  state.player.x = nx;
  state.player.y = ny;

  const target = itemAt(state, nx, ny);
  if (!target) return { action: 'move' }; // 走到空地板/空位

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

/** 过关：玩家空手，且场上所有物品都是咖啡（至少有一个） */
export function checkWin(state) {
  return state.player.hand === null
    && state.items.length > 0
    && state.items.every(i => i.type === TYPES.COFFEE);
}
