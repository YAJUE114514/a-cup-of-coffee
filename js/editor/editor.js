/**
 * editor.js
 * 地图编辑器 —— 画关卡 → 导出 JSON → 粘贴进 levels.js
 *
 * 复用 js/data/types.js 作为唯一事实来源，物品面板与游戏自动同步。
 * 格子分三层：地形(墙/地板) + 物品(7种) + 玩家起点。
 * 墙格不能放物品/玩家（否则物品永远捡不到）。
 */

import { TYPES, TYPE_INFO, WALL, FLOOR } from '../data/types.js';

// ---- DOM ----
const canvas = document.getElementById('canvas');
const metaId = document.getElementById('meta-id');
const metaName = document.getElementById('meta-name');
const metaLine = document.getElementById('meta-line');
const colsInput = document.getElementById('cols-input');
const rowsInput = document.getElementById('rows-input');
const handSelect = document.getElementById('hand-select');
const output = document.getElementById('output');
const warningsEl = document.getElementById('warnings');
const btnExport = document.getElementById('btn-export');
const btnCopy = document.getElementById('btn-copy');
const btnClear = document.getElementById('btn-clear');
const btnLoad = document.getElementById('btn-load');

// ---- 编辑器状态 ----
const editor = {
  cols: 8,
  rows: 6,
  grid: [],      // 'F' / 'W'
  itemGrid: [],  // null / type
  playerStart: null, // { x, y } 或 null
  hand: null,
  tool: 'floor',
};

// 工具清单
const TERRAIN_TOOLS = [
  { tool: 'floor', label: '地板', emoji: '▣' },
  { tool: 'wall',  label: '墙',   emoji: '▦' },
];
// 物品面板的第一个按钮：清空该格物品
const ERASE_ITEM_TOOL = { tool: 'none_item', label: '空', emoji: '✖️' };
const ITEM_TOOLS = [
  TYPES.BEANS, TYPES.CUP, TYPES.COFFEE,
  TYPES.TAG_BEANS, TYPES.TAG_CUP, TYPES.TAG_COFFEE, TYPES.TAG_TAG,
];
// 起手可选（不含 coffee：规则上咖啡不可携带）
const HOLDABLE = [
  { value: '', label: '空手' },
  { value: TYPES.BEANS, label: '咖啡豆' },
  { value: TYPES.CUP, label: '杯子' },
  { value: TYPES.TAG_BEANS, label: '标签·豆' },
  { value: TYPES.TAG_CUP, label: '标签·杯' },
  { value: TYPES.TAG_COFFEE, label: '标签·咖啡' },
  { value: TYPES.TAG_TAG, label: '标签·标签' },
];

// ---- 工具 ----
function makeGrid(cols, rows, fill) {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
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

  const hs = document.getElementById('hand-select');
  for (const h of HOLDABLE) {
    const opt = document.createElement('option');
    opt.value = h.value;
    opt.textContent = h.label;
    hs.appendChild(opt);
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
      cell.className = 'cell ' + (editor.grid[y][x] === WALL ? 'wall' : 'floor');
      cell.dataset.x = x;
      cell.dataset.y = y;

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
      break;
    case 'wall':
      editor.grid[y][x] = WALL;
      editor.itemGrid[y][x] = null; // 墙格不能放物品
      if (editor.playerStart && editor.playerStart.x === x && editor.playerStart.y === y) {
        editor.playerStart = null; // 玩家也不能进墙里
      }
      break;
    case 'player':
      if (editor.grid[y][x] === WALL) break; // 墙格不能放
      editor.playerStart = { x, y };
      break;
    case 'none_item': // 「空」：清除该格物品
      editor.itemGrid[y][x] = null;
      break;
    default: // 物品 type
      if (editor.grid[y][x] === WALL) break; // 墙格不能放
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

  if (!editor.playerStart) {
    renderWarnings(warnings);
    return; // 起点是硬性要求，缺了就不导出
  }

  const level = {
    id: metaId.value.trim() || 'level_01',
    name: metaName.value.trim() || '未命名关卡',
    hanaLine: metaLine.value.trim(),
    cols: editor.cols,
    rows: editor.rows,
    grid: editor.grid,
    player: {
      x: editor.playerStart.x,
      y: editor.playerStart.y,
      hand: editor.hand,
    },
    items: collectItems(),
  };

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
  const rows = level.grid.length;
  const cols = level.grid[0].length;
  if (cols < 4 || cols > 12 || rows < 4 || rows > 12) {
    alert(`❌ 尺寸 ${cols}×${rows} 超出 4~12 范围`);
    return;
  }

  editor.cols = cols;
  editor.rows = rows;
  editor.grid = level.grid.map(row => [...row]);
  editor.itemGrid = makeGrid(cols, rows, null);

  for (const it of (level.items || [])) {
    if (
      it && Number.isInteger(it.x) && Number.isInteger(it.y)
      && it.x >= 0 && it.x < cols && it.y >= 0 && it.y < rows
      && editor.grid[it.y][it.x] !== WALL
    ) {
      editor.itemGrid[it.y][it.x] = it.type;
    }
  }

  editor.playerStart = (level.player && Number.isInteger(level.player.x) && Number.isInteger(level.player.y))
    ? { x: level.player.x, y: level.player.y }
    : null;
  editor.hand = (level.player && level.player.hand) || null;

  metaId.value = level.id || '';
  metaName.value = level.name || '';
  metaLine.value = level.hanaLine || '';
  colsInput.value = cols;
  rowsInput.value = rows;
  handSelect.value = editor.hand ?? '';
  output.value = '';
  warningsEl.textContent = '';

  renderCanvas();
  flashBtn(btnLoad, '✅ 已加载');
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
  colsInput.addEventListener('change', resizeGrid);
  rowsInput.addEventListener('change', resizeGrid);

  btnExport.addEventListener('click', exportLevel);
  btnCopy.addEventListener('click', copyOutput);
  btnLoad.addEventListener('click', () => loadLevel(output.value));
  btnClear.addEventListener('click', () => {
    resetEditor();
    renderCanvas();
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
  colsInput.value = 8;
  rowsInput.value = 6;
  handSelect.value = '';
  output.value = '';
  warningsEl.textContent = '';
}

buildPalette();
resetEditor();
bindEvents();
renderCanvas();
