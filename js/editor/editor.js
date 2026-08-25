/**
 * editor.js
 * 地图编辑器 —— 画关卡 → 导出 JSON → 粘贴进 levels.js
 *
 * 复用 js/data/types.js 作为唯一事实来源，物品面板与游戏自动同步。
 * 格子分三层：地形(墙/地板/压力板/机关门/检查门) + 物品(7种) + 玩家起点。
 * 墙/门等阻挡地形格不能放物品/玩家。
 */

import {
  TYPES, TYPE_INFO, WALL, FLOOR, PLATE, DOOR, GATE, TAG_REQUIRE,
} from '../data/types.js';
import { encodeLevel, decodeLevel, CODE_VER } from '../data/codec.js';
import { createGameState } from '../game/state.js';
import { step, drop, checkWin } from '../game/judge.js';
import { renderBoard, renderHand } from '../game/renderer.js';
import { initTouchControls } from '../game/touch.js';

// ---- DOM ----
const canvas = document.getElementById('canvas');
const metaId = document.getElementById('meta-id');
const metaName = document.getElementById('meta-name');
const metaLine = document.getElementById('meta-line');
const colsInput = document.getElementById('cols-input');
const rowsInput = document.getElementById('rows-input');
const handSelect = document.getElementById('hand-select');
const gateRequireSelect = document.getElementById('gate-require');
const output = document.getElementById('output');
const warningsEl = document.getElementById('warnings');
const btnCopyJson = document.getElementById('btn-copy-json');
const btnClear = document.getElementById('btn-clear');
const btnLoad = document.getElementById('btn-load');
const btnTest = document.getElementById('btn-test');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnShareLink = document.getElementById('btn-share-link');
const editorMeta = document.getElementById('editor-meta');
const editorWorkspace = document.getElementById('editor-workspace');
const editorExport = document.getElementById('editor-export');
const testMode = document.getElementById('test-mode');
const testBoard = document.getElementById('test-board');
const testHand = document.getElementById('test-hand');
const testHana = document.getElementById('test-hana');
const testExit = document.getElementById('test-exit');
const testReset = document.getElementById('test-reset');
const testTouch = document.getElementById('test-touch');

// ---- 编辑器状态 ----
const editor = {
  cols: 8,
  rows: 6,
  grid: [],           // 地形字符
  itemGrid: [],       // null / type
  playerStart: null,  // { x, y } 或 null
  hand: null,
  gateRequire: TYPES.BEANS, // 画检查门时用的要求物品
  gates: [],          // 检查门记录 [{x,y,require}]
  tool: 'floor',
};

// 地形工具
const TERRAIN_TOOLS = [
  { tool: 'floor', label: '地板',   emoji: '▣' },
  { tool: 'wall',  label: '墙',     emoji: '▦' },
  { tool: 'plate', label: '压力板', emoji: '⬤' },
  { tool: 'door',  label: '机关门', emoji: '🚪' },
  { tool: 'gate',  label: '检查门', emoji: '🔒' },
];
// 物品面板的第一个按钮：清空该格物品
const ERASE_ITEM_TOOL = { tool: 'none_item', label: '空', emoji: '✖️' };
const ITEM_TOOLS = [
  TYPES.BEANS, TYPES.CUP, TYPES.COFFEE,
  TYPES.TAG_BEANS, TYPES.TAG_CUP, TYPES.TAG_COFFEE, TYPES.TAG_TAG,
];
// 起手可选（不含 coffee：规则上咖啡不可携带）
const HOLDABLE = [
  { value: TYPES.BEANS, label: '咖啡豆' },
  { value: TYPES.CUP, label: '杯子' },
  { value: TYPES.TAG_BEANS, label: '标签·豆' },
  { value: TYPES.TAG_CUP, label: '标签·杯' },
  { value: TYPES.TAG_COFFEE, label: '标签·咖啡' },
  { value: TYPES.TAG_TAG, label: '标签·标签' },
];
const HAND_OPTIONS = [{ value: '', label: '空手' }, ...HOLDABLE];
// 检查门要求：具体物品 + 「任意标签」通配
const GATE_REQUIRE_OPTIONS = [
  ...HOLDABLE,
  { value: TAG_REQUIRE, label: '标签·任意' },
];

// ---- 工具 ----
function makeGrid(cols, rows, fill) {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

/** 清掉某格的物品 / 玩家 / 检查门记录（画阻挡地形时用） */
function clearCellExtra(x, y) {
  editor.itemGrid[y][x] = null;
  if (editor.playerStart && editor.playerStart.x === x && editor.playerStart.y === y) {
    editor.playerStart = null;
  }
  editor.gates = editor.gates.filter(g => !(g.x === x && g.y === y));
}

// ---- 工具面板 ----
function buildPalette() {
  const terrainEl = document.getElementById('tools-terrain');
  for (const t of TERRAIN_TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = t.tool;
    b.className = 'tool-btn';
    b.innerHTML = `<span class="tool-emoji">${t.emoji}</span>${t.label}`;
    b.addEventListener('click', () => selectTool(t.tool));
    terrainEl.appendChild(b);
  }

  const itemEl = document.getElementById('tools-item');

  // 「空」：擦除该格物品（保留地形）
  {
    const eb = document.createElement('button');
    eb.type = 'button';
    eb.dataset.tool = ERASE_ITEM_TOOL.tool;
    eb.className = 'tool-btn';
    eb.innerHTML = `<span class="tool-emoji">${ERASE_ITEM_TOOL.emoji}</span>${ERASE_ITEM_TOOL.label}`;
    eb.addEventListener('click', () => selectTool(ERASE_ITEM_TOOL.tool));
    itemEl.appendChild(eb);
  }

  for (const type of ITEM_TOOLS) {
    const info = TYPE_INFO[type];
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = type;
    b.className = 'tool-btn';
    b.innerHTML = `<span class="tool-emoji">${info.emoji}</span>${info.label}`;
    b.addEventListener('click', () => selectTool(type));
    itemEl.appendChild(b);
  }

  const playerEl = document.getElementById('tools-player');
  const pb = document.createElement('button');
  pb.type = 'button';
  pb.dataset.tool = 'player';
  pb.className = 'tool-btn';
  pb.innerHTML = `<span class="tool-emoji">🐳</span>起点`;
  pb.addEventListener('click', () => selectTool('player'));
  playerEl.appendChild(pb);

  // 起手下拉
  const hs = document.getElementById('hand-select');
  for (const h of HAND_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = h.value;
    opt.textContent = h.label;
    hs.appendChild(opt);
  }

  // 检查门要求下拉
  const gs = document.getElementById('gate-require');
  for (const h of GATE_REQUIRE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = h.value;
    opt.textContent = h.label;
    gs.appendChild(opt);
  }
}

function selectTool(tool) {
  editor.tool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });
}

// ---- 画布 ----
function renderCanvas() {
  canvas.innerHTML = '';
  canvas.style.gridTemplateColumns = `repeat(${editor.cols}, var(--cell-size))`;

  for (let y = 0; y < editor.rows; y++) {
    for (let x = 0; x < editor.cols; x++) {
      const cell = document.createElement('div');
      const t = editor.grid[y][x];
      let cls = 'cell floor';
      if (t === WALL) cls = 'cell wall';
      else if (t === PLATE) cls = 'cell plate';
      else if (t === DOOR) cls = 'cell door';
      else if (t === GATE) cls = 'cell gate';
      cell.className = cls;
      cell.dataset.x = x;
      cell.dataset.y = y;

      // 地形标识
      if (t === PLATE) {
        const d = document.createElement('span');
        d.className = 'plate-dot';
        cell.appendChild(d);
      } else if (t === DOOR) {
        const ic = document.createElement('span');
        ic.className = 'door-icon';
        ic.textContent = '🚪';
        cell.appendChild(ic);
      } else if (t === GATE) {
        const gate = editor.gates.find(g => g.x === x && g.y === y);
        const isAny = gate && gate.require === TAG_REQUIRE;
        const info = TYPE_INFO[isAny ? TYPES.TAG_TAG : (gate ? gate.require : TYPES.BEANS)];
        const req = document.createElement('span');
        req.className = 'gate-req-editor';
        req.textContent = isAny ? '🏷️' : info.emoji;
        req.title = isAny ? '任意标签' : info.label;
        cell.appendChild(req);
        const lk = document.createElement('span');
        lk.className = 'gate-lock';
        lk.textContent = '🔒';
        cell.appendChild(lk);
      }

      const itemType = editor.itemGrid[y][x];
      if (itemType) {
        const info = TYPE_INFO[itemType];
        const el = document.createElement('span');
        el.className = 'item';
        el.textContent = info.emoji;
        el.title = info.label;
        cell.appendChild(el);
      }

      if (editor.playerStart && editor.playerStart.x === x && editor.playerStart.y === y) {
        const p = document.createElement('span');
        p.className = 'player';
        p.textContent = '🐳';
        cell.appendChild(p);
      }

      canvas.appendChild(cell);
    }
  }
}

function paintCell(x, y) {
  if (x < 0 || y < 0 || x >= editor.cols || y >= editor.rows) return;
  const tool = editor.tool;

  switch (tool) {
    case 'floor':
      editor.grid[y][x] = FLOOR;
      clearCellExtra(x, y);
      break;
    case 'wall':
      editor.grid[y][x] = WALL;
      clearCellExtra(x, y);
      break;
    case 'plate':
      editor.grid[y][x] = PLATE;
      clearCellExtra(x, y);
      break;
    case 'door':
      editor.grid[y][x] = DOOR;
      clearCellExtra(x, y);
      break;
    case 'gate':
      editor.grid[y][x] = GATE;
      clearCellExtra(x, y);
      editor.gates.push({ x, y, require: editor.gateRequire });
      break;
    case 'player':
      if (editor.grid[y][x] === WALL || editor.grid[y][x] === DOOR || editor.grid[y][x] === GATE) break;
      editor.playerStart = { x, y };
      break;
    case 'none_item': // 「空」：清除该格物品
      editor.itemGrid[y][x] = null;
      break;
    default: // 物品 type
      if (editor.grid[y][x] === WALL || editor.grid[y][x] === DOOR || editor.grid[y][x] === GATE) break;
      editor.itemGrid[y][x] = tool;
      break;
  }
  renderCanvas();
}

// ---- 网格尺寸 ----
function resizeGrid() {
  const cols = clampInt(colsInput.value, 4, 12, 8);
  const rows = clampInt(rowsInput.value, 4, 12, 6);
  colsInput.value = cols;
  rowsInput.value = rows;

  const newGrid = makeGrid(cols, rows, FLOOR);
  const newItem = makeGrid(cols, rows, null);
  for (let y = 0; y < Math.min(rows, editor.rows); y++) {
    for (let x = 0; x < Math.min(cols, editor.cols); x++) {
      newGrid[y][x] = editor.grid[y][x];
      newItem[y][x] = editor.itemGrid[y][x];
    }
  }
  editor.cols = cols;
  editor.rows = rows;
  editor.grid = newGrid;
  editor.itemGrid = newItem;

  if (editor.playerStart && (editor.playerStart.x >= cols || editor.playerStart.y >= rows)) {
    editor.playerStart = null;
  }
  editor.gates = editor.gates.filter(g => g.x < cols && g.y < rows);
  renderCanvas();
}

function clampInt(val, min, max, fallback) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---- 导出 / 加载 ----
function collectItems() {
  const items = [];
  for (let y = 0; y < editor.rows; y++) {
    for (let x = 0; x < editor.cols; x++) {
      const t = editor.itemGrid[y][x];
      if (t) items.push({ type: t, x, y });
    }
  }
  return items;
}

/**
 * 把关卡对象编码为紧凑分享 Code（编解码逻辑统一在 js/data/codec.js）。
 * 无玩家起点返回 null。
 */
function encodeCode() {
  const level = buildLevelObject();
  if (!level) return null;
  return encodeLevel(level);
}

/** 由编辑器状态组装关卡对象（深拷贝 grid）；无起点返回 null */
function buildLevelObject() {
  if (!editor.playerStart) return null;
  const level = {
    id: metaId.value.trim() || 'level_01',
    name: metaName.value.trim() || '未命名关卡',
    hanaLine: metaLine.value.trim(),
    cols: editor.cols,
    rows: editor.rows,
    grid: editor.grid.map(r => [...r]),
    player: {
      x: editor.playerStart.x,
      y: editor.playerStart.y,
      hand: editor.hand,
    },
    items: collectItems(),
  };
  if (editor.gates.length) {
    level.gates = editor.gates.map(g => ({ ...g }));
  }
  return level;
}

/**
 * 生成 JSON 并写入文本框 + 复制到剪贴板
 * （合并原「导出 JSON」与「复制」；无玩家起点时只提示，不复制）。
 */
function copyJson() {
  const warnings = [];

  if (!editor.playerStart) {
    warnings.push('❌ 未设置玩家起点：请先用「🐳 起点」在格子上放一只 hana');
  }
  if (collectItems().length === 0) {
    warnings.push('⚠️ 地图上还没有任何物品');
  }
  if (editor.playerStart) {
    const startItem = editor.itemGrid[editor.playerStart.y][editor.playerStart.x];
    if (startItem) {
      warnings.push(`ℹ️ 玩家起点上有个「${TYPE_INFO[startItem].label}」，开局会站在它上面`);
    }
  }
  renderWarnings(warnings);

  const level = buildLevelObject();
  if (!level) return; // 起点是硬性要求，缺了就不复制

  const json = JSON.stringify(level, null, 2);
  output.value = json;
  copyText(json, btnCopyJson, '✅ 已复制 JSON');
}

function renderWarnings(list) {
  warningsEl.innerHTML = '';
  for (const w of list) {
    const div = document.createElement('div');
    div.className = 'warning';
    div.textContent = w;
    warningsEl.appendChild(div);
  }
}

/** 把关卡对象填充进编辑器（loadLevel / 导入 Code 共用） */
function applyLevel(level) {
  const rows = level.grid.length;
  const cols = level.grid[0].length;
  if (cols < 4 || cols > 12 || rows < 4 || rows > 12) {
    alert(`❌ 尺寸 ${cols}×${rows} 超出 4~12 范围`);
    return false;
  }

  editor.cols = cols;
  editor.rows = rows;
  editor.grid = level.grid.map(row => [...row]);
  editor.itemGrid = makeGrid(cols, rows, null);

  for (const it of (level.items || [])) {
    if (
      it && Number.isInteger(it.x) && Number.isInteger(it.y)
      && it.x >= 0 && it.x < cols && it.y >= 0 && it.y < rows
      && (editor.grid[it.y][it.x] === FLOOR || editor.grid[it.y][it.x] === PLATE)
    ) {
      editor.itemGrid[it.y][it.x] = it.type;
    }
  }

  editor.playerStart = (level.player && Number.isInteger(level.player.x) && Number.isInteger(level.player.y))
    ? { x: level.player.x, y: level.player.y }
    : null;
  editor.hand = (level.player && level.player.hand) || null;

  // 检查门记录
  editor.gates = (level.gates || [])
    .filter(g => Number.isInteger(g.x) && Number.isInteger(g.y) && g.x >= 0 && g.x < cols && g.y >= 0 && g.y < rows)
    .map(g => ({ x: g.x, y: g.y, require: g.require || TYPES.BEANS }));
  if (editor.gates.length) {
    editor.gateRequire = editor.gates[0].require;
  }

  metaId.value = level.id || '';
  metaName.value = level.name || '';
  metaLine.value = level.hanaLine || '';
  colsInput.value = cols;
  rowsInput.value = rows;
  handSelect.value = editor.hand ?? '';
  gateRequireSelect.value = editor.gateRequire;
  output.value = '';
  warningsEl.textContent = '';

  renderCanvas();
  return true;
}

function loadLevel(text) {
  let level;
  try {
    level = JSON.parse(text);
  } catch {
    alert('❌ JSON 解析失败，请检查格式');
    return;
  }
  if (!level || !Array.isArray(level.grid) || !level.grid.length || !Array.isArray(level.grid[0])) {
    alert('❌ 缺少 grid 字段');
    return;
  }
  applyLevel(level);
  flashBtn(btnLoad, '✅ 已加载');
}

/** 自动识别文本框内容：关卡 Code 或 JSON，统一走「加载」接口 */
function loadFromText(text) {
  const t = text.trim();
  if (!t) return;
  if (t.startsWith(CODE_VER + '|')) {
    try {
      const level = decodeLevel(t);
      if (!applyLevel(level)) return;
      flashBtn(btnLoad, '✅ 已加载');
    } catch (err) {
      alert('❌ Code 无效：' + err.message);
    }
  } else {
    loadLevel(t);
  }
}

/** 复制当前关卡为紧凑 Code（同时显示到文本框，与 JSON 导出一致） */
function copyCode() {
  const code = encodeCode();
  if (!code) {
    alert('❌ 请先设置玩家起点，才能生成 Code');
    return;
  }
  output.value = code;
  copyText(code, btnCopyCode, '✅ 已复制 Code');
}

/**
 * 生成并复制「游戏内可直接游玩的分享链接」。
 * 链接格式：index.html?play=<Code>&name=<关卡名>&line=<hana台词>
 */
async function shareLink() {
  const code = encodeCode();
  if (!code) {
    alert('❌ 请先设置玩家起点，才能生成分享链接');
    return;
  }
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, 'index.html'); // editor.html -> index.html
  url.search = '';
  url.searchParams.set('play', code);
  if (metaName.value.trim()) url.searchParams.set('name', metaName.value.trim());
  if (metaLine.value.trim()) url.searchParams.set('line', metaLine.value.trim());
  copyText(url.toString(), btnShareLink, '✅ 链接已复制');
}

function copyText(text, btn, msg) {
  try {
    navigator.clipboard.writeText(text).then(() => flashBtn(btn, msg));
  } catch {
    output.value = text;
    output.select();
    document.execCommand('copy');
    output.setSelectionRange(0, 0);
    flashBtn(btn, msg);
  }
}

// ---- 试玩模式（自己画自己玩）----
let testState = null;
let testHistory = []; // 试玩撤销栈

const TEST_KEYS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

function enterTest() {
  const level = buildLevelObject();
  if (!level) {
    alert('❌ 请先用「🐳 起点」在格子上放一只 hana，才能试玩');
    return;
  }
  testState = createGameState(level);
  testHistory = [];
  editorMeta.classList.add('hidden');
  editorWorkspace.classList.add('hidden');
  editorExport.classList.add('hidden');
  testMode.classList.remove('hidden');
  renderTest();
}

function renderTest() {
  renderBoard(testBoard, testState);
  renderHand(testHand, testState);
  if (testState.win) {
    testHana.textContent = '☕ 通关！按 Esc 返回编辑继续调整';
    testHana.classList.remove('hidden');
  } else {
    testHana.classList.add('hidden');
  }
}

function exitTest() {
  testMode.classList.add('hidden');
  editorMeta.classList.remove('hidden');
  editorWorkspace.classList.remove('hidden');
  editorExport.classList.remove('hidden');
  testHana.classList.add('hidden');
  testState = null;
}

function resetTest() {
  const level = buildLevelObject();
  if (level) {
    testState = createGameState(level);
    testHistory = [];
    testHana.classList.add('hidden');
    renderTest();
  }
}

function testPush(snap) {
  if (testHistory.length >= 100) testHistory.shift();
  testHistory.push(snap);
}

function handleTestMove(dx, dy) {
  if (!testState || testState.win) return;
  const snap = JSON.parse(JSON.stringify(testState));
  if (dx < 0) testState.player.facing = 'left';
  else if (dx > 0) testState.player.facing = 'right';
  const r = step(testState, dx, dy);
  if (r.action !== 'blocked') testPush(snap);
  if (checkWin(testState)) testState.win = true;
  renderTest();
}

function handleTestDrop() {
  if (!testState || testState.win) return;
  const snap = JSON.parse(JSON.stringify(testState));
  const r = drop(testState);
  if (r.action === 'drop') testPush(snap);
  renderTest();
}

function handleTestUndo() {
  if (!testState || testState.win) return;
  if (testHistory.length) {
    testState = testHistory.pop();
    testHana.classList.add('hidden');
    renderTest();
  }
}

function handleTestKey(e) {
  if (!testState) return;
  if (testState.win) {
    if (e.key === 'Escape') { e.preventDefault(); exitTest(); }
    return;
  }
  const key = e.key;
  if (key === 'Escape') { e.preventDefault(); exitTest(); return; }
  if (key === 'r' || key === 'R') { resetTest(); return; }
  if (key === 'z' || key === 'Z') { handleTestUndo(); return; }
  if (key === 'f' || key === 'F') { handleTestDrop(); return; }

  const move = TEST_KEYS[key] || TEST_KEYS[key.toLowerCase()];
  if (move) {
    e.preventDefault();
    handleTestMove(move[0], move[1]);
  }
}

function flashBtn(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 1200);
}

// ---- 事件 ----
let painting = false;

function bindEvents() {
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    painting = true;
    paintFromEvent(e);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (painting) paintFromEvent(e);
  });
  window.addEventListener('mouseup', () => { painting = false; });

  handSelect.addEventListener('change', () => {
    editor.hand = handSelect.value || null;
  });
  gateRequireSelect.addEventListener('change', () => {
    editor.gateRequire = gateRequireSelect.value;
  });
  colsInput.addEventListener('change', resizeGrid);
  rowsInput.addEventListener('change', resizeGrid);

  btnCopyJson.addEventListener('click', copyJson);
  btnLoad.addEventListener('click', () => loadFromText(output.value));
  btnCopyCode.addEventListener('click', copyCode);
  btnShareLink.addEventListener('click', shareLink);
  btnClear.addEventListener('click', () => {
    resetEditor();
    renderCanvas();
  });

  // 试玩模式
  btnTest.addEventListener('click', enterTest);
  testExit.addEventListener('click', exitTest);
  testReset.addEventListener('click', resetTest);
  window.addEventListener('keydown', (e) => {
    if (!testMode.classList.contains('hidden')) handleTestKey(e);
  });

  // 试玩触屏虚拟按键（触屏设备才显示）
  initTouchControls(testTouch, {
    move: handleTestMove,
    drop: handleTestDrop,
    undo: handleTestUndo,
    reset: resetTest,
  });
}

function paintFromEvent(e) {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  paintCell(+cell.dataset.x, +cell.dataset.y);
}

// ---- 启动 ----
function resetEditor() {
  editor.cols = 8;
  editor.rows = 6;
  editor.grid = makeGrid(8, 6, FLOOR);
  editor.itemGrid = makeGrid(8, 6, null);
  editor.playerStart = null;
  editor.hand = null;
  editor.gateRequire = TYPES.BEANS;
  editor.gates = [];
  colsInput.value = 8;
  rowsInput.value = 6;
  handSelect.value = '';
  gateRequireSelect.value = TYPES.BEANS;
  output.value = '';
  warningsEl.textContent = '';
}

buildPalette();
resetEditor();
bindEvents();
renderCanvas();
