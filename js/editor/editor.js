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
import { createGameState } from '../game/state.js';
import { step, drop, checkWin } from '../game/judge.js';
import { renderBoard, renderHand } from '../game/renderer.js';

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
const btnExport = document.getElementById('btn-export');
const btnCopy = document.getElementById('btn-copy');
const btnClear = document.getElementById('btn-clear');
const btnLoad = document.getElementById('btn-load');
const btnTest = document.getElementById('btn-test');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnLoadCode = document.getElementById('btn-load-code');
const editorMeta = document.getElementById('editor-meta');
const editorWorkspace = document.getElementById('editor-workspace');
const editorExport = document.getElementById('editor-export');
const testMode = document.getElementById('test-mode');
const testBoard = document.getElementById('test-board');
const testHand = document.getElementById('test-hand');
const testHana = document.getElementById('test-hana');
const testExit = document.getElementById('test-exit');
const testReset = document.getElementById('test-reset');

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

// ---- 关卡 Code 编解码（紧凑分享格式 v2）----
const CODE_VER = 'v2';
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

// v2 网格字符分类：
//   地形单字符：W 墙 / F 地板 / D 机关门（P、G 有双字符组合，单独处理）
//   物品单字符：b 豆 / c 杯 / C 咖啡 / 1~4 tag（表示「地板 + 物品」）
//   双字符组合：P<字母> = 压力板+物品；G<字母> = 检查门 + 要求物品
const TERRAIN_SINGLE = 'WFD';
const ITEM_SINGLE = 'bcC1234';

/**
 * 把当前关卡编码为紧凑字符串：
 *   v2|{cols}x{rows}|{grid}|{player}
 *  - grid：每格一字符，物品/检查门直接合并进网格（P<物品>、G<要求>）
 *  - player：3 字符（坐标x + 坐标y + 起手码，空手为 '.'）
 */
function encodeCode() {
  const level = buildLevelObject();
  if (!level) return null;
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
function decodeCode(code) {
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

  return { id: 'shared', name: '分享关卡', hanaLine: '', cols, rows, grid, player: { x: px, y: py, hand }, items, gates };
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

function exportLevel() {
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

  const level = buildLevelObject();
  if (!level) {
    renderWarnings(warnings);
    return; // 起点是硬性要求，缺了就不导出
  }

  output.value = JSON.stringify(level, null, 2);
  renderWarnings(warnings);
  flashBtn(btnExport, '✅ 已导出');
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

/** 复制当前关卡为紧凑 Code */
function copyCode() {
  const code = encodeCode();
  if (!code) {
    alert('❌ 请先设置玩家起点，才能生成 Code');
    return;
  }
  copyText(code, btnCopyCode, '✅ 已复制 Code');
}

/** 从剪贴板导入关卡 Code */
async function importCode() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    text = prompt('请粘贴关卡 Code：');
  }
  if (!text) return;
  try {
    const level = decodeCode(text.trim());
    if (!applyLevel(level)) return;
    flashBtn(btnLoadCode, '✅ 已导入');
  } catch (err) {
    alert('❌ Code 无效：' + err.message);
  }
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

function handleTestKey(e) {
  if (!testState) return;
  if (testState.win) {
    if (e.key === 'Escape') { e.preventDefault(); exitTest(); }
    return;
  }
  const key = e.key;
  if (key === 'Escape') { e.preventDefault(); exitTest(); return; }
  if (key === 'r' || key === 'R') { resetTest(); return; }
  if (key === 'z' || key === 'Z') { // 撤销一步
    if (testHistory.length) {
      testState = testHistory.pop();
      testHana.classList.add('hidden');
      renderTest();
    }
    return;
  }
  if (key === 'f' || key === 'F') {
    const snap = JSON.parse(JSON.stringify(testState));
    const r = drop(testState);
    if (r.action === 'drop') { testHistory.push(snap); if (testHistory.length > 100) testHistory.shift(); }
    renderTest();
    return;
  }

  const move = TEST_KEYS[key] || TEST_KEYS[key.toLowerCase()];
  if (move) {
    e.preventDefault();
    const snap = JSON.parse(JSON.stringify(testState));
    if (move[0] < 0) testState.player.facing = 'left';
    else if (move[0] > 0) testState.player.facing = 'right';
    const r = step(testState, move[0], move[1]);
    if (r.action !== 'blocked') { testHistory.push(snap); if (testHistory.length > 100) testHistory.shift(); }
    if (checkWin(testState)) testState.win = true;
    renderTest();
  }
}

async function copyOutput() {
  if (!output.value) return;
  try {
    await navigator.clipboard.writeText(output.value);
  } catch {
    output.select();
    document.execCommand('copy');
    output.setSelectionRange(0, 0);
  }
  flashBtn(btnCopy, '✅ 已复制');
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

  btnExport.addEventListener('click', exportLevel);
  btnCopy.addEventListener('click', copyOutput);
  btnLoad.addEventListener('click', () => loadLevel(output.value));
  btnCopyCode.addEventListener('click', copyCode);
  btnLoadCode.addEventListener('click', importCode);
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
