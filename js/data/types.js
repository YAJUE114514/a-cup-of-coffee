/**
 * types.js
 * 物品类型常量与展示信息 —— 全项目唯一的「事实来源」。
 *
 * 7 种物品：
 *   beans / cup / coffee                原料与成品
 *   tag_of_beans / tag_of_cup / tag_of_coffee   改写标签
 *   tag_of_tag                           特殊标签（把物品变成「它的标签」）
 *
 * 规则要点：
 *   - 「同类型不生效」：tag_of_X 走到 X 上不会消耗 tag
 *   - tag_of_tag 不作用于已有 tag（避免无限嵌套）
 *   - coffee 也可被 tag 拆回原料
 */

export const TYPES = Object.freeze({
  BEANS: 'beans',
  CUP: 'cup',
  COFFEE: 'coffee',
  TAG_BEANS: 'tag_of_beans',
  TAG_CUP: 'tag_of_cup',
  TAG_COFFEE: 'tag_of_coffee',
  TAG_TAG: 'tag_of_tag',
});

// 地图格子
export const WALL = 'W';
export const FLOOR = 'F';
export const PLATE = 'P';   // 压力板：站上去打开机关门
export const DOOR = 'D';    // 机关门：压力板触发开/关
export const GATE = 'G';    // 检查门：需手持指定物品才能通过

// 地形展示信息（编辑器用）
export const TILE_INFO = Object.freeze({
  [WALL]:  { label: '墙',      emoji: '▦' },
  [FLOOR]: { label: '地板',    emoji: '▣' },
  [PLATE]: { label: '压力板',  emoji: '⬤' },
  [DOOR]:  { label: '机关门',  emoji: '🚪' },
  [GATE]:  { label: '检查门',  emoji: '🔒' },
});

// 展示信息：emoji + 中文名
export const TYPE_INFO = Object.freeze({
  [TYPES.BEANS]:      { label: '咖啡豆',      emoji: '🫘' },
  [TYPES.CUP]:        { label: '空杯子',      emoji: '🍵' },
  [TYPES.COFFEE]:     { label: '一杯咖啡',    emoji: '☕' },
  [TYPES.TAG_BEANS]:  { label: '标签·豆',     emoji: '🏷️🫘' },
  [TYPES.TAG_CUP]:    { label: '标签·杯',     emoji: '🏷️🍵' },
  [TYPES.TAG_COFFEE]: { label: '标签·咖啡',   emoji: '🏷️☕' },
  [TYPES.TAG_TAG]:    { label: '标签·标签',   emoji: '🏷️🏷️' },
});

/** 该类型是否属于某种标签 */
export function isTag(type) {
  return type === TYPES.TAG_BEANS
    || type === TYPES.TAG_CUP
    || type === TYPES.TAG_COFFEE
    || type === TYPES.TAG_TAG;
}

/**
 * tag_of_X 会把地面物品改写为 X。
 * 返回改写目标；不是「普通改写标签」（如 tag_of_tag）则返回 null。
 */
export function tagTargetType(tagType) {
  switch (tagType) {
    case TYPES.TAG_BEANS:  return TYPES.BEANS;
    case TYPES.TAG_CUP:    return TYPES.CUP;
    case TYPES.TAG_COFFEE: return TYPES.COFFEE;
    default:               return null;
  }
}

/**
 * 普通物品 -> 它的标签（beans -> tag_of_beans ...）。
 * 供 tag_of_tag 使用；本身是标签则返回 null。
 */
export function typeToTag(type) {
  switch (type) {
    case TYPES.BEANS:  return TYPES.TAG_BEANS;
    case TYPES.CUP:    return TYPES.TAG_CUP;
    case TYPES.COFFEE: return TYPES.TAG_COFFEE;
    default:           return null;
  }
}
