/**
 * main.js
 * 入口与流程控制：标题 → 关卡选择 → 关卡过渡 → 游戏。
 *
 * 操作方式：
 *   - 方向键 / WASD  逐格移动
 *   - R             重置当前关（直接重开）
 *   - 过渡界面：数秒后自动开始；方向键 / 空格 / 回车立即开始
 *   - 同关重置超过 3 次后，有概率在底部刷新出 hana 的一句话
 */

import { LEVELS } from '../data/levels.js';
import { createGameState } from './state.js';
import { step, checkWin, drop } from './judge.js';
import { renderBoard, renderHand } from './renderer.js';

let state = null;
let levelIndex = 0;
let resetCount = 0;      // 当前关内的重置次数（进入新关归零）
let introTimer = null;   // 过渡界面自动开始定时器
let tipTimer = null;     // hana 台词自动消失定时器

const INTRO_AUTO_MS = 2500; // 过渡界面停留时间

const KEY_MAP = {
  ArrowUp:    [0, -1],
  ArrowDown:  [0, 1],
  ArrowLeft:  [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

// 重置多次后 hana 可能说的话
const HANA_TIPS = [
  '路线想清楚再走，别瞎转。',
  '冷静，深呼吸。咖啡会有的。',
  '想想 tag 该用在哪一步。',
  'tag 别浪费在同类型上……我吃过亏。',
  '把做好的咖啡拆了重组，也是一种思路。',
  '迷宫是墙构成的，思路是空隙构成的。',
];

// ---- DOM ----
const boardEl = document.getElementById('board');
const handEl = document.getElementById('hand');
const winOverlayEl = document.getElementById('win-overlay');
const nextBtn = document.getElementById('next-btn');
const resetBtn = document.getElementById('reset-btn');
const levelListEl = document.getElementById('level-list');
const hanaTipEl = document.getElementById('hana-tip');
const btnStart = document.getElementById('btn-start');
const btnBackTitle = document.getElementById('btn-back-title');
const btnBegin = document.getElementById('btn-begin');

// ---- 屏幕切换 ----
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

// ---- 关卡选择 ----
function renderLevelList() {
  levelListEl.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const card = document.createElement('button');
    card.className = 'level-card';
    card.innerHTML = `<span class="level-num">${i + 1}</span><span class="level-name">${lv.name}</span>`;
    card.addEventListener('click', () => {
      levelIndex = i;
      enterIntro();
    });
    levelListEl.appendChild(card);
  });
}

/** 进入关卡过渡界面（选关 / 下一关时），数秒后自动开始 */
function enterIntro() {
  resetCount = 0; // 进入新关，重置计数归零
  const lv = LEVELS[levelIndex];
  document.getElementById('intro-index').textContent = `第 ${levelIndex + 1} 关 / ${LEVELS.length}`;
  document.getElementById('intro-name').textContent = lv.name;
  document.getElementById('intro-hint').textContent = lv.hanaLine || '';
  winOverlayEl.classList.add('hidden');
  hanaTipEl.classList.add('hidden');
  showScreen('intro');

  clearTimeout(introTimer);
  introTimer = setTimeout(startGame, INTRO_AUTO_MS);
}

/** 真正开始游玩 */
function startGame() {
  clearTimeout(introTimer);
  state = createGameState(LEVELS[levelIndex]);
  showScreen('game');
  draw();
}

/** 重置当前关：直接重开，多次后概率冒出 hana 的话 */
function resetLevel() {
  resetCount++;
  startGame();
  if (resetCount > 3 && Math.random() < 0.5) {
    const msg = HANA_TIPS[Math.floor(Math.random() * HANA_TIPS.length)];
    hanaTipEl.textContent = `“${msg}”`;
    hanaTipEl.classList.remove('hidden');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => hanaTipEl.classList.add('hidden'), 4000);
  } else {
    hanaTipEl.classList.add('hidden');
  }
}

function draw() {
  renderBoard(boardEl, state);
  renderHand(handEl, state);
}

// ---- 事件 ----
btnStart.addEventListener('click', () => showScreen('levels'));
btnBackTitle.addEventListener('click', () => showScreen('title'));
btnBegin.addEventListener('click', startGame);
resetBtn.addEventListener('click', resetLevel);

nextBtn.addEventListener('click', () => {
  levelIndex = (levelIndex + 1) % LEVELS.length;
  enterIntro();
});

window.addEventListener('keydown', (e) => {
  const inIntro = document.getElementById('screen-intro').classList.contains('active');
  const inGame = document.getElementById('screen-game').classList.contains('active');

  // 关卡过渡界面：方向键 / 空格 / 回车 立即开始（取消自动跳转）
  if (inIntro) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key)) {
      e.preventDefault();
      startGame();
      return;
    }
  }

  if (inGame) {
    if (state && state.win) return; // 过关浮层出现时锁操作

    const key = e.key;
    const move = KEY_MAP[key] || KEY_MAP[key.toLowerCase()];

    if (move) {
      e.preventDefault();
      // 记录朝向（素材朝右，向左走要翻转）
      if (move[0] < 0) state.player.facing = 'left';
      else if (move[0] > 0) state.player.facing = 'right';
      step(state, move[0], move[1]);
      draw();

      if (checkWin(state)) {
        state.win = true;
        winOverlayEl.classList.remove('hidden');
      }
      return;
    }

    if (key === 'f' || key === 'F') {
      drop(state); // 放下手持物品到脚下
      draw();
      return;
    }

    if (key === 'r' || key === 'R') {
      resetLevel();
    }
  }
});

// ---- 初始化 ----
renderLevelList();
showScreen('title');
