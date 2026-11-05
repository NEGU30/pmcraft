/* ═══════════════════════════════════════════════════════════════════════
 * pmcraft 原型标注层 · 运行时（annotations-runtime.js）
 * ----------------------------------------------------------------------
 * 由 annotate-prototype 复制到 prototype/working/ 根目录，页面 head 注入
 * <script src="../annotations-runtime.js"> 引用（须在 annotations/{page}.js
 * 之后加载，读取 window.PM_ANNOTATIONS_DATA）。
 *
 * 核心设计：
 * - 标注 DOM 零静态存在——徽章/气泡/叠加层全部运行时注入
 *   → check-quality 现有静态检查天然不可见、零误报
 * - 默认隐藏：页面加载只注入右下角「规则和状态标注」「流程标注」两个开关
 *   （各自独立开合、可同时开启；同开即全量标注），任一开启才建 overlay
 * - 全部关闭时移除 overlay（零残留）；不记忆开关状态（刷新恢复关闭）
 * - 定位用 viewport 坐标 + position:fixed（手机壳 overflow 裁剪不到）
 * - 防重叠 + 对齐列排布（垂直优先 → 列满右开新列 → 右缘贴边<40px 改左列
 *   → 窄视口<480px 贴右缘单列 → 页面级锚点固定左上）
 * - 同锚聚合：同一锚点多条标注合并为数字徽章，点击展开列表再点选详情
 * - 状态刷新：scroll(capture)/resize/MutationObserver → rAF 去抖 150ms
 * - 可见性判定：0×0 / visibility / opacity + elementsFromPoint 遮挡检测
 *   （跳过 pm-anno 层取真实遮挡物；弹窗浮层覆盖锚点时徽章随之隐藏，
 *   page 级锚点随遮罩弹窗一并隐藏，气泡开启不再复活已隐藏徽章）
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DATA = window.PM_ANNOTATIONS_DATA || { items: [] };
  var mode = { rs: false, flow: false }, overlay = null, toggleBtn = null, bubble = null;
  var dots = {}, watchersOn = false, rAFId = 0, observer = null;
  var LABELS = { rs: '规则和状态标注', flow: '流程标注' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── steps 双形态归一化（v1 字符串 / v2 {text, anchor?} 对象） ──────── */
  function stepText(s) { return typeof s === 'string' ? s : (s && s.text) || ''; }
  function stepAnchor(s) { return (typeof s === 'object' && s && s.anchor) || ''; }

  /* ── 开关（两组独立：规则/状态 + 流程，可同时开启） ──────────────── */
  function ensureToggle() {
    if (toggleBtn) return;
    function make(id, key, top) {
      var b = document.createElement('button');
      b.id = id;
      b.className = 'pm-anno-toggle' + (top ? ' pm-anno-toggle-top' : '');
      b.setAttribute('aria-label', LABELS[key] + '开关');
      b.textContent = LABELS[key];
      b.addEventListener('click', function () { setGroup(key); });
      document.body.appendChild(b);
      return b;
    }
    toggleBtn = {
      rs: make('pm-anno-rs-toggle', 'rs', false),
      flow: make('pm-anno-flow-toggle', 'flow', true)
    };
  }
  function setGroup(key) {
    mode[key] = !mode[key];
    closeBubble(); /* 组切换先关气泡——重渲染会移除其锚点徽章，防孤儿气泡 */
    if (mode.rs || mode.flow) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'pm-anno-overlay';
        document.body.appendChild(overlay);
      }
      overlay.style.display = 'block';
      renderDots();
      attachWatchers();
    } else {
      if (overlay) { overlay.remove(); overlay = null; }
      detachWatchers();
    }
    var b = toggleBtn[key];
    b.textContent = LABELS[key] + (mode[key] ? ' ✓' : '');
    b.classList.toggle('on', mode[key]);
  }

  /* ── 锚点解析 ─────────────────────────────────────────────────────── */
  function resolveAnchor(a) {
    if (!a || a === 'page') return document.body; /* 页面级锚点 */
    try { return document.querySelector(a); } catch (e) { return null; }
  }

  /* ── 流程步骤扁平化：带元素锚的步骤生成伪项，混入同锚分组 ──────────── */
  function flowSteps() {
    var out = [];
    DATA.items.forEach(function (item) {
      if (item.type !== 'flow' || !Array.isArray(item.steps)) return;
      item.steps.forEach(function (s, i) {
        var anchor = stepAnchor(s);
        if (!anchor || anchor === 'page') return; /* 无元素/非法 → 仅存于总览气泡 */
        out.push({
          id: item.id + '-' + (i + 1),
          label: 'F' + (i + 1),
          type: 'flow',
          stepOnly: true,
          title: item.title,
          text: stepText(s),
          flowId: item.id,
          flowItem: item,
          anchor: anchor
        });
      });
    });
    return out;
  }

  /* ── 徽章渲染（同锚聚合） ─────────────────────────────────────────── */
  function renderDots() {
    overlay.innerHTML = '';
    dots = {};
    /* 可见池：按开启组过滤（规则/状态 vs 流程），聚合与定位对池统一生效 */
    var pool = [];
    if (mode.rs) DATA.items.forEach(function (item) { if (item.type !== 'flow') pool.push(item); });
    if (mode.flow) {
      DATA.items.forEach(function (item) { if (item.type === 'flow') pool.push(item); });
      pool = pool.concat(flowSteps());
    }
    var groups = {};
    pool.forEach(function (item) {
      var key = item.anchor || 'page';
      if (key === 'page') { createDot(item, resolveAnchor(key)); return; } /* 页面级不聚合，走独立槽位 */
      (groups[key] = groups[key] || []).push(item);
    });
    Object.keys(groups).forEach(function (key) {
      var items = groups[key];
      var el = resolveAnchor(key);
      if (!el) {
        items.forEach(function (i) { console.warn('标注锚点未找到: ' + key + '（' + i.title + '）'); });
        return;
      }
      if (items.length === 1) { createDot(items[0], el); }
      else {
        var dot = document.createElement('span');
        dot.className = 'pm-anno-dot agg';
        dot.textContent = String(items.length);
        dot.addEventListener('click', function (ev) { ev.stopPropagation(); openList(items, dot); });
        overlay.appendChild(dot);
        dots['agg-' + key] = { items: items, el: el, dot: dot, agg: true };
      }
    });
    positionDots();
  }
  function createDot(item, el) {
    var dot = document.createElement('span');
    var typeCls = item.type === 'flow' ? 'flow' : (item.type === 'state' ? 'state' : 'rule');
    dot.className = 'pm-anno-dot ' + typeCls;
    dot.textContent = item.label;
    dot.addEventListener('click', function (ev) { ev.stopPropagation(); openBubble(item, dot); });
    overlay.appendChild(dot);
    dots[item.id] = { item: item, el: el, dot: dot };
  }

  /* ── 真实遮挡命中：跳过 pm-anno 层，取其下第一个真实元素 ────────────
   * elementFromPoint 只返回最顶层一个元素——气泡/徽章盖在锚点上方时
   * 会把 pm-anno 自身当成遮挡物（误豁免→已隐藏徽章复活）。elementsFromPoint
   * 返回该点全部元素，跳过 pm-anno 层后取第一个真实元素做遮挡判定 */
  function topRealHit(x, y) {
    var hits = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (h && h.closest && h.closest('.pm-anno-dot, .pm-anno-toggle, .pm-anno-bubble, .pm-demo-toggle, .pm-demo-panel, .pm-demo-bubble')) continue; /* 跳过 pm-anno 层与 pm-demo 演示层，看其下真实元素 */
      return h || null;
    }
    return null;
  }

  /* ── 锚点可见性判定：0×0 + visibility/opacity + 遮挡检测 ───────────── */
  function anchorHidden(el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return true; /* display:none / 未渲染 */
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return true;
    /* 注：pointer-events:none 的锚点（置灰按钮/toast）穿透采样命中祖先时由下方 contains 豁免；
       命中弹窗覆盖层时正常判遮挡。已知限制：toast 显示瞬间穿透命中兄弟元素会误判遮挡
       （2 秒瞬态可接受，toast 消失后的隐藏由 opacity 判定保证） */
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) return false; /* 视口外不判遮挡（滚动交给 scroll 刷新） */
    var hit = topRealHit(cx, cy); /* 采样锚点中心点，跳过 pm-anno 层取真实遮挡物 */
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) return false; /* 命中锚点子孙/祖先均豁免——祖先不可能视觉遮挡子元素，穿透命中祖先常见于锚点自身 pointer-events:none（如置灰按钮） */
    return true; /* 中心点被弹窗/浮层覆盖 */
  }

  /* ── 遮罩类判定：absolute/fixed 且铺满父容器 ──────────────────────── */
  function overlayLike(el) {
    var cs = window.getComputedStyle(el);
    if (cs.position !== 'absolute' && cs.position !== 'fixed') return false;
    var par = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
    var r = el.getBoundingClientRect();
    return !!(par && par.width > 0 && r.width * r.height >= par.width * par.height * 0.85);
  }

  /* ── page 级锚点可见性：遮罩弹窗盖住页面宿主时一并隐藏 ────────────── */
  function pageHidden() {
    var host = document.querySelector('.app-screen'), p;
    if (host) { var hr = host.getBoundingClientRect(); if (hr.width > 0 && hr.height > 0) p = { x: hr.left + hr.width / 2, y: hr.top + hr.height / 2 }; }
    if (!p) p = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var hit = topRealHit(p.x, p.y);
    if (!hit) return false;
    for (var n = hit; n && n !== document.body; n = n.parentElement) if (overlayLike(n)) return true; /* 命中弹窗卡片时沿祖先找到遮罩层 */
    return false;
  }

  /* ── 锚点定位矩形：遮罩/大容器收缩到可见内容盒 ──────────────────────
   * 弹窗/浮层类锚点是全屏遮罩（rect ≈ 视口），徽章若按遮罩矩形定位会跑
   * 到屏幕角落、远离居中的对话框卡片——BFS 找第一个面积显著小于遮罩的
   * 可见子孙（如 .modal 卡片），以其矩形作为徽章定位基准 */
  function anchorRect(el) {
    var r = el.getBoundingClientRect();
    if (!overlayLike(el)) return r;
    var queue = [el];
    for (var i = 0; i < 24 && queue.length; i++) {
      var node = queue.shift();
      for (var k = 0; k < node.children.length; k++) {
        var c = node.children[k], cr = c.getBoundingClientRect(), ccs = window.getComputedStyle(c);
        if (ccs.display === 'none' || ccs.visibility === 'hidden' || +ccs.opacity === 0) continue;
        if (cr.width === 0 && cr.height === 0) continue;
        if (cr.width * cr.height < r.width * r.height * 0.5) return cr; /* 内容盒命中 */
        queue.push(c); /* 子孙仍占满（flex 容器）→ 继续下钻 */
      }
    }
    return r;
  }

  /* ── 对齐列排布（防重叠完整规则） ─────────────────────────────────── */
  function positionDots() {
    var narrow = window.innerWidth < 480;
    var placed = [];
    Object.keys(dots).forEach(function (id) {
      var d = dots[id], r = anchorRect(d.el);
      if ((d.item && d.item.anchor === 'page') ? pageHidden() : anchorHidden(d.el)) { d.dot.style.display = 'none'; return; }
      d.dot.style.display = 'flex';
      var w = d.dot.offsetWidth || 22, h = d.dot.offsetHeight || 18;
      var prefL, prefT;
      if (d.item && d.item.anchor === 'page') {
        /* 页面级：优先定位到原型屏幕容器（手机壳 .app-screen）内左上，避免壳外不可见；
           容器缺失（普通页面）时回退视口左上；y 偏移越过状态栏（54px），避免压住状态栏时间 */
        var pageHost = document.querySelector('.app-screen');
        if (pageHost) {
          var hr = pageHost.getBoundingClientRect();
          if (hr.width > 0 && hr.height > 0) { prefL = Math.max(4, hr.left + 14); prefT = Math.max(4, hr.top + 66); }
          else { prefL = 14; prefT = 12; }
        } else { prefL = 14; prefT = 12; }
      }
      else if (narrow) { prefL = window.innerWidth - 30; prefT = Math.max(4, r.top - 10); } /* 窄视口贴右缘单列 */
      else if (window.innerWidth - r.right < 40) { prefL = Math.max(4, r.left - 26); prefT = Math.max(4, r.top - 10); } /* 右缘贴边改左列 */
      else { prefL = Math.max(4, Math.min(r.right + 4, window.innerWidth - 30)); prefT = Math.max(4, r.top - 10); } /* 常规右侧垂直列 */
      var left = prefL, top = prefT, step = 0;
      while (true) {
        var slot = findSlot(left, prefT, w, h, placed);
        if (slot !== null || step >= 8) { top = (slot !== null) ? slot : prefT; break; }
        left = Math.max(4, Math.min(window.innerWidth - 30, left + w + 6)); step++; /* 同列无空位向右开新列 */
      }
      placed.push({ l: left, t: top, w: w, h: h });
      d.dot.style.left = left + 'px';
      d.dot.style.top = top + 'px';
    });
  }
  function findSlot(l, t, w, h, placed) { /* 同列（x 相近）内找垂直空槽，步进 24px */
    var y = t, tries = 0;
    while (tries < 12) {
      var free = true;
      for (var i = 0; i < placed.length; i++) {
        var p = placed[i];
        if (Math.abs(p.l - l) < Math.max(p.w, w) + 6 && y < p.t + p.h + 2 && y + h + 2 > p.t) { free = false; break; }
      }
      if (free) return y;
      y += h + 6; tries++;
    }
    return null;
  }

  /* ── 状态刷新（scroll/resize/MutationObserver → rAF 去抖 + 定时兜底） ── */
  var fallbackT = 0;
  function schedule() {
    if (!rAFId) rAFId = requestAnimationFrame(function () { rAFId = 0; positionDots(); });
    clearTimeout(fallbackT);
    fallbackT = setTimeout(function () { rAFId = 0; positionDots(); }, 250); /* rAF 被节流（后台标签页/headless）时的兜底重判 */
  }
  function attachWatchers() {
    if (watchersOn) return;
    watchersOn = true;
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    /* CSS 过渡（如 toast opacity 0↔1）不触发 mutation——过渡开始/结束各补一次重判 */
    window.addEventListener('transitionrun', schedule, true);
    window.addEventListener('transitionend', schedule, true);
    if (window.MutationObserver) {
      observer = new MutationObserver(schedule);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
    }
  }
  function detachWatchers() {
    if (!watchersOn) return;
    watchersOn = false;
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('transitionrun', schedule, true);
    window.removeEventListener('transitionend', schedule, true);
    if (observer) { observer.disconnect(); observer = null; }
  }

  /* ── 气泡 ─────────────────────────────────────────────────────────── */
  function openBubble(item, dot) {
    closeBubble();
    bubble = document.createElement('div');
    bubble.className = 'pm-anno-bubble';
    var h = '<div class="pm-anno-b-head">' + esc(item.label) + ' · ' + esc(item.title) + '</div>';
    if (item.stepOnly) {
      /* 流程步骤点：单步气泡 + 完整流程入口 */
      h += '<div class="pm-anno-b-text">' + esc(item.text) + '</div>';
      h += '<div class="pm-anno-b-link" data-flow-id="' + esc(item.flowId) + '">查看完整流程 ›</div>';
    } else if (item.type === 'flow') {
      h += '<ol class="pm-anno-steps">';
      (item.steps || []).forEach(function (s) { h += '<li>' + esc(stepText(s)) + '</li>'; });
      h += '</ol>';
      if (item.exits && item.exits.length) {
        h += '<div class="pm-anno-sec">出口</div><ul class="pm-anno-exits">';
        item.exits.forEach(function (x) { h += '<li>' + esc(x.via) + ' → <b>' + esc(x.target) + '</b>（' + esc(x.type) + '）</li>'; });
        h += '</ul>';
      }
    } else if (item.text) {
      h += '<div class="pm-anno-b-text">' + esc(item.text) + '</div>';
    }
    if (item.anchorNote) h += '<div class="pm-anno-note">' + esc(item.anchorNote) + '</div>';
    if (item.prd) h += '<div class="pm-anno-prd">PRD 溯源：' + esc(item.prd.useCase) + ' · ' + esc(item.prd.section) + '（' + esc(item.prd.file) + '）</div>';
    bubble.innerHTML = h;
    document.body.appendChild(bubble);
    var flowLink = bubble.querySelector('.pm-anno-b-link');
    if (flowLink) flowLink.addEventListener('click', function (ev) {
      ev.stopPropagation(); /* 防止冒泡到 document 关闭处理器（新气泡被立即关闭） */
      openBubble(item.flowItem, dot);
    });
    positionBubble(dot);
  }
  function positionBubble(dot) { /* 边缘翻转：右缘越界右对齐，下缘不足向上 */
    var r = dot.getBoundingClientRect(), bw = 280;
    var left = r.left, top = r.top;
    if (left + bw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - bw - 8);
    var bh = bubble.offsetHeight;
    if (top + bh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - bh - 8);
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }
  function openList(items, dot) { /* 同锚聚合：数字徽章 → 列表气泡 → 点选展开详情 */
    closeBubble();
    bubble = document.createElement('div');
    bubble.className = 'pm-anno-bubble';
    var h = '<div class="pm-anno-b-head">本元素标注（' + items.length + ' 条）</div>';
    items.forEach(function (item) { h += '<div class="pm-anno-li" data-id="' + esc(item.id) + '">' + esc(item.label) + ' · ' + esc(item.title) + '</div>'; });
    bubble.innerHTML = h;
    document.body.appendChild(bubble);
    bubble.querySelectorAll('.pm-anno-li').forEach(function (li) {
      li.addEventListener('click', function (ev) {
        ev.stopPropagation(); /* 防止冒泡到 document 关闭处理器（新气泡被立即关闭） */
        var it = items.filter(function (x) { return x.id === li.getAttribute('data-id'); })[0];
        openBubble(it, dot);
      });
    });
    positionBubble(dot);
  }
  function closeBubble() {
    if (bubble) { bubble.remove(); bubble = null; }
  }
  document.addEventListener('click', function (ev) {
    if (bubble && !bubble.contains(ev.target) && !ev.target.classList.contains('pm-anno-dot')) closeBubble();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeBubble(); });

  /* ── 初始化 ───────────────────────────────────────────────────────── */
  function init() {
    ensureToggle();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
