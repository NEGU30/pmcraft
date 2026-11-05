#!/usr/bin/env node
/**
 * check-quality.js — 原型页面质量检查（替代原 SKILL.md 中 LLM 手动逐项检查）
 *
 * 34 项确定性静态分析（6 维度，维度 6 反 AI 痕迹含 11 项，见 _shared/reference/anti-ai-flavor.md），
 * 16 项 Anti-Slop 视觉/文案判断保留 AI（独立设计评审，第二道门；其中 11 项静态已覆盖，评审做视觉复核）。
 * 另有维度 7 标注层检查 3 项（annotation_assets_present / annotation_json_valid / annotation_anchor_resolves，
 * 仅页面含标注注入标签时启用）+ main() 聚合处跨页检查 annotation_spec_rules_covered（共 4 项，均 MEDIUM）；
 * 维度 8 状态演示层检查 5 项（demo_assets_present / demo_order / demo_json_valid / demo_anchor_resolves /
 * demo_coverage，仅页面含 demo 注入标签时启用，均 MEDIUM）。
 * 基于 build-prototype 页面规范使用 CSS 变量（var(--color-*)）的架构，配色/对比度用 var() 展开 + :root 变量表。
 *
 * 用法：
 *   node check-quality.js --pages=<路径1,路径2> [--design-system=<path>] [--page-inventory=<path>]
 *     [--mode=full|quick] [--auto-fix] [--dry-run]
 *
 * 输出：{mode, pages_checked, pages_skipped, pages_empty, pages_timeout, pages_error,
 *        results{high_fixable, high_unfixable, medium_low_count, b_mode_api_status},
 *        per_page[{page, checks[{id, severity, passed, description, element, line, fixable}]}],
 *        fixes[{page, issue, status: applied|failed|skipped_noop, original?, replacement?, insertId?, insertText?, count?, reason?}],
 *        fixes_applied, fixes_failed, auto_fix_applied, baseline_updated{pages}}
 * 说明：--auto-fix 时由脚本真实写盘（apply-fixes.js）+ 写后复检；auto_fix_applied = 实际写入成功数 > 0。
 *       修复落盘后若 prototype/.last-check.json 存在则刷新被修复页条目（baseline_updated.pages）；基线缺失/损坏静默跳过不创建。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
/** 运行时定位共享库：从本脚本位置逐级向上找 _shared/scripts/lib（源=marketplace 根，cache=插件内分发副本） */
function resolveSharedLib() {
  let dir = __dirname;
  for (;;) {
    const lib = path.join(dir, '_shared', 'scripts', 'lib');
    if (fs.existsSync(lib)) return lib;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
const sharedLib = resolveSharedLib();
if (!sharedLib) throw new Error('pmcraft 共享库缺失：请运行 setup.cmd 分发 _shared/scripts');
const { ok, fail, usage } = require(path.join(sharedLib, 'json-output'));
const { readUtf8, writeUtf8 } = require(path.join(sharedLib, 'encoding'));
const hp = require(path.join(sharedLib, 'html-parser'));
const wcag = require('./lib/wcag-calc');
const { applyFixes } = require('./lib/apply-fixes');

// emoji 范围（功能图标检测）
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) args[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
      else args[key] = 'true';
    }
  }
  return args;
}

/** 提取页面使用的颜色（var 引用 + 字面值），与色板比对 */
function analyzeColors(doc, palette) {
  // 从 style 块 + 内联 style 提取所有颜色值（含 var(--x) 引用）。
  // skipGradients：渐变函数体内的色值（如手机壳 linear-gradient #2a2a2c）是设计意图，不比对色板。
  const used = []; // {value, varName|null, source}
  const allColors = hp.getAllColors(doc, { skipGradients: true });
  for (const c of allColors) {
    const varMatch = /var\((--[\w-]+)/.exec(c.value);
    if (varMatch) {
      used.push({ value: varMatch[1], varName: varMatch[1], source: c.source });
    } else if (/^#/.test(c.value)) {
      used.push({ value: hp.normalizeHex(c.value), varName: null, source: c.source });
    }
  }
  // 展开 var → 实际色值。统一归一化为无 # 小写 6 位 hex 比对（palette 值是带 # 的，字面值是 normalizeHex 无 # 的）
  const paletteValues = new Set(Object.values(palette).map(v => hp.normalizeHex(v)));
  const deviations = [];
  for (const u of used) {
    let actual = null;
    if (u.varName) {
      actual = palette[u.varName]; // 变量直接映射
      if (!actual) continue; // 未知变量跳过（可能是 local 定义）
    } else {
      actual = u.value;
    }
    const norm = hp.normalizeHex(actual);
    if (!norm || !paletteValues.has(norm)) {
      // 检查是否纯黑纯白（单独报告）
      if (norm === '000000' || norm === 'ffffff') {
        deviations.push({ ...u, actual, kind: 'pure_black_white' });
      } else {
        deviations.push({ ...u, actual, kind: 'deviation' });
      }
    }
  }
  return deviations;
}

/** 对比度检查：文字色 vs 背景色（从页面常用 var 组合推导） */
function analyzeContrast(doc, palette) {
  const issues = [];
  // 提取页面使用的文字色与背景色 var 引用
  const textVars = new Set();
  const bgVars = new Set();
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      for (const [prop, val] of Object.entries(rule.declarations)) {
        const vm = /var\((--[\w-]+)/.exec(val);
        if (!vm) continue;
        if (prop === 'color') textVars.add(vm[1]);
        if (/(background|background-color)/.test(prop)) bgVars.add(vm[1]);
      }
    }
  }
  // 常见配对：文字色 vs 背景色
  const pairs = [
    ['--color-text', '--color-background'],
    ['--color-text', '--color-surface'],
    ['--color-text', '--color-card']
  ];
  for (const [tv, bv] of pairs) {
    const tHex = palette[tv];
    const bHex = palette[bv];
    if (!tHex || !bHex) continue;
    if (!textVars.has(tv) || !bgVars.has(bv)) continue;
    const ratio = wcag.contrastRatio(tHex, bHex);
    if (ratio == null || ratio < 4.5) {
      issues.push({ tv, bv, tHex, bHex, ratio: ratio == null ? 'N/A' : ratio.toFixed(2) });
    }
  }
  return issues;
}

/**
 * 从 scriptBlocks 宽松收集被 JS 绑定的元素标识（id/class）。
 * 静态启发式：存在 getElementById/querySelector 引用 且 存在 addEventListener('click'...)/.onclick= 赋值，
 * 则视为"页面脚本绑定了点击行为"。局限：无法验证绑定目标是否精确匹配，漏检由 build-prototype 第十步 10a 浏览器运行时验证兜底。
 */
function collectJsBoundSelectors(doc) {
  const js = doc.scriptBlocks.map(s => s.raw).join('\n');
  const hasBind = /addEventListener\(\s*['"](?:click|touchstart|pointerdown)['"]|\.onclick\s*=/.test(js);
  if (!hasBind) return { ids: new Set(), classes: new Set() };
  const ids = new Set();
  const classes = new Set();
  for (const m of js.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) ids.add(m[1]);
  for (const m of js.matchAll(/querySelector(?:All)?\(\s*['"]([.#][\w-]+)['"]\s*\)/g)) {
    if (m[1].startsWith('#')) ids.add(m[1].slice(1));
    if (m[1].startsWith('.')) classes.add(m[1].slice(1));
  }
  return { ids, classes };
}

/** 单页检查，返回 {checks, fixes} */
function checkPage(filePath, opts) {
  const content = readUtf8(filePath);
  const doc = hp.parseString(content);
  const mode = opts.mode || 'full';
  const palette = opts.palette || {};
  const pageInventory = opts.pageInventory || null;
  const checks = [];
  const fixes = [];
  const add = (id, severity, passed, description, element, line, fixable) => {
    checks.push({ id, severity, passed, description, element: element || '', line: line || 0, fixable: !!fixable });
  };

  // ===== 维度 1：交互可操作性 =====
  // 1. 按钮可点击（onclick/type/data-action 属性 + JS addEventListener 绑定静态分析）
  const jsBound = collectJsBoundSelectors(doc);
  const buttons = hp.getElementsByTagName(doc, 'button');
  for (const b of buttons) {
    const onclick = b.attrs.onclick;
    const type = b.attrs.type;
    const elClasses = (b.attrs.class || '').split(/\s+/).filter(Boolean);
    const isJsBound = (b.attrs.id && jsBound.ids.has(b.attrs.id)) || elClasses.some(c => jsBound.classes.has(c));
    if (!onclick && type !== 'submit' && type !== 'reset' && !b.attrs['data-action'] && !isJsBound) {
      add('interactive_button_clickable', 'HIGH', false, '按钮没有点击事件（静态分析未发现 onclick/type/data-action/JS 绑定）', `<button>${(b.innerText || '').slice(0, 20)}</button>`, 0, false);
    }
  }
  // <a> 无 href
  for (const a of hp.getElementsByTagName(doc, 'a')) {
    if (!a.attrs.href && !a.attrs.onclick) {
      add('interactive_link_href', 'HIGH', false, '链接无 href 或点击事件', `<a>${(a.innerText || '').slice(0, 20)}</a>`, 0, true);
    }
  }
  // 2. 跳转路径验证（需 page-inventory）
  if (pageInventory) {
    const invContent = readUtf8(pageInventory) || '';
    const knownPages = new Set();
    for (const m of invContent.matchAll(/\|?\s*`?([\w-]+\.html)`?\s*\|?/g)) {
      const name = m[1].trim();
      if (/\.html$/.test(name)) knownPages.add(name);
    }
    for (const a of hp.getElementsByTagName(doc, 'a')) {
      const href = a.attrs.href;
      if (href && /\.html$/.test(href) && !href.startsWith('http')) {
        const target = href.split('/').pop();
        if (!knownPages.has(target) && !knownPages.has(`pages/${target}`)) {
          add('navigation_path_valid', 'HIGH', false, `跳转目标 ${href} 不在 page-inventory 清单中`, `<a href="${href}">`, 0, false);
        }
      }
    }
  }
  // 3. hover 反馈
  const hasHover = doc.styleBlocks.some(b => b.rules.some(r => r.pseudo === 'hover'));
  if (!hasHover && buttons.length > 0) {
    add('hover_feedback', 'MEDIUM', false, 'CSS 中未定义 :hover 伪类样式', '', 0, false);
  }
  // 4. 弹窗可关闭
  const modals = doc.tags.filter(t => /modal|dialog|popup/.test(t.attrs.class || ''));
  for (const m of modals) {
    const inner = m.innerText || '';
    if (!/close|关闭|×|x/i.test(inner) && !m.attrs.onclick) {
      add('modal_closeable', 'MEDIUM', false, '弹窗缺少关闭按钮或机制', `<div class="${m.attrs.class}">`, 0, false);
    }
  }
  // 5. focus-visible
  const hasFocusVisible = doc.styleBlocks.some(b => b.rules.some(r => r.pseudo === 'focus-visible'));
  if (!hasFocusVisible) {
    add('focus_visible', 'MEDIUM', false, 'CSS 未定义 :focus-visible 样式', '', 0, true);
    if (opts.autoFix) {
      fixes.push({ issue: 'focus_visible', kind: 'append-style', original: '<style 块末尾追加>', replacement: '*:focus-visible { outline: 2px solid var(--color-accent, #1976D2); outline-offset: 2px; }', reason: '为交互元素添加键盘焦点可见样式' });
    }
  }

  // ===== 维度 2：状态覆盖 =====
  const clsAll = doc.tags.map(t => t.attrs.class || '').join(' ');
  const textAll = doc.tags.map(t => t.innerText || '').join(' ');
  // 6. 加载态
  if (!/skeleton|spinner|loading|loader|progress/.test(clsAll)) {
    add('state_loading', 'MEDIUM', false, '缺少加载态（skeleton/spinner/progress）', '', 0, false);
  }
  // 6b. 加载作用域（A1/A7，anti-ai-flavor 模式 16）：全页/全屏 loading 遮罩检测——
  //     单项请求应只锁对应对象（行内/局部 loading），禁止整页遮罩；骨架屏应与最终布局同构，不全屏 spinner
  for (const t of doc.tags) {
    const cls = t.attrs.class || '';
    if (!/loading|spinner|loader|skeleton/.test(cls)) continue;
    const st = t.attrs.style || '';
    const isFixed = /position\s*:\s*fixed/.test(st);
    const fullPageCls = /fullscreen|full-page|full_page|page-loading|loading-mask|overlay/.test(cls);
    if (isFixed || fullPageCls) {
      add('state_loading_scope', 'LOW', false,
        '全页/全屏 loading 遮罩——单项请求应只锁对应对象（行内/局部 loading），刷新/翻页保留旧数据；骨架屏应与最终布局同构', `<${t.tagName} class="${cls}">`, 0, false);
      break;
    }
  }
  // 7. 空数据态
  if (!/empty|暂无数据|暂无记录|没有数据/.test(clsAll + textAll)) {
    add('state_empty', 'MEDIUM', false, '缺少空数据态提示', '', 0, false);
  }
  // 8. 错误态
  if (!/error|错误|失败/.test(clsAll + textAll)) {
    add('state_error', 'MEDIUM', false, '缺少错误提示区域', '', 0, false);
  }
  // 9. 边界态（有任意 1-2 种状态即视为部分覆盖，仅 LOW 提示）
  const states = ['skeleton|spinner|loading', 'empty|暂无', 'error|错误|失败'];
  const covered = states.filter(s => new RegExp(s).test(clsAll + textAll)).length;
  if (covered < 2) {
    add('state_boundary', 'LOW', false, `状态覆盖不完整（仅 ${covered}/3 种状态）`, '', 0, false);
  }
  // 9b. 空态区分（A2，anti-ai-flavor 模式 16 配套）：集合为空 vs 筛选无结果是两种状态——
  //     含筛选控件的页面，空态文案须区分"筛选无结果"并提供恢复动作（清空筛选）
  const hasFilter = doc.tags.some(t => {
    if (t.tagName === 'select') return true;
    if (t.tagName === 'input') {
      const attrs = `${t.attrs.class || ''} ${t.attrs.type || ''} ${t.attrs.placeholder || ''}`;
      return /search|filter|keyword|关键词|搜索/.test(attrs);
    }
    return false;
  });
  if (hasFilter && /empty|暂无数据|暂无记录|没有数据/.test(clsAll + textAll)) {
    const filteredVariant = /没有.*(筛选|条件|结果|符合)|无(匹配|符合|检索)结果|清空筛选|清空条件|没有找到|重置筛选|重新筛选/.test(textAll);
    if (!filteredVariant) {
      add('state_filtered_empty', 'MEDIUM', false,
        '页面含筛选控件但空态未区分"筛选无结果"——集合为空（"还没有订单，去创建一单"）与筛选无结果（"没有符合条件的订单，清空筛选看看"）是两种状态，文案与恢复动作必须不同', '', 0, false);
    }
  }

  // ===== 维度 3：配色一致性 =====
  if (mode !== 'quick') {
    // 10. 无偏离色
    const deviations = analyzeColors(doc, palette);
    const pureBW = deviations.filter(d => d.kind === 'pure_black_white');
    const devs = deviations.filter(d => d.kind === 'deviation');
    for (const d of devs.slice(0, 5)) {
      add('color_no_deviation', 'HIGH', false, `颜色 ${d.value} 偏离色板`, `color: ${d.value}`, 0, true);
      // 自动修复：找最近色板色
      if (opts.autoFix) {
        const closest = wcag.findClosestPaletteColor(d.actual, Object.values(palette).filter(v => /^#[0-9a-f]{6}$/i.test(v)));
        if (closest.hex) {
          // original 用带 # 的完整 hex（页面内实际形态），replacement 为色板最近色（带 #）——避免 replace 只匹配无 # 片段导致 ## 双井号
          fixes.push({ issue: 'color_deviation', kind: 'replace', original: `#${d.value}`, replacement: closest.hex, reason: '替换为色板最近色' });
        }
      }
    }
    // 11. 对比度（quick 跳过）。
    // 不自动修复：var() 架构下根因在 design-system.css 的 token 配对，页面内字符串替换不成立。
    // 该问题走模板 B（需 PM 确认），建议在 design-system.css 层调整。
    const contrastIssues = analyzeContrast(doc, palette);
    for (const ci of contrastIssues.slice(0, 3)) {
      add('contrast_sufficient', 'HIGH', false, `文字 ${ci.tv}(${ci.tHex}) 与背景 ${ci.bv}(${ci.bHex}) 对比度 ${ci.ratio} < 4.5（建议调整 design-system.css 的 token 配对）`, '', 0, false);
    }
    // 12. 语义色正确（danger/success class 用对应色）
    for (const t of doc.tags) {
      const cls = t.attrs.class || '';
      if (/danger|error/.test(cls)) {
        const bg = /var\((--[\w-]+)/.exec(t.attrs.style || '');
        if (bg && !/danger|error/.test(bg[1])) {
          add('semantic_color', 'MEDIUM', false, `danger 元素用了非 danger 色 ${bg[1]}`, `<div class="${cls}">`, 0, false);
        }
      }
    }
    // 13. 纯黑纯白
    for (const p of pureBW.slice(0, 3)) {
      add('color_no_pure_bw', 'MEDIUM', false, `使用了纯黑/纯白 ${p.value}（应带色相倾向变体）`, `color: ${p.value}`, 0, false);
    }
  }

  // ===== 维度 4：排版清晰度 =====
  // 14. 无文本溢出（quick 跳过）
  if (mode !== 'quick') {
    for (const block of doc.styleBlocks) {
      for (const rule of block.rules) {
        if (rule.declarations['overflow'] === 'hidden' && !rule.declarations['text-overflow']) {
          add('no_text_overflow', 'MEDIUM', false, `容器 overflow:hidden 但无 text-overflow:ellipsis（文本可能截断）`, rule.selector, 0, false);
          break;
        }
      }
    }
  }
  // 14b. 横向溢出风险（quick 跳过）：overflow-y:auto/scroll 容器未显式裁剪 overflow-x，
  //      且页面存在负偏移装饰元素（right/left/margin-right 负值、translateX 负值）→ 装饰伸出可能产生横向滚动条
  if (mode !== 'quick') {
    const negOffsets = [...content.matchAll(/right\s*:\s*-\d+px|left\s*:\s*-\d+px|margin-right\s*:\s*-\d+px|translateX\(\s*-\d/gi)];
    if (negOffsets.length > 0) {
      for (const block of doc.styleBlocks) {
        for (const rule of block.rules) {
          const oy = rule.declarations['overflow-y'] || rule.declarations['overflow'] || '';
          const ox = rule.declarations['overflow-x'] || rule.declarations['overflow'] || '';
          if (/^(auto|scroll)$/.test(oy.trim()) && ox.trim() !== 'hidden') {
            add('overflow_x_risk', 'MEDIUM', false,
              `横向溢出风险：容器 ${rule.selector} 为 overflow-y:${oy.trim()} 且未裁剪 overflow-x（页面存在负偏移装饰元素，装饰伸出可能产生横向滚动条）`, rule.selector, 0, false);
            break;
          }
        }
      }
      // 内联样式场景
      for (const t of doc.tags) {
        const st = t.attrs.style || '';
        if (/overflow(-y)?\s*:\s*(auto|scroll)/i.test(st) && !/overflow(-x)?\s*:\s*hidden/i.test(st)) {
          add('overflow_x_risk', 'MEDIUM', false,
            `横向溢出风险：内联样式 ${t.tagName} overflow-y:auto 未裁剪 overflow-x（页面存在负偏移装饰元素，可能产生横向滚动条）`, `<${t.tagName}>`, 0, false);
        }
      }
    }
  }
  // 15. 层级清晰
  const sizes = {};
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      const tagMatch = /^(h1|h2|h3|body)\s*[^:]*$/.exec(rule.selector);
      if (tagMatch && rule.declarations['font-size']) {
        sizes[tagMatch[1]] = parseFloat(rule.declarations['font-size']) || 0;
      }
    }
  }
  if (sizes.h1 && sizes.h2 && sizes.h3 && !(sizes.h1 > sizes.h2 && sizes.h2 > sizes.h3)) {
    add('typography_hierarchy', 'MEDIUM', false, `标题字号层级不清晰（h1=${sizes.h1} h2=${sizes.h2} h3=${sizes.h3}）`, '', 0, false);
  }
  // 16. 无重叠（static 近似：检测多个 absolute/fixed 元素）
  const positioned = doc.tags.filter(t => /position:\s*(absolute|fixed)/.test(t.attrs.style || ''));
  if (positioned.length > 1) {
    // 简单启发：>2 个 absolute/fixed 且非弹窗类 → 提示
    const nonModal = positioned.filter(t => !/modal|overlay|tooltip|dropdown/.test(t.attrs.class || ''));
    if (nonModal.length > 2) {
      add('no_element_overlap', 'HIGH', false, `检测到 ${nonModal.length} 个 absolute/fixed 元素，可能有重叠`, '', 0, false);
    }
  }

  // ===== 维度 5：UX 规则 =====
  // 17. 无 emoji 图标
  const emojiMatches = [];
  for (const t of doc.tags) {
    const em = (t.innerText || '').match(EMOJI_RE);
    if (em && emojiMatches.length < 3) emojiMatches.push(`${t.tagName}: ${em[0]}`);
  }
  if (emojiMatches.length) {
    add('no_emoji_icon', 'MEDIUM', false, `发现 emoji 用作图标: ${emojiMatches.join(', ')}`, '', 0, false);
  }
  // 18. 图标尺寸过大
  if (/icon-xl|icon-2xl/.test(clsAll) && !/login|dashboard/.test(clsAll)) {
    add('icon_size_appropriate', 'MEDIUM', false, '使用 icon-xl/icon-2xl 于非明确大尺寸场景', '', 0, false);
  }
  // 19. 表单有 label
  for (const t of doc.tags) {
    if (['input', 'select', 'textarea'].includes(t.tagName)) {
      // 识别三类关联：aria-label / label[for=id] / implicit label（input 被 label 包裹，任意深度祖先——与 apply-fixes 包裹守卫同语义）
      // 祖先判定：label 须在 t 之前且 depth 更小，且两者之间不存在 depth <= label.depth 的标签（表示 label 已闭合）
      const tIdx = doc.tags.indexOf(t);
      const implicitLabel = doc.tags.some((x, xi) =>
        x.tagName === 'label' && xi < tIdx && x.depth < t.depth &&
        !doc.tags.slice(xi + 1, tIdx).some(y => y.depth <= x.depth));
      const hasLabel = t.attrs['aria-label'] || t.attrs.id && doc.tags.some(x => x.tagName === 'label' && x.attrs['for'] === t.attrs.id) || implicitLabel;
      if (!hasLabel) {
        const type = t.attrs.type || '';
        // checkbox/radio 无 placeholder 时跳过自动修复（id→英文文案推导必然残留，走模板 B 由 PM 人工补中文 label）
        const autoFixable = opts.autoFix && t.attrs.id && !t.attrs['aria-label'] && !/^(hidden|submit|reset|button|image)$/.test(type) && !(/^(checkbox|radio)$/.test(type) && !t.attrs.placeholder);
        add('form_has_label', 'HIGH', false, `表单元素缺少 label/aria-label`, `<${t.tagName} ${type}>`, 0, !!autoFixable);
        if (autoFixable) {
          // 从 placeholder（去掉"请输入/："等引导词）或 id（camelCase 转文案）推导 label 文本
          let text = t.attrs.placeholder
            ? String(t.attrs.placeholder).replace(/^请输入|^请填写|[：:（(].*$|。$/g, '').trim() || String(t.attrs.placeholder)
            : t.attrs.id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
          fixes.push({
            issue: 'form_missing_label',
            kind: 'insert-before',
            original: '',
            insertId: t.attrs.id,
            insertText: `<label for="${t.attrs.id}">${text}</label>`,
            reason: '为表单元素补充 label'
          });
        }
      }
    }
  }
  // 20. touch 目标 ≥36px
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      const h = parseFloat(rule.declarations['height'] || rule.declarations['min-height'] || '0');
      if (h > 0 && h < 36 && /button|input|a/.test(rule.selector)) {
        add('touch_target_size', 'MEDIUM', false, `交互元素 ${rule.selector} 高度 ${h}px < 36px`, rule.selector, 0, false);
      }
    }
  }
  // 21. 无 console 报错
  for (const s of doc.scriptBlocks) {
    if (/console\.error\(|throw\s+/.test(s.raw)) {
      add('no_console_error', 'MEDIUM', false, 'script 中存在 console.error() 或 throw', '', 0, false);
      break;
    }
  }

  // ===== 维度 6：反 AI 痕迹（静态可检测 11 项，见 SKILL.md 检查清单维度 6）=====
  // 22. primary 按钮过多
  const primaryBtns = doc.tags.filter(t => t.tagName === 'button' && /primary/.test(t.attrs.class || ''));
  if (primaryBtns.length > 2) {
    add('anti_ai_primary_count', 'MEDIUM', false, `${primaryBtns.length} 个 primary 按钮（应 ≤2）`, '', 0, false);
  }
  // 23. 卡片嵌套卡片
  const cards = hp.getElementsByClassName(doc, 'card');
  for (const c of cards) {
    // 检测卡片内部是否还有 card 后代
    const pos = doc.tags.indexOf(c);
    const depth = c.depth;
    for (let i = pos + 1; i < doc.tags.length; i++) {
      if (doc.tags[i].depth <= depth) break;
      if (/card/.test(doc.tags[i].attrs.class || '')) {
        add('anti_ai_card_nesting', 'MEDIUM', false, '卡片内嵌套卡片', '', 0, false);
        break;
      }
    }
  }
  // 24. 色彩无语义
  for (const t of doc.tags) {
    const cls = t.attrs.class || '';
    const style = t.attrs.style || '';
    if (/color:\s*(red|#f00|#ff0000)/i.test(style) && !/danger|error/.test(cls)) {
      add('anti_ai_color_semantic', 'MEDIUM', false, '红色用于非 danger/success 元素', `<div class="${cls}">`, 0, false);
      break;
    }
  }
  // 25. badge 过度
  const badges = doc.tags.filter(t => /badge/.test(t.attrs.class || ''));
  if (badges.length >= 4) {
    add('anti_ai_badge_overuse', 'LOW', false, `${badges.length} 个 badge 元素（应 <4）`, '', 0, false);
  }
  // 26. 纯图标按钮（无文字且无名称）——对应 anti-ai-flavor 模式 14
  for (const t of doc.tags) {
    if (t.tagName !== 'button') continue;
    const text = (t.innerText || '').replace(/\s+/g, '');
    if (text) continue; // 有文字
    if (t.attrs['aria-label'] || t.attrs.title) continue; // 有名称（辅助技术可见）
    add('anti_ai_icon_only_button', 'MEDIUM', false,
      '按钮无文字且无 aria-label/title，用户只能靠猜（主要操作应显示文字，其他图标补名称）', `<${t.tagName}>`, 0, false);
    break;
  }
  // 27. 黑挤标题（大字号+重字重+紧行高组合，且存在长标题文本）——对应 anti-ai-flavor 模式 7
  const longHeadings = doc.tags.filter(t =>
    /^h[12]$/.test(t.tagName) && ((t.innerText || '').replace(/\s+/g, '').length >= 8));
  if (longHeadings.length) {
    let dense = false;
    for (const block of doc.styleBlocks) {
      for (const rule of block.rules) {
        if (!/^(h1|h2)(\.| |$)/.test(rule.selector)) continue;
        const fs = parseFloat(rule.declarations['font-size'] || '0');
        let fw = rule.declarations['font-weight'] || rule.declarations['font'] || '400';
        fw = /^bold$/i.test(fw) ? 700 : (parseInt(fw, 10) || 0);
        const lhRaw = rule.declarations['line-height'] || '';
        let lh = parseFloat(lhRaw);
        if (/px$/.test(lhRaw) && fs > 0) lh = lh / fs; // px 行高换算为 ratio
        if (fs >= 40 && fw >= 700 && lh > 0 && lh <= 1.2) { dense = true; break; }
      }
    }
    // 内联样式场景
    if (!dense) {
      for (const t of longHeadings) {
        const st = t.attrs.style || '';
        const fs = /font-size\s*:\s*(\d+)px/i.exec(st);
        const fw = /font-weight\s*:\s*(bold|\d+)/i.exec(st);
        const lh = /line-height\s*:\s*([\d.]+)/i.exec(st);
        if (fs && fw && lh && +fs[1] >= 40 && (/bold/i.test(fw[1]) || +fw[1] >= 700) && +lh[1] <= 1.2) { dense = true; break; }
      }
    }
    if (dense) {
      add('anti_ai_heading_density', 'MEDIUM', false,
        '标题使用大字号+重字重+紧行高组合（≥40px/700/≤1.2），长标题换行后易挤成黑块', 'h1/h2', 0, false);
    }
  }
  // 28. 分割线过度使用——对应 anti-ai-flavor 模式 5
  const hrs = doc.tags.filter(t => t.tagName === 'hr');
  if (hrs.length >= 5) {
    add('anti_ai_hr_overuse', 'LOW', false,
      `${hrs.length} 个 <hr> 分割线（应 <5；先用标题和间距分组，仅相邻内容易混淆时保留浅色线）`, '', 0, false);
  }
  // 29. 动画过度使用（入场/悬浮/脉冲类 keyframes 或 animation 声明泛滥）——对应 anti-ai-flavor 模式 9
  const kfCount = [...content.matchAll(/@keyframes\s+([\w-]+)/g)]
    .filter(m => /fade|up|slide|float|zoom|pulse|bounce|pop/i.test(m[1])).length;
  const animDecls = (content.match(/animation\s*:/g) || []).length;
  if (kfCount >= 4 || animDecls >= 4) {
    add('anti_ai_animation_overuse', 'LOW', false,
      `${kfCount} 个入场/悬浮/脉冲类 keyframes、${animDecls} 处 animation 声明（应克制；动效仅用于说明状态或空间关系）`, '', 0, false);
  }
  // 30. 假身份字段（anti-ai-flavor 模式 15）：行身份用 UUID/原始 ID（"ID: 1024"）——
  //     资源识别最小单元 = 视觉身份 + 主名称 + 区分字段；原型假数据同样禁止 UUID 当身份。
  //     排除：人类可读编号（"订单ID: 20240828001" 前缀为中文/字母时不触发）、HTML id 属性（id="x" 非 ID: 展示）
  const uuidCount = (content.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) || []).length;
  const idLabelCount = (content.match(/(?<![一-龥A-Za-z0-9])ID\s*[:：]\s*\d{3,}/g) || []).length;
  if (uuidCount + idLabelCount > 0) {
    add('anti_ai_fake_identity', 'MEDIUM', false,
      `行身份使用假身份字段（${uuidCount} 处 UUID、${idLabelCount} 处 "ID: xxx" 展示）——行身份应由视觉身份 + 主名称 + 区分字段构成（如"张伟 · 财务部"），原始 ID 仅可作辅助`, '', 0, false);
  }

  // ===== 维度 7：标注层（仅页面含标注注入标签时启用，存量无标注页面静默跳过） =====
  const hasAnnoRefs = content.includes('../annotations.css') && content.includes('../annotations-runtime.js');
  if (hasAnnoRefs) {
    const workingDir = path.dirname(path.dirname(filePath));
    const annDir = path.join(workingDir, 'annotations');
    const base = path.basename(filePath, path.extname(filePath));
    const dataPath = path.join(annDir, base + '.js');
    // 31. 标注资产齐全
    const cssOk = fs.existsSync(path.join(workingDir, 'annotations.css'));
    const rtOk = fs.existsSync(path.join(workingDir, 'annotations-runtime.js'));
    const dataFileOk = fs.existsSync(dataPath);
    if (!cssOk || !rtOk || !dataFileOk) {
      const missing = [];
      if (!cssOk) missing.push('annotations.css');
      if (!rtOk) missing.push('annotations-runtime.js');
      if (!dataFileOk) missing.push(`annotations/${base}.js`);
      add('annotation_assets_present', 'MEDIUM', false, `标注资产缺失：${missing.join('、')}`, '', 0, false);
    }
    // 32. 标注数据 JSON 有效
    if (dataFileOk) {
      const dataRaw = readUtf8(dataPath) || '';
      const m = dataRaw.match(/window\.PM_ANNOTATIONS_DATA\s*=\s*(\{[\s\S]*?\});/);
      if (!m) {
        add('annotation_json_valid', 'MEDIUM', false, '标注数据文件未找到 window.PM_ANNOTATIONS_DATA 声明', dataPath, 0, false);
      } else {
        let annoData = null;
        try { annoData = JSON.parse(m[1]); } catch (e) { annoData = null; }
        if (!annoData || !Array.isArray(annoData.items)) {
          add('annotation_json_valid', 'MEDIUM', false, '标注数据 JSON 解析失败（须为严格 JSON，无注释/尾逗号）', dataPath, 0, false);
        } else {
          // 33. 标注锚点可解析（#id → attrs.id；.class → attrs.class；page 恒过）
          for (const item of annoData.items) {
            const a = item.anchor || 'page';
            if (a === 'page') continue;
            const okResolve = a.startsWith('.')
              ? doc.tags.some(t => (t.attrs.class || '').split(/\s+/).includes(a.slice(1)))
              : doc.tags.some(t => t.attrs.id === a.slice(1));
            if (!okResolve) {
              add('annotation_anchor_resolves', 'MEDIUM', false,
                `标注 ${item.label} ${item.title} 的锚点 ${a} 在页面中不存在`, a, 0, false);
            }
            // 33a. 流程步骤级锚点可解析（v2 steps 对象含 anchor 时逐条校验；字符串步骤跳过）
            if (item.type === 'flow' && Array.isArray(item.steps)) {
              item.steps.forEach((s, i) => {
                if (typeof s !== 'object' || !s || !s.anchor || s.anchor === 'page') return;
                const sa = s.anchor;
                const okStep = sa.startsWith('.')
                  ? doc.tags.some(t => (t.attrs.class || '').split(/\s+/).includes(sa.slice(1)))
                  : doc.tags.some(t => t.attrs.id === sa.slice(1));
                if (!okStep) {
                  add('annotation_anchor_resolves', 'MEDIUM', false,
                    `流程步骤 F${i + 1}（${item.label} ${item.title}）的锚点 ${sa} 在页面中不存在`, sa, 0, false);
                }
              });
            }
          }
        }
      }
    }
  }

  // ===== 维度 8：状态演示层（仅页面含 demo 注入标签时启用，存量无 demo 引用页面静默跳过） =====
  const hasDemoRefs = content.includes('../demo-panel.css') && content.includes('../demo-panel-runtime.js');
  if (hasDemoRefs) {
    const workingDir = path.dirname(path.dirname(filePath));
    const demoDir = path.join(workingDir, 'demo');
    const base = path.basename(filePath, path.extname(filePath));
    const dataPath = path.join(demoDir, base + '.js');
    // 34. 演示资产齐全 + 数据引用完整
    const cssOk = fs.existsSync(path.join(workingDir, 'demo-panel.css'));
    const rtOk = fs.existsSync(path.join(workingDir, 'demo-panel-runtime.js'));
    const dataFileOk = fs.existsSync(dataPath);
    const dataRefOk = content.includes(`../demo/${base}.js`);
    if (!cssOk || !rtOk || !dataFileOk || !dataRefOk) {
      const missing = [];
      if (!cssOk) missing.push('demo-panel.css');
      if (!rtOk) missing.push('demo-panel-runtime.js');
      if (!dataFileOk) missing.push(`demo/${base}.js`);
      if (!dataRefOk) missing.push(`demo/${base}.js 引用`);
      add('demo_assets_present', 'MEDIUM', false, `演示资产缺失：${missing.join('、')}`, '', 0, false);
    }
    // 34a. 注入顺序（demo/{page}.js 须在 demo-panel-runtime.js 之前——运行时依赖 PM_DEMO_DATA）
    const iData = content.indexOf(`../demo/${base}.js`);
    const iRt = content.indexOf('../demo-panel-runtime.js');
    if (dataRefOk && iData >= 0 && iRt >= 0 && iData > iRt) {
      add('demo_order', 'MEDIUM', false, '演示注入顺序错误：demo/{page}.js 须在 demo-panel-runtime.js 之前加载（运行时读 window.PM_DEMO_DATA）', '', 0, false);
    }
    // 35. 演示数据 JSON 有效（独立校验，不依赖维度 7 启用条件）
    if (dataFileOk) {
      const dataRaw = readUtf8(dataPath) || '';
      const m = dataRaw.match(/window\.PM_DEMO_DATA\s*=\s*(\{[\s\S]*?\});/);
      if (!m) {
        add('demo_json_valid', 'MEDIUM', false, '演示数据文件未找到 window.PM_DEMO_DATA 声明', dataPath, 0, false);
      } else {
        let demoData = null;
        try { demoData = JSON.parse(m[1]); } catch (e) { demoData = null; }
        if (!demoData || !Array.isArray(demoData.items)) {
          add('demo_json_valid', 'MEDIUM', false, '演示数据 JSON 解析失败（须为严格 JSON，无注释/尾逗号）', dataPath, 0, false);
        } else {
          // 36. 演示状态锚点可解析（#id → attrs.id；.class → attrs.class；page 恒过——state 锚点须元素级）
          for (const item of demoData.items) {
            const a = item.anchor || 'page';
            if (!a || a === 'page') continue;
            const okResolve = a.startsWith('.')
              ? doc.tags.some(t => (t.attrs.class || '').split(/\s+/).includes(a.slice(1)))
              : doc.tags.some(t => t.attrs.id === a.slice(1));
            if (!okResolve) {
              add('demo_anchor_resolves', 'MEDIUM', false,
                `演示状态 ${item.label} ${item.title} 的锚点 ${a} 在页面中不存在`, a, 0, false);
            }
          }
          // 37. 数据一致性（有标注层时：demo items 与标注 state 项比对——标注更新后演示数据待重派生；
          // 无标注层（extend-html 跳过标注场景）由生成步骤从 page-inventory 保证，脚本不比对）
          const annPath = path.join(workingDir, 'annotations', base + '.js');
          if (fs.existsSync(annPath)) {
            const annRaw = readUtf8(annPath) || '';
            const am = annRaw.match(/window\.PM_ANNOTATIONS_DATA\s*=\s*(\{[\s\S]*?\});/);
            if (am) {
              try {
                const annoData = JSON.parse(am[1]);
                const annoStates = (annoData.items || []).filter(x => x.type === 'state').map(x => x.label);
                const demoLabels = demoData.items.map(x => x.label);
                const missing = annoStates.filter(l => !demoLabels.includes(l));
                if (missing.length > 0) {
                  add('demo_coverage', 'MEDIUM', false,
                    `演示数据缺少标注状态：${missing.join('、')}（标注已更新，演示数据待重派生）`, dataPath, 0, false);
                }
              } catch (e) { /* 标注 JSON 损坏由维度 7 报，不重复 */ }
            }
          }
        }
      }
    }
  }

  return { checks, fixes };
}

/** B 模式 API 探活 */
function checkBApi(pages) {
  // 从页面路径推导 working 目录
  const workingDir = pages.map(p => {
    const idx = p.indexOf(path.sep + 'prototype' + path.sep + 'working');
    return idx >= 0 ? p.slice(0, idx + path.sep.length) + 'prototype' + path.sep + 'working' : null;
  }).find(Boolean);
  if (!workingDir) return 'not_b_mode';
  const dbJson = path.join(workingDir, 'mock', 'db.json');
  const serverJs = path.join(workingDir, 'server.js');
  const pidFile = path.join(workingDir, 'mock', '.server.pid');
  if (!fs.existsSync(dbJson) || !fs.existsSync(serverJs)) return 'not_b_mode';
  if (!fs.existsSync(pidFile)) return 'server_down_skipped';
  // 解析端口
  const serverContent = readUtf8(serverJs) || '';
  const portMatch = serverContent.match(/(?:port|PORT)\s*[=:]\s*(\d+)/);
  const port = portMatch ? parseInt(portMatch[1], 10) : 5178;
  // entity 列表（mock/db.json 非严格 JSON（如含尾逗号/注释）时无法确定 entity，
  // 按非 B 模式跳过——遵守"致命错误返回空结果而非崩溃"约束）
  let db;
  try {
    db = JSON.parse(readUtf8(dbJson) || '{}');
  } catch (e) {
    return 'not_b_mode';
  }
  const entities = Object.keys(db);
  let failCount = 0;
  for (const e of entities) {
    try {
      const code = httpCheck(`http://localhost:${port}/api/${e}`);
      if (code === null || code >= 400) failCount++;
    } catch (err) { failCount++; }
  }
  if (entities.length === 0) return 'all_ok';
  return failCount === 0 ? 'all_ok' : `partial_fail_${failCount}/${entities.length}`;
}

/**
 * HTTP GET 状态码（同步，2s 超时）。
 * 实现：子进程 node 执行真实 HTTP 请求（busy-wait 会阻塞事件循环导致回调永不触发，
 * 无法用于同步等待异步响应），stdout 同步回传状态码。
 *   - 连接成功且收到响应 → 子进程 stdout 输出状态码、退出 0 → 返回状态码
 *   - 连接失败 / 超时 / 异常 → 子进程非 0 退出 → execFileSync 抛错 → 返回 null
 */
function httpCheck(url) {
  const probeSrc =
    "const fs=require('fs'),http=require('http');" +
    "const req=http.get(process.argv[1],res=>{fs.writeSync(1,String(res.statusCode));process.exit(0)});" +
    'req.setTimeout(2000,()=>process.exit(2));req.on(\'error\',()=>process.exit(1));';
  try {
    const out = execFileSync(process.execPath, ['-e', probeSrc, url], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    const code = parseInt(String(out).trim(), 10);
    return isNaN(code) ? null : code;
  } catch (e) { return null; }
}

function main() {
  const args = parseArgs(process.argv);
  const mode = args.mode || 'full';
  const autoFix = args['auto-fix'] === 'true' || args['auto-fix'] === true;
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;

  if (!args.pages) usage('缺少 --pages（页面路径列表，逗号分隔）');
  const pages = args.pages.split(',').map(s => s.trim()).filter(Boolean);
  if (!pages.length) usage('--pages 为空');

  // 色板
  let palette = {};
  if (args['design-system']) {
    const dsPath = path.resolve(args['design-system']);
    if (fs.existsSync(dsPath)) {
      const css = readUtf8(dsPath);
      const doc = hp.parseString(`<style>${css}</style>`);
      palette = hp.extractCssVariables(doc);
    }
  }
  const pageInventory = args['page-inventory'] ? path.resolve(args['page-inventory']) : null;

  // 逐页检查
  const perPage = [];
  let pagesChecked = 0, pagesSkipped = 0, pagesEmpty = 0, pagesTimeout = 0, pagesError = 0;
  let highFixable = 0, highUnfixable = 0, mediumLowCount = 0;
  const allFixes = [];
  let fixesApplied = 0, fixesFailed = 0;

  for (const p of pages) {
    const absPath = path.resolve(p);
    if (!fs.existsSync(absPath)) { pagesSkipped++; continue; }
    const stat = fs.statSync(absPath);
    if (stat.size === 0) { pagesEmpty++; continue; }
    pagesChecked++;
    try {
      let { checks, fixes } = checkPage(absPath, { mode, palette, pageInventory, autoFix });
      if (autoFix && fixes.length && !dryRun) {
        // 真实写盘管线：applyFixes → writeUtf8 → 复检
        const before = readUtf8(absPath);
        const r = applyFixes(before, fixes);
        fixesApplied += r.applied.length;
        fixesFailed += r.failed.length;
        for (const f of r.applied) allFixes.push({ page: path.basename(absPath), ...f, status: 'applied' });
        for (const f of r.failed) allFixes.push({ page: path.basename(absPath), ...f, status: 'failed' });
        for (const f of r.skipped) allFixes.push({ page: path.basename(absPath), ...f, status: 'skipped_noop' });
        if (r.applied.length > 0) {
          writeUtf8(absPath, r.content);
          // 复检：对写盘后的文件重跑，per_page 反映修复后状态
          const recheck = checkPage(absPath, { mode, palette, pageInventory, autoFix });
          checks = recheck.checks;
        }
      }
      perPage.push({ page: path.basename(absPath), checks });
      for (const c of checks) {
        if (c.severity === 'HIGH') {
          if (c.fixable) highFixable++; else highUnfixable++;
        } else {
          mediumLowCount++;
        }
      }
    } catch (e) {
      pagesError++;
    }
  }

  // 统一 path.resolve 归一化分隔符后再做路径推导（checkBApi 依赖 path.sep 字符串匹配，
  // 直接传入正斜杠路径（如 C:/…/prototype/working/…）会误判为 not_b_mode）
  const bApiStatus = checkBApi(pages.map(p => path.resolve(p)));

  // ===== 增量基线刷新：--auto-fix 修复落盘后更新 prototype/.last-check.json 被修复页条目 =====
  // 基线位于 prototype/ 级（非 working/ 内）：deploy 服务根为 working/、E 快照只复制 working/，天然隔离。
  // 基线不存在/损坏 → 静默跳过不创建（避免掩盖未知变化）。
  let baselineUpdatedPages = 0;
  if (autoFix && !dryRun && fixesApplied > 0) {
    const working = pages.map(p => path.resolve(p)).filter(a => a.indexOf(path.sep + 'working' + path.sep) >= 0);
    if (working.length > 0) {
      const prototypeDir = working[0].slice(0, working[0].indexOf(path.sep + 'working' + path.sep));
      const baselinePath = path.join(prototypeDir, '.last-check.json');
      if (fs.existsSync(baselinePath)) {
        try {
          const baseline = JSON.parse(readUtf8(baselinePath) || '{}');
          if (baseline && typeof baseline === 'object' && baseline.pages && typeof baseline.pages === 'object') {
            const applied = new Set(allFixes.filter(f => f.status === 'applied').map(f => f.page));
            for (const a of working) {
              if (!applied.has(path.basename(a))) continue;
              const idx = a.indexOf(path.sep + 'pages' + path.sep);
              const key = idx >= 0 ? a.slice(idx + path.sep.length + 'pages'.length + path.sep.length) : path.basename(a);
              let st; try { st = fs.statSync(a); } catch (e) { continue; }
              baseline.pages[key] = { mtime: Math.floor(st.mtimeMs / 1000), size: st.size };
              baselineUpdatedPages++;
            }
            if (baselineUpdatedPages > 0) {
              baseline.updatedAt = new Date().toISOString();
              writeUtf8(baselinePath, JSON.stringify(baseline, null, 2));
            }
          }
        } catch (e) { baselineUpdatedPages = 0; }
      }
    }
  }

  // ===== 标注规则覆盖检查（跨页聚合：spec.md R 编号 vs 全部页面标注 specRef 并集） =====
  // 二次读取须容错：读取失败已由逐页循环计入 pages_error，此处静默跳过（保持"致命错误返回空结果而非崩溃"契约）
  const annoPages = [];
  for (const p of pages) {
    try { if ((readUtf8(path.resolve(p)) || '').includes('../annotations-runtime.js')) annoPages.push(p); }
    catch (e) { /* 读取失败已计入 pages_error，跳过 */ }
  }
  if (annoPages.length > 0 && perPage.length > 0) {
    const workingDir = path.dirname(path.dirname(path.resolve(annoPages[0])));
    const specContent = readUtf8(path.join(workingDir, 'spec.md')) || '';
    const specRules = new Set();
    // spec 规则行标准格式 `- **R{n} 规则名**：描述`（R 编号与规则名一起加粗）或 `- R{n} 描述`
    for (const m of specContent.matchAll(/\*\*R(\d+)|(?:^|\s)R(\d+)[\s:：]/g)) {
      specRules.add(m[1] || m[2]);
    }
    const covered = new Set();
    const annDir = path.join(workingDir, 'annotations');
    if (fs.existsSync(annDir)) {
      for (const f of fs.readdirSync(annDir)) {
        if (!f.endsWith('.js')) continue;
        const dm = (readUtf8(path.join(annDir, f)) || '').match(/window\.PM_ANNOTATIONS_DATA\s*=\s*(\{[\s\S]*?\});/);
        if (!dm) continue;
        try {
          const d = JSON.parse(dm[1]);
          (d.items || []).forEach(it => { if (it.specRef) covered.add(String(it.specRef).replace(/^R/i, '')); });
        } catch (e) { /* JSON 非法已由 annotation_json_valid 覆盖 */ }
      }
    }
    const missing = [...specRules].filter(r => !covered.has(r));
    if (missing.length > 0) {
      // 挂到首个标注页名下（避免挂到无标注页误导定位）
      const annoIdx = perPage.findIndex(pp => annoPages.some(p => path.basename(path.resolve(p)) === pp.page));
      const target = annoIdx >= 0 ? perPage[annoIdx] : perPage[0];
      target.checks.push({
        id: 'annotation_spec_rules_covered', severity: 'MEDIUM', passed: false,
        description: `spec 规则未全部标注：R${missing.join('、R')} 无对应标注（specRef 缺失；R 规则无页面落点时除外）`, element: '', line: 0, fixable: false
      });
      // 计入 medium_low_count：该聚合项在逐页统计循环之后追加，不计入会导致"唯一问题是规则覆盖"时模板 C 不触发
      mediumLowCount++;
    }
  }

  ok({
    mode,
    pages_checked: pagesChecked,
    pages_skipped: pagesSkipped,
    pages_empty: pagesEmpty,
    pages_timeout: pagesTimeout,
    pages_error: pagesError,
    results: {
      high_fixable: highFixable,
      high_unfixable: highUnfixable,
      medium_low_count: mediumLowCount,
      b_mode_api_status: bApiStatus
    },
    per_page: perPage,
    fixes: allFixes,
    fixes_applied: fixesApplied,
    fixes_failed: fixesFailed,
    auto_fix_applied: fixesApplied > 0,
    baseline_updated: { pages: baselineUpdatedPages }
  });
}

main();
