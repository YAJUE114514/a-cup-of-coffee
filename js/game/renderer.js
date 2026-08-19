/**
 * renderer.js
 * 渲染网格、物品、玩家、手持 HUD。
 * 每次 draw() 直接重建棋盘 DOM（数据量小，简单可靠）。
 *
 * 素材：assets/ 下的透明 PNG。
 *  - 玩家 hana 素材朝右，向左移动时整体翻转（scaleX(-1)）
 *  - 手持物品时用 hana_holding，并在右上角空白区叠加手持物品小图
 *  - 普通物品用物品图；tag 物品用专门的 tag 图（tag_*.png）
 */

import { TYPES, TYPE_INFO, WALL, isTag } from '../data/types.js';
import { itemAt } from './state.js';

const ASSET = {
  [TYPES.BEANS]:  'assets/beans.png',
  [TYPES.CUP]:    'assets/cup.png',
  [TYPES.COFFEE]: 'assets/coffee.png',
  hana:           'assets/hana.png',
  hana_holding:   'assets/hana_holding.png',
};

const TAG_ASSET = {
  [TYPES.TAG_BEANS]:  'assets/tag_beans.png',
  [TYPES.TAG_CUP]:    'assets/tag_cup.png',
  [TYPES.TAG_COFFEE]: 'assets/tag_coffee.png',
  [TYPES.TAG_TAG]:    'assets/tag_tag.png',
};

/** 构造物品图标，复用于格子 / HUD / 手持叠加 */
function buildItemIcon(type) {
  const el = document.createElement('div');
  el.className = 'item-icon' + (isTag(type) ? ' tag-icon' : '');
  const img = document.createElement('img');
  img.src = isTag(type) ? TAG_ASSET[type] : ASSET[type];
  img.alt = TYPE_INFO[type].label;
  el.appendChild(img);
  return el;
}

export function renderBoard(container, state) {
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell-size))`;

  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + (state.grid[y][x] === WALL ? 'wall' : 'floor');

      const item = itemAt(state, x, y);
      if (item) cell.appendChild(itemEl(item));

      if (state.player.x === x && state.player.y === y) {
        cell.appendChild(playerEl(state));
      }

      container.appendChild(cell);
    }
  }
}

export function renderHand(container, state) {
  container.textContent = '';
  const hand = state.player.hand;
  if (hand === null) {
    container.textContent = '空手 🖐️';
    return;
  }
  container.appendChild(document.createTextNode('手持：'));
  const icon = buildItemIcon(hand);
  icon.classList.add('hand-icon');
  container.appendChild(icon);
  container.appendChild(document.createTextNode(` ${TYPE_INFO[hand].label}`));
}

function itemEl(item) {
  const el = document.createElement('div');
  el.className = 'item';
  el.title = TYPE_INFO[item.type].label;
  el.appendChild(buildItemIcon(item.type));
  return el;
}

function playerEl(state) {
  const el = document.createElement('div');
  el.className = 'player';
  if (state.player.facing === 'left') el.classList.add('facing-left');

  const img = document.createElement('img');
  img.src = state.player.hand ? ASSET.hana_holding : ASSET.hana;
  img.alt = 'hana';
  el.appendChild(img);

  if (state.player.hand) {
    const held = document.createElement('span');
    held.className = 'held-item';
    held.title = TYPE_INFO[state.player.hand].label;
    held.appendChild(buildItemIcon(state.player.hand));
    el.appendChild(held);
  }
  return el;
}
