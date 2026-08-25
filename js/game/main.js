/**
 * main.js
 * 入口与流程控制：标题 → 关卡选择 → 关卡过渡 → 游戏。
 *
 * 操作方式：
 *   - 方向键 / WASD  逐格移动
 *   - 点击棋盘格子    BFS 自动寻路（途中物品视为障碍，不误拾取）
 *   - R 重置 / Z 撤销 / F 放下
 *   - 触屏设备：底部虚拟按键（方向键 + 放下/撤销/重置）
 *   - 过渡界面：数秒后自动开始；方向键 / 空格 / 回车立即开始
 *
 * 分享：
 *   - URL 参数 ?play=<Code>&name=&line= 打开即玩
 *   - 标题界面「📥 游玩分享关卡」：粘贴 Code 或完整链接
 */

import { LEVELS } from '../data/levels.js';
import { decodeLevel } from '../data/codec.js';
import { createGameState } from './state.js';
import { step, checkWin, drop, findPath } from './judge.js';
import { renderBoard, renderHand } from './renderer.js';
import { initTouchControls } from './touch.js';

let state = null;
let levelIndex = 0;
let resetCount = 0;      // 当前关内的重置次数（进入新关归零）
let introTimer = null;   // 过渡界面自动开始定时器
let tipTimer = null;     // hana 台词自动消失定时器
let noInputTimer = null;         // 第一关「无输入提示」定时器
let tutorialHint = null;         // 当前教程提示类型：null | 'move' | 'combine'
let tutorialCombineShown = false;
let history = [];                // 撤销栈（状态快照，Z 键撤销）
const HISTORY_LIMIT = 100;

let autoTimer = null;    // 点击寻路自动移动定时器
let autoSteps = [];      // 剩余步进队列

const INTRO_AUTO_MS = 2500; // 过渡界面停留时间
const AUTO_MOVE_MS = 130;   // 自动移动每步间隔

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

// 第一关教程
const isTutorial = () => levelIndex === 0;
const TUTORIAL_MOVE = '用方向键或者 wasd 都可以控制我移动。';
const TUTORIAL_COMBINE = '对，然后把它们组合到一起……';
const TUTORIAL_WIN = '把所有东西都变成咖啡就可以通关啦！是不是很简单？';
const WIN_TEXT_DEFAULT = '搞定！下一间实验室。';

// ---- DOM ----
const boardEl = document.getElementById('board');
const handEl = document.getElementById('hand');
const winOverlayEl = document.getElementById('win-overlay');
const winTextEl = document.getElementById('win-text');
const nextBtn = document.getElementById('next-btn');
const menuBtn = document.getElementById('menu-btn');
const levelListEl = document.getElementById('level-list');
const hanaTipEl = document.getElementById('hana-tip');
const btnStart = document.getElementById('btn-start');
const btnBackTitle = document.getElementById('btn-back-title');
const btnBegin = document.getElementById('btn-begin');
const controlTipEl = document.querySelector('.control-tip');

// ---- 分享弹窗 ----
const btnSharePlay = document.getElementById('btn-share-play');
const shareModal = document.getElementById('share-modal');
const shareInput = document.getElementById('share-input');
const shareError = document.getElementById('share-error');
const btnShareOk = document.getElementById('btn-share-ok');
const btnShareCancel = document.getElementById('btn-share-cancel');

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
    const badge = lv.id === 'shared' ? ' <span class="shared-badge">分享</span>' : '';
    card.innerHTML = `<span class="level-num">${i + 1}</span><span class="level-name">${lv.name}${badge}</span>`;
    card.addEventListener('click', () => {
      levelIndex = i;
      enterIntro();
    });
    levelListEl.appendChild(card);
  });
}

/** 进入关卡过渡界面（选关 / 下一关 / 分享关时），数秒后自动开始 */
function enterIntro() {
  resetCount = 0; // 进入新关，重置计数归零
  const lv = LEVELS[levelIndex];
  document.getElementById('intro-index').textContent = `第 ${levelIndex + 1} 关 / ${LEVELS.length}`;
  document.getElementById('intro-name').textContent = lv.name;
  document.getElementById('intro-hint').textContent = lv.hanaLine || '';
  winOverlayEl.classList.add('hidden');
  hanaTipEl.classList.add('hidden');
  clearTimeout(noInputTimer);
  tutorialHint = null;
  showScreen('intro');

  clearTimeout(introTimer);
  introTimer = setTimeout(startGame, INTRO_AUTO_MS);
}

/** 真正开始游玩 */
function startGame() {
  clearTimeout(introTimer);
  stopAutoMove();
  state = createGameState(LEVELS[levelIndex]);
  history = []; // 新关卡清空撤销历史
  showScreen('game');
  draw();
  setupTutorial();
}

// ---- 撤销（Z 键）----
function cloneState(s) { return JSON.parse(JSON.stringify(s)); }
function trimHistory() { if (history.length > HISTORY_LIMIT) history.shift(); }
function pushHistory() {
  history.push(cloneState(state));
  trimHistory();
}
function undo() {
  if (history.length === 0) return;
  state = history.pop();
  draw();
}

// ---- 核心操作（键盘 / 虚拟按键 / 自动移动共用）----
function doMove(dx, dy) {
  if (!state || state.win) return { action: 'none' };
  // 玩家开始移动：取消「无输入」定时器，隐藏移动教程提示
  clearTimeout(noInputTimer);
  hideTutorialTip('move');

  const snapshot = cloneState(state); // 撤销用：记录操作前状态
  // 记录朝向（素材朝右，向左走要翻转）
  if (dx < 0) state.player.facing = 'left';
  else if (dx > 0) state.player.facing = 'right';
  const result = step(state, dx, dy);
  if (result.action !== 'blocked') { // 只有真正移动了才可撤销
    history.push(snapshot);
    trimHistory();
  }
  draw();

  // 第一关教程：第一次捡起物品 → 提示组合
  if (isTutorial() && !tutorialCombineShown && result.action === 'pickup') {
    tutorialCombineShown = true;
    showTutorialTip('combine', TUTORIAL_COMBINE);
  } else if (result.action === 'combine') {
    hideTutorialTip('combine');
  }

  if (checkWin(state)) {
    state.win = true;
    winTextEl.textContent = isTutorial() ? TUTORIAL_WIN : WIN_TEXT_DEFAULT;
    winOverlayEl.classList.remove('hidden');
    stopAutoMove();
  }
  return result;
}

function doDrop() {
  if (!state || state.win) return;
  stopAutoMove();
  const snapshot = cloneState(state);
  const result = drop(state); // 放下手持物品到脚下
  if (result.action === 'drop') {
    history.push(snapshot);
    trimHistory();
  }
  draw();
}

function doUndo() {
  if (!state || state.win) return;
  stopAutoMove();
  undo(); // 撤销一步
}

function doReset() {
  if (!state) return;
  stopAutoMove();
  resetLevel();
}

// ---- 点击格子自动寻路 ----
function stopAutoMove() {
  clearInterval(autoTimer);
  autoTimer = null;
  autoSteps = [];
}

function startAutoMove(path) {
  if (autoTimer || !path || !path.length) return;
  clearTimeout(noInputTimer);
  hideTutorialTip('move');
  autoSteps = path.slice();
  autoTimer = setInterval(autoStep, AUTO_MOVE_MS);
}

function autoStep() {
  if (!state || !autoSteps.length) {
    stopAutoMove();
    return;
  }
  const [dx, dy] = autoSteps.shift();
  const r = doMove(dx, dy);
  if (r.action === 'blocked' || state.win) {
    stopAutoMove();
  }
}

// ---- 第一关教程 ----
function setupTutorial() {
  clearTimeout(noInputTimer);
  tutorialHint = null;
  hanaTipEl.classList.add('hidden');
  if (isTutorial()) {
    tutorialCombineShown = false;
    noInputTimer = setTimeout(showMoveHint, 10000);
  }
}

function showMoveHint() {
  if (!isTutorial()) return;
  showTutorialTip('move', TUTORIAL_MOVE);
}

function showTutorialTip(type, msg) {
  tutorialHint = type;
  hanaTipEl.textContent = `“${msg}”`;
  hanaTipEl.classList.remove('hidden');
}

function hideTutorialTip(type) {
  if (type && tutorialHint !== type) return; // 只隐藏指定类型，避免误关其他提示
  tutorialHint = null;
  hanaTipEl.classList.add('hidden');
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
  fitBoard();
}

/** 棋盘格子随屏幕宽度缩放（触屏 / 小窗自适应） */
function fitBoard() {
  if (!state) return;
  const gap = 5;
  const avail = Math.min(window.innerWidth - 24, 760);
  const size = Math.max(30, Math.min(64, Math.floor((avail - (state.cols - 1) * gap) / state.cols)));
  boardEl.style.setProperty('--cell-size', size + 'px');
}

/** 进入下一关（通关浮层的按钮 / 空格 / 回车） */
function nextLevel() {
  levelIndex = (levelIndex + 1) % LEVELS.length;
  enterIntro();
}

/** 返回主菜单：清理所有运行状态与定时器 */
function goToTitle() {
  stopAutoMove();
  clearTimeout(introTimer);
  clearTimeout(noInputTimer);
  clearTimeout(tipTimer);
  closeShareModal();
  state = null;
  history = [];
  hanaTipEl.classList.add('hidden');
  winOverlayEl.classList.add('hidden');
  showScreen('title');
}

// ---- 分享：游玩分享关卡 ----
function openShareModal() {
  shareInput.value = '';
  shareError.classList.add('hidden');
  shareModal.classList.remove('hidden');
  shareInput.focus();
}

function closeShareModal() {
  shareModal.classList.add('hidden');
}

/**
 * 把一份解析出的分享关加入关卡列表并进入过渡界面。
 * 同一会话内分享关保持单一槽位：再次加载时替换旧分享关。
 */
function loadSharedLevel(level) {
  const idx = LEVELS.findIndex(l => l.id === 'shared');
  if (idx >= 0) {
    LEVELS[idx] = level;
    levelIndex = idx;
  } else {
    LEVELS.push(level);
    levelIndex = LEVELS.length - 1;
  }
  renderLevelList(); // 刷新关卡列表，让分享关出现在选择界面
  enterIntro();
}

/** 从 Code 或分享链接解析并游玩 */
function startSharedFromText(text) {
  const t = text.trim();
  if (!t) {
    shareError.textContent = '请粘贴关卡 Code 或分享链接。';
    shareError.classList.remove('hidden');
    return;
  }
  // 支持直接粘贴完整分享链接
  let code = t, name = null, line = null;
  try {
    const url = new URL(t);
    const p = url.searchParams.get('play');
    if (p) {
      code = p;
      name = url.searchParams.get('name');
      line = url.searchParams.get('line');
    }
  } catch { /* 不是 URL，当作纯 Code */ }

  try {
    const level = decodeLevel(code);
    level.name = name || level.name || '分享关卡';
    level.hanaLine = line || level.hanaLine || '';
    loadSharedLevel(level);
    closeShareModal();
  } catch (err) {
    shareError.textContent = '无效的关卡 Code：' + err.message;
    shareError.classList.remove('hidden');
  }
}

/** 初始化时解析 URL 参数 ?play=...，直接进入分享关 */
function handleUrlShare() {
  const params = new URLSearchParams(location.search);
  const play = params.get('play');
  if (!play) return false;
  try {
    const level = decodeLevel(play);
    level.name = params.get('name') || level.name || '分享关卡';
    level.hanaLine = params.get('line') || level.hanaLine || '';
    loadSharedLevel(level);
    // 清掉地址栏参数，避免刷新时重复添加
    // 注意：本模块的 history 是撤销栈，清 URL 要用 window.history
    if (window.history.replaceState) window.history.replaceState(null, '', location.pathname);
    return true;
  } catch (err) {
    console.warn('分享链接解析失败：', err.message);
    return false;
  }
}

// ---- 事件 ----
btnStart.addEventListener('click', () => showScreen('levels'));
btnBackTitle.addEventListener('click', () => showScreen('title'));
btnBegin.addEventListener('click', startGame);
menuBtn.addEventListener('click', goToTitle);
nextBtn.addEventListener('click', nextLevel);

// 分享弹窗
btnSharePlay.addEventListener('click', openShareModal);
btnShareOk.addEventListener('click', () => startSharedFromText(shareInput.value));
btnShareCancel.addEventListener('click', closeShareModal);
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) closeShareModal();
});

// 点击棋盘：自动寻路到目标格（途中物品视为障碍，不误拾取）
boardEl.addEventListener('click', (e) => {
  if (!state || state.win) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const x = +cell.dataset.x, y = +cell.dataset.y;
  if (x === state.player.x && y === state.player.y) return;
  const path = findPath(state, x, y);
  if (path && path.length) startAutoMove(path);
});

window.addEventListener('keydown', (e) => {
  // 分享弹窗打开时：Esc 关闭，Enter 开始
  if (!shareModal.classList.contains('hidden')) {
    if (e.key === 'Escape') { closeShareModal(); return; }
    if (e.key === 'Enter') { startSharedFromText(shareInput.value); return; }
    return;
  }

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
    if (state && state.win) {
      // 过关浮层：空格 / 回车直接进入下一关
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        nextLevel();
      }
      return;
    }

    const key = e.key;
    const move = KEY_MAP[key] || KEY_MAP[key.toLowerCase()];

    if (move) {
      e.preventDefault();
      doMove(move[0], move[1]);
      return;
    }
    if (key === 'f' || key === 'F') { doDrop(); return; }
    if (key === 'z' || key === 'Z') { doUndo(); return; }
    if (key === 'r' || key === 'R') { doReset(); }
  }
});

window.addEventListener('resize', () => {
  if (state) fitBoard();
});
window.addEventListener('orientationchange', () => {
  if (state) setTimeout(fitBoard, 60);
});

// ---- 触屏虚拟按键 ----
const touch = initTouchControls(document.getElementById('touch-controls'), {
  move: (dx, dy) => { doMove(dx, dy); },
  drop: doDrop,
  undo: doUndo,
  reset: doReset,
});
if (touch.active) {
  controlTipEl.textContent = '点击格子自动寻路 · 触屏按键操作';
}

// ---- 初始化 ----
renderLevelList();
if (!handleUrlShare()) showScreen('title');
