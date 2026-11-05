/**
 * portal-zoom.js — 文档门户 mermaid 图表放大查看（纯静态、零依赖、零网络，file:// 直接可用）
 *
 * 由 readme-portal.cjs 在含 mermaid 的烘焙阅读页以 <script src> 引入，样式见同目录 doc.css（.diagram / .zoom-*）。
 * 入口：图右上角「放大」按钮（悬停显现），或直接双击图。
 * 浏览：滚轮以指针为中心缩放、拖拽平移、双击切「适应窗口 / 原始大小」、＋/− 按钮、方向键平移、Esc 关闭。
 */
(function () {
  'use strict';

  var MIN = 0.2;        // 缩放下限
  var MAX = 8;          // 缩放上限
  var STEP = 1.25;      // ＋/− 每档倍率
  var FIT_MAX = 2;      // 适应窗口时允许的最大放大（小图不至于被拉爆）
  var PAD = 48;         // 适应窗口时四周留白
  var PAN_KEY = 48;     // 方向键平移步长

  var figures = document.querySelectorAll('.diagram');
  if (!figures.length) return;

  var opened = null;    // { close }：同一时刻只开一个查看层

  /* ---------- 工具 ---------- */

  /** svg 的自然尺寸（viewBox 优先，退化到渲染尺寸） */
  function naturalSize(svg) {
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) return { w: vb.width, h: vb.height };
    var r = svg.getBoundingClientRect();
    return { w: r.width || 800, h: r.height || 600 };
  }

  /** 图上方最近的小节标题（多图文档里放大后仍知道在看哪张） */
  function headingOf(fig) {
    for (var el = fig.previousElementSibling; el; el = el.previousElementSibling) {
      if (/^H[1-4]$/.test(el.tagName)) return el.textContent.trim();
    }
    var h1 = document.querySelector('article.doc h1');
    return h1 ? h1.textContent.trim() : '';
  }

  /* ---------- 放大查看层 ---------- */

  function open(fig) {
    if (!fig) return;
    var src = fig.querySelector('.mermaid svg');
    if (!src) return;                                   // 未渲染完成或无图（渲染失败）→ 不做无效入口
    if (opened) opened.close();

    var size = naturalSize(src);
    var trigger = document.activeElement;
    var body = document.body;
    var prevOverflow = body.style.overflow;

    var ov = document.createElement('div');
    ov.className = 'zoom-overlay';
    ov.tabIndex = -1;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', '图表放大查看');
    ov.innerHTML =
      '<div class="zoom-bar">' +
        '<div class="zoom-title"></div>' +
        '<div class="zoom-hint">滚轮缩放 · 拖拽平移 · 双击适应/原始 · Esc 关闭</div>' +
        '<button type="button" class="zoom-btn" data-act="out" aria-label="缩小" title="缩小（−）">−</button>' +
        '<span class="zoom-pct" aria-live="polite">100%</span>' +
        '<button type="button" class="zoom-btn" data-act="in" aria-label="放大" title="放大（＋）">＋</button>' +
        '<button type="button" class="zoom-btn" data-act="fit" title="适应窗口（0）">适应窗口</button>' +
        '<button type="button" class="zoom-btn is-primary" data-act="close" title="关闭（Esc）">关闭</button>' +
      '</div>' +
      '<div class="zoom-stage"><div class="zoom-canvas"></div></div>';

    var bar = ov.querySelector('.zoom-bar');
    var stage = ov.querySelector('.zoom-stage');
    var canvas = ov.querySelector('.zoom-canvas');
    var pct = ov.querySelector('.zoom-pct');
    bar.querySelector('.zoom-title').textContent = headingOf(fig);   // textContent 注入，标题里的尖括号不进 DOM

    // 克隆而非搬移：原图留在页面里（关闭后页面完好），SVG 自带的内联样式与 defs 一并随克隆可用
    var svg = src.cloneNode(true);
    svg.setAttribute('width', size.w);
    svg.setAttribute('height', size.h);
    canvas.style.width = size.w + 'px';
    canvas.style.height = size.h + 'px';
    canvas.appendChild(svg);

    var s = 1, tx = 0, ty = 0, fitted = true;

    function apply() {
      canvas.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      pct.textContent = Math.round(s * 100) + '%';
    }

    function box() {
      var r = stage.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }

    function fit() {
      var b = box();
      var k = Math.min((b.w - PAD * 2) / size.w, (b.h - PAD * 2) / size.h);
      s = Math.max(MIN, Math.min(FIT_MAX, k));
      tx = (b.w - size.w * s) / 2;
      ty = (b.h - size.h * s) / 2;
      fitted = true;
      apply();
    }

    /** 以查看层内 (px,py) 为不动点缩放 */
    function zoomAt(px, py, factor) {
      var ns = Math.max(MIN, Math.min(MAX, s * factor));
      if (ns === s) return;
      tx = px - (px - tx) / s * ns;
      ty = py - (py - ty) / s * ns;
      s = ns;
      fitted = false;
      apply();
    }

    function zoomCenter(factor) {
      var b = box();
      zoomAt(b.w / 2, b.h / 2, factor);
    }

    /* 指针：拖拽平移（指针捕获，鼠标/触摸同一套） */
    var drag = null;
    var panned = false;         // 本次指针交互是否发生过位移——拖拽收尾的那次 click 不算「点空白」
    var onBackdrop = false;     // 按下时是否落在图外（空白处）。须在 pointerdown 记录：一旦 setPointerCapture，
                                // 后续 click 的 target 会被重定向到 stage，那时已无从分辨点的是图还是空白
    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      panned = false;
      onBackdrop = e.target === stage;
      stage.classList.add('is-panning');
      if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (dx || dy) panned = true;
      drag.x = e.clientX; drag.y = e.clientY;
      tx += dx; ty += dy;
      fitted = false;
      apply();
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (stage.releasePointerCapture) { try { stage.releasePointerCapture(drag.id); } catch (err) {} }
      drag = null;
      stage.classList.remove('is-panning');
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    /* 点空白处关闭（落在图上或拖拽过的不算——在图上单击不该把图关掉） */
    stage.addEventListener('click', function () {
      if (onBackdrop && !panned) close(false);
    });

    /* 滚轮：以指针为不动点缩放；preventDefault 阻止背后页面滚动 */
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      var r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-d * 0.0015));
    }, { passive: false });

    /* 双击：适应窗口 ⇄ 原始大小 */
    stage.addEventListener('dblclick', function (e) {
      e.preventDefault();
      var b = box();
      if (Math.abs(s - 1) < 0.01) fit();
      else { s = 1; tx = (b.w - size.w) / 2; ty = (b.h - size.h) / 2; fitted = false; apply(); }
    });

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'in') zoomCenter(STEP);
      else if (act === 'out') zoomCenter(1 / STEP);
      else if (act === 'fit') fit();
      else if (act === 'close') close(true);
    });

    /* 键盘：Esc 关、＋/− 缩放、0 适应、方向键平移（查看层内接收，不外泄到页面） */
    ov.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'Escape') { e.preventDefault(); close(true); }
      else if (k === '=' || k === '+') { e.preventDefault(); zoomCenter(STEP); }
      else if (k === '-' || k === '_') { e.preventDefault(); zoomCenter(1 / STEP); }
      else if (k === '0') { e.preventDefault(); fit(); }
      else if (k === 'ArrowLeft') { e.preventDefault(); tx += PAN_KEY; fitted = false; apply(); }
      else if (k === 'ArrowRight') { e.preventDefault(); tx -= PAN_KEY; fitted = false; apply(); }
      else if (k === 'ArrowUp') { e.preventDefault(); ty += PAN_KEY; fitted = false; apply(); }
      else if (k === 'ArrowDown') { e.preventDefault(); ty -= PAN_KEY; fitted = false; apply(); }
    });

    /* 窗口尺寸变化：仍处于「适应窗口」态时重新适应，手动缩放过的保持不动 */
    function onResize() { if (fitted) fit(); }
    window.addEventListener('resize', onResize);

    function close(refocus) {
      window.removeEventListener('resize', onResize);
      ov.remove();
      body.style.overflow = prevOverflow;
      opened = null;
      if (refocus && trigger && trigger.focus) trigger.focus();
    }
    opened = { close: close };

    body.style.overflow = 'hidden';
    body.appendChild(ov);
    fit();
    ov.focus();
  }

  /* ---------- 入口绑定 ---------- */

  /** mermaid 渲染是异步的：svg 就位后才放开该图的放大按钮。
   *  渲染失败的图（语法错）同样产出 svg，只是内容是错误提示——放大一张报错没有意义，故一并判掉：
   *  mermaid v9 的错误 svg 带 .error-icon / .error-text 图元，正常图没有。 */
  function sync() {
    for (var i = 0; i < figures.length; i++) {
      var btn = figures[i].querySelector('.diagram-zoom');
      if (!btn) continue;
      var svg = figures[i].querySelector('.mermaid svg');
      btn.hidden = !svg || !!svg.querySelector('.error-icon, .error-text');
    }
  }

  for (var i = 0; i < figures.length; i++) {
    var host = figures[i].querySelector('.mermaid');
    if (host) new MutationObserver(sync).observe(host, { childList: true, subtree: true });
  }
  window.addEventListener('load', sync);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.diagram-zoom');
    if (btn) open(btn.closest('.diagram'));
  });
  document.addEventListener('dblclick', function (e) {
    if (!e.target.closest || e.target.closest('.zoom-overlay')) return;   // 查看层内的双击归查看层处理
    var m = e.target.closest('.mermaid');
    if (m) open(m.closest('.diagram'));
  });
})();
