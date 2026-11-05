/* ═══════════════════════════════════════════════════════════════════════
 * pmcraft 原型状态演示入口 · 运行时（demo-panel-runtime.js）
 * ----------------------------------------------------------------------
 * 由「状态演示入口生成」步骤复制到 prototype/working/ 根目录，页面 head
 * 注入 <script src="../demo-panel-runtime.js"> 引用（须在 demo/{page}.js
 * 之后加载，读取 window.PM_DEMO_DATA）。
 *
 * 核心设计：
 * - 演示 DOM 零静态存在——开关/面板/气泡全部运行时注入
 *   → check-quality 现有静态检查天然不可见、零误报
 * - 数据源 window.PM_DEMO_DATA（demo/{page}.js）：build 流水线派生自
 *   标注层 state 项（annotations/{page}.js），extend-html 存量页派生自
 *   page-inventory「状态」字段——运行时只认 PM_DEMO_DATA，单一数据源
 * - 默认隐藏：页面加载只注入右下角开关，开启才建面板
 * - 切换机制：运行时注入 <style id="pm-demo-style"> 规则
 *   [data-pm-demo="S{n}"] {锚点} { display:block/none !important; }，
 *   body 挂 data-pm-demo 属性——!important 压制页面脚本 inline display
 *   覆盖（页面自带状态机 timer 等），还原统一 location.reload()（JS
 *   驱动页面无法靠记录初始 display 可靠还原）
 * - 面板开合与状态解耦：关面板只移除列表（styleEl/data-pm-demo 保留，
 *   页面停留在所选状态），重开面板恢复选中高亮；复位仅由「还原默认态」
 *   按钮触发（location.reload()）——关掉不再回到默认态
 * - 点击面板外任意处（页面内容/空白）默认收起面板（与开关收起同行为，
 *   状态保留）；开关、面板内、演示气泡与标注层元素不触发收起
 * - 祖先豁免：目标锚点祖先链上的 state 锚点不隐藏（嵌套状态块场景）
 * - 页面级锚点（anchor:"page"）仅展示文案，不做 display 切换
 * - 与标注层并存：开关垂直堆叠（CSS），点击互不干扰；annotations
 *   runtime 的 topRealHit 跳过列表已含 .pm-demo-toggle/.pm-demo-panel
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DATA = window.PM_DEMO_DATA || { items: [] };
  var items = (DATA.items || []).filter(function (i) { return i && i.label; });
  var ON = false, panel = null, bubble = null, toggleBtn = null, styleEl = null, activeIdx = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── 锚点解析（'page' 返回 null——页面级不参与 display 切换） ──────── */
  function resolveAnchor(a) {
    if (!a || a === 'page') return null;
    try { return document.querySelector(a); } catch (e) { return null; }
  }

  /* ── 开关 ─────────────────────────────────────────────────────────── */
  function ensureToggle() {
    if (document.getElementById('pm-demo-toggle')) return;
    var b = document.createElement('button');
    b.id = 'pm-demo-toggle';
    b.className = 'pm-demo-toggle';
    if (!document.querySelector('.pm-anno-toggle')) b.classList.add('pm-demo-standalone');
    b.setAttribute('aria-label', '原型状态演示开关');
    b.textContent = '演示';
    b.addEventListener('click', function () { setOn(!ON); });
    document.body.appendChild(b);
    toggleBtn = b;
  }
  function setOn(v) {
    ON = v;
    if (ON) {
      ensurePanel();
      panel.style.display = 'block';
      /* 重开面板恢复上次选中的高亮（状态本身由 data-pm-demo/styleEl 持续生效） */
      if (activeIdx != null) {
        var els = panel.querySelectorAll('.pm-demo-item');
        for (var k = 0; k < els.length; k++) {
          els[k].classList.toggle('active', els[k].getAttribute('data-idx') === String(activeIdx));
        }
      }
    } else {
      if (panel) { panel.remove(); panel = null; }
      closeBubble();
      /* 关面板不清状态：styleEl 与 data-pm-demo 保留，页面停留在所选状态，
         不再「关掉回到默认态」；要复位请重开面板点「还原默认态」 */
    }
    toggleBtn.textContent = ON ? '演示 ✓' : (activeIdx != null ? '演示 · ' + items[activeIdx].label : '演示');
    toggleBtn.classList.toggle('on', ON);
  }

  /* ── 切换 ───────────────────────────────────────────────────────────
   * 运行时注入样式规则：目标锚点显示（!important）、非目标锚点隐藏
   * （祖先豁免 + page 级跳过 + 锚点失效跳过）。styleEl 置空时清除上次
   * 规则——同一 style 元素重写 textContent 即完成状态切换 */
  function applyState(idx) {
    var item = items[idx];
    activeIdx = idx; /* 记住选中项，跨面板开合保持 */
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'pm-demo-style';
      document.head.appendChild(styleEl);
    }
    var rules = [];
    if (item.anchor && item.anchor !== 'page') {
      var targetEl = resolveAnchor(item.anchor);
      rules.push('[data-pm-demo="' + item.label + '"] ' + item.anchor + ' { display: block !important; }');
      items.forEach(function (other, i) {
        if (i === idx || other.anchor === item.anchor || !other.anchor || other.anchor === 'page') return;
        var otherEl = resolveAnchor(other.anchor);
        if (!otherEl) return; /* 锚点失效 → 跳过，不生成规则 */
        if (targetEl && otherEl.contains(targetEl)) return; /* 祖先豁免：不隐藏目标祖先链上的状态锚点 */
        rules.push('[data-pm-demo="' + item.label + '"] ' + other.anchor + ' { display: none !important; }');
      });
    }
    styleEl.textContent = rules.join('\n');
    document.body.setAttribute('data-pm-demo', item.label);

    var els = panel.querySelectorAll('.pm-demo-item');
    for (var k = 0; k < els.length; k++) {
      els[k].classList.toggle('active', els[k].getAttribute('data-idx') === String(idx));
    }
    showBubble(item);

    var el = resolveAnchor(item.anchor);
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }

  function restore() { location.reload(); }

  /* ── 面板 ─────────────────────────────────────────────────────────── */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'pm-demo-panel';
    var h = '<div class="pm-demo-panel-head">状态演示</div>';
    if (items.length === 0) {
      h += '<div class="pm-demo-empty">本页暂无状态演示</div>';
    } else {
      items.forEach(function (item, i) {
        h += '<div class="pm-demo-item" data-idx="' + i + '"><span class="pm-demo-item-label">' + esc(item.label) + '</span>' + esc(item.title) + '</div>';
      });
    }
    h += '<button class="pm-demo-restore" type="button">还原默认态</button>';
    panel.innerHTML = h;
    document.body.appendChild(panel);
    panel.querySelectorAll('.pm-demo-item').forEach(function (el, i) {
      el.addEventListener('click', function (ev) { ev.stopPropagation(); applyState(+el.getAttribute('data-idx')); });
    });
    var rst = panel.querySelector('.pm-demo-restore');
    if (rst) rst.addEventListener('click', function (ev) { ev.stopPropagation(); restore(); });
    return panel;
  }

  /* ── 气泡（触发条件/UI 表现/用户操作） ───────────────────────────────
   * 定位避开演示面板：优先面板左缘左侧（垂直与面板顶部对齐）；
   * 左侧空间不足（窄视口/面板占宽）→ 移视口顶部（面板在底部，
   * 顶部与底部不重叠）。z-index 与面板同级，避免半叠观感。 */
  function showBubble(item) {
    closeBubble();
    bubble = document.createElement('div');
    bubble.className = 'pm-demo-bubble';
    var h = '<div class="pm-demo-b-head">' + esc(item.label) + ' · ' + esc(item.title) + '</div>';
    if (item.text) h += '<div class="pm-demo-b-text">' + esc(item.text) + '</div>';
    if (!item.anchor || item.anchor === 'page') h += '<div class="pm-demo-b-note">本状态无元素承载（页面级），仅展示说明文案</div>';
    bubble.innerHTML = h;
    document.body.appendChild(bubble);
    var bw = 280;
    var panelEl = document.querySelector('.pm-demo-panel');
    var pr = panelEl ? panelEl.getBoundingClientRect() : null;
    var left, top;
    if (pr && pr.left - bw - 8 >= 8) {
      /* 面板左侧有空间 → 气泡贴面板左缘，垂直与面板顶部对齐 */
      left = pr.left - bw - 8;
      top = Math.max(8, Math.min(pr.top, window.innerHeight - bubble.offsetHeight - 8));
    } else {
      /* 左侧不足 → 视口顶部（面板在底部，垂直分离不重叠） */
      left = 8;
      top = 8;
    }
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }
  function closeBubble() {
    if (bubble) { bubble.remove(); bubble = null; }
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (bubble && !bubble.contains(t) &&
        !t.classList.contains('pm-demo-toggle') &&
        !t.classList.contains('pm-demo-item')) closeBubble();
    /* 点击面板外任意处（页面内容/空白）→ 默认收起面板，状态保留；
       开关、面板内、演示气泡、标注层元素（徽章/气泡/开关）不触发收起 */
    if (ON && panel && !panel.contains(t) &&
        !t.closest('#pm-demo-toggle') &&
        !(bubble && bubble.contains(t)) &&
        !t.closest('.pm-anno-dot, .pm-anno-toggle, .pm-anno-bubble')) {
      setOn(false);
    }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { closeBubble(); if (ON) setOn(false); } });

  /* ── 初始化 ───────────────────────────────────────────────────────── */
  function init() { ensureToggle(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
