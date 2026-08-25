/**
 * touch.js
 * 触屏虚拟按键组件（方向键 + 放下/撤销/重置）。
 *
 * 触屏设备（pointer: coarse）自动显示，桌面自动隐藏。
 * 供主游戏与编辑器试玩模式复用：把要执行的回调传进来即可。
 *
 * 用法：
 *   initTouchControls(el, {
 *     move:  (dx, dy) => {},
 *     drop:  () => {},
 *     undo:  () => {},
 *     reset: () => {},
 *   });
 * 返回 { active }：active 为 true 表示当前是触屏设备（组件已显示）。
 */
export function initTouchControls(root, handlers) {
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  // 兜底：没有 matchMedia 或混合设备时，用触摸能力 + 窄屏判断
  const active = isCoarse || ('ontouchstart' in window && window.innerWidth < 1024);
  if (!active || !root) return { active: false, destroy() {} };

  root.classList.remove('hidden');

  function bindDir(btn) {
    const dx = +btn.dataset.dx, dy = +btn.dataset.dy;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handlers.move(dx, dy);
    });
    // 兜底防滚动 / 双击缩放（pointerdown 已 preventDefault，双保险）
    btn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  function bindAction(btn) {
    const act = btn.dataset.action;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (act === 'drop') handlers.drop();
      else if (act === 'undo') handlers.undo();
      else if (act === 'reset') handlers.reset();
    });
    btn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  root.querySelectorAll('.dpad .tbtn').forEach(bindDir);
  root.querySelectorAll('.actions .tbtn').forEach(bindAction);

  return {
    active: true,
    /** 卸载：隐藏并移除已绑定事件 */
    destroy() {
      root.classList.add('hidden');
      root.querySelectorAll('.tbtn').forEach(b => b.replaceWith(b.cloneNode(true)));
    },
  };
}
