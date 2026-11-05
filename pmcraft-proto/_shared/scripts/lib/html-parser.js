/**
 * html-parser.js — 零依赖 HTML/CSS 轻量解析器
 *
 * 供 check-quality.js 和 extract-css.js 共用。纯正则 + 状态机，不引入 cheerio/jsdom。
 * 设计目标：覆盖 build-prototype 生成的规范 HTML 页面（结构良好、使用 CSS 变量）。
 * 畸形 HTML 可能误判——调用方用 error_count 标记跳过，不阻断。
 */
'use strict';
const fs = require('fs');

/** 规范化 hex：去掉 #、转小写、3 位展开为 6 位 */
function normalizeHex(h) {
  let s = String(h).trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/.test(s) ? s : null;
}

/**
 * 剔除 gradient(...) 函数体（含嵌套括号配平）。
 * 用于 skipGradients 模式：渐变色（如手机壳线性渐变 #2a2a2c）是设计意图，
 * 不应被当作"偏离色板"的普通颜色。缺省不启用，保持 extract-css 行为不变。
 */
function stripGradientFns(text) {
  let out = '', rest = text, idx;
  const re = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;
  while ((idx = re.exec(rest))) {
    out += rest.slice(0, idx.index);
    // 从 '(' 起括号配平扫描到 depth 0
    let depth = 0, j = idx.index + idx[0].length - 1;
    for (; j < rest.length; j++) {
      if (rest[j] === '(') depth++;
      else if (rest[j] === ')') { depth--; if (depth === 0) { j++; break; } }
    }
    rest = rest.slice(j);
  }
  return out + rest;
}

/** 提取颜色值（hex/rgb/rgba/hsl/hsla），返回 {value, normalized}。opts.skipGradients 时剔除 gradient 函数体内颜色 */
function extractColors(text, opts) {
  opts = opts || {};
  if (opts.skipGradients) text = stripGradientFns(text);
  const colors = [];
  const hexRe = /#([0-9a-fA-F]{3,8})\b/g;
  let m;
  while ((m = hexRe.exec(text)) !== null) {
    const norm = normalizeHex(m[1]);
    if (norm) colors.push({ value: `#${m[1]}`, normalized: norm });
  }
  const funcRe = /(rgba?|hsla?)\(([^)]+)\)/gi;
  while ((m = funcRe.exec(text)) !== null) {
    colors.push({ value: m[0], normalized: m[0].toLowerCase().replace(/\s+/g, '') });
  }
  return colors;
}

/** 解析 style="..." 属性为 {prop: value} 对象 */
function parseInlineStyle(styleStr) {
  const out = {};
  const re = /([\w-]+)\s*:\s*([^;"]+)/g;
  let m;
  while ((m = re.exec(styleStr)) !== null) {
    out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

/** 解析 CSS 声明块 "{...}" 为 {prop: value} */
function parseDeclarations(block) {
  const out = {};
  const re = /([\w-]+)\s*:\s*([^;]+)/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

/** 解析 <style> 块为规则数组 [{selector, declarations, pseudo, media}] */
function parseStyleBlock(raw, media) {
  const rules = [];
  // 去除注释
  const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(cleaned)) !== null) {
    const selector = m[1].trim();
    if (!selector) continue;
    const declarations = parseDeclarations(m[2]);
    rules.push({
      selector,
      declarations,
      /* 注意：长备选（focus-visible）必须排在短备选（focus）前——JS 正则 alternation 顺序优先，
         focus 是 focus-visible 的前缀，顺序颠倒会导致 *:focus-visible 被解析成 'focus' */
      pseudo: /:(focus-visible|hover|focus|active|disabled|visited)/.exec(selector)
        ? (/:(focus-visible|hover|focus|active|disabled|visited)/.exec(selector))[1]
        : null,
      media: media || null
    });
  }
  return rules;
}

/** 主解析器：输入 HTML 字符串，返回文档对象 */
function parseString(html) {
  const doc = {
    html,
    tags: [],        // [{tagName, attrs, innerText, depth, parentTag, selfClosing}]
    styleBlocks: [], // [{media, rules}]
    scriptBlocks: [],// [{raw}]
    linkHrefs: [],   // <link href> / <img src> / url() 资源
    errorCount: 0
  };

  // ---- 1. 提取 <style> 块（含 media） ----
  const styleRe = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const mediaMatch = /media=["']([^"']*)["']/.exec(attrs);
    const media = mediaMatch ? mediaMatch[1] : null;
    doc.styleBlocks.push({ media, rules: parseStyleBlock(m[2], media) });
  }

  // ---- 2. 提取 <script> 块 ----
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRe.exec(html)) !== null) {
    doc.scriptBlocks.push({ raw: m[1] });
  }

  // ---- 3. 标签遍历（构建简树） ----
  const tagRe = /<\s*(\/?)([\w-]+)([^>]*?)(\/?)>/g;
  const stack = [];
  let lastIndex = 0;
  while ((m = tagRe.exec(html)) !== null) {
    const closing = m[1] === '/';
    const tagName = m[2].toLowerCase();
    const attrsStr = m[3];
    const selfClosing = m[4] === '/' || /^(br|img|input|hr|meta|link|source|wbr)$/.test(tagName);

    if (closing) {
      // 闭合标签：找到栈中最近的同名标签
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName === tagName) {
          // 计算 innerText（从该标签开始到闭合位置的文本）
          const openPos = stack[i]._pos;
          const text = html.slice(openPos, m.index).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          stack[i].innerText = text;
          stack.splice(i, 1);
          break;
        }
      }
      continue;
    }

    // 解析属性
    const attrs = {};
    const attrRe = /([\w:-]+)(?:=["']([^"']*)["']|=["']?([^\s>]+)["']?)?/g;
    let am;
    while ((am = attrRe.exec(attrsStr)) !== null) {
      attrs[am[1].toLowerCase()] = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : '');
    }

    const depth = stack.length;
    const parentTag = stack.length ? stack[stack.length - 1].tagName : null;
    const el = { tagName, attrs, innerText: '', depth, parentTag, selfClosing, _pos: m.index };
    doc.tags.push(el);
    if (!selfClosing) {
      stack.push(el);
    }
    lastIndex = m.index;
  }
  // 清理内部字段
  for (const t of doc.tags) delete t._pos;

  // ---- 4. 资源 URL 扫描 ----
  const urlRe = /(?:src|href)=["']([^"']+)["']/gi;
  while ((m = urlRe.exec(html)) !== null) {
    const u = m[1];
    if (/^(https?:|data:|javascript:|#)/.test(u)) continue;
    doc.linkHrefs.push(u);
  }
  const cssUrlRe = /url\(["']?([^"')]+)["']?\)/g;
  while ((m = cssUrlRe.exec(html)) !== null) {
    doc.linkHrefs.push(m[1]);
  }

  return doc;
}

/** 解析 HTML 文件 */
function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseString(content);
}

// ---- 便捷查询方法（挂到 doc 上） ----
function getElementsByTagName(doc, name) {
  return doc.tags.filter(t => t.tagName === name.toLowerCase());
}

function getElementsByClassName(doc, cls) {
  const classes = cls.split(/\s+/).filter(Boolean);
  return doc.tags.filter(t => {
    const elClasses = (t.attrs.class || '').split(/\s+/).filter(Boolean);
    return classes.every(c => elClasses.includes(c));
  });
}

function getAllColors(doc, opts) {
  // 从 style 块 + 内联 style 提取颜色
  const out = [];
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      for (const [prop, val] of Object.entries(rule.declarations)) {
        if (/(color|background|border)/.test(prop)) {
          for (const c of extractColors(val, opts)) out.push({ ...c, source: 'stylesheet', selector: rule.selector, prop });
        }
      }
    }
  }
  for (const t of doc.tags) {
    if (t.attrs.style) {
      const styles = parseInlineStyle(t.attrs.style);
      for (const [prop, val] of Object.entries(styles)) {
        if (/(color|background|border)/.test(prop)) {
          for (const c of extractColors(val, opts)) out.push({ ...c, source: 'inline', element: t.tagName, prop });
        }
      }
    }
  }
  return out;
}

/** 提取 :root / * CSS 变量定义 */
function extractCssVariables(doc) {
  const vars = {};
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      if (/^:root|^\*|^:host/.test(rule.selector)) {
        for (const [prop, val] of Object.entries(rule.declarations)) {
          if (prop.startsWith('--')) vars[prop] = val;
        }
      }
    }
  }
  return vars;
}

/** 检测组件库（class 前缀匹配） */
function detectComponentLibrary(doc) {
  const classCounts = {};
  for (const t of doc.tags) {
    const cls = t.attrs.class || '';
    for (const c of cls.split(/\s+/)) {
      if (!c) continue;
      const prefix = /^(el|ant|tw|mdc|v|ivu|bs|layui|bootstrap)-/.exec(c);
      if (prefix) classCounts[prefix[1]] = (classCounts[prefix[1]] || 0) + 1;
    }
  }
  const libMap = {
    el: 'element-ui', ant: 'ant-design', tw: 'tailwind', mdc: 'material-design',
    v: 'vuetify', ivu: 'iview', bs: 'bootstrap', bootstrap: 'bootstrap', layui: 'layui'
  };
  let best = null;
  let bestCount = 0;
  for (const [prefix, count] of Object.entries(classCounts)) {
    if (count > bestCount) { bestCount = count; best = prefix; }
  }
  if (!best) return { detected: null, confidence: 'none', evidence: [] };
  return {
    detected: libMap[best] || best,
    confidence: bestCount >= 3 ? 'high' : 'medium',
    evidence: Object.entries(classCounts).map(([p, c]) => `${p}-* x${c}`)
  };
}

/** 语义布局标签检测 */
function detectDomLayout(doc) {
  const semantic = ['header', 'nav', 'main', 'aside', 'footer', 'section', 'article'];
  const found = [];
  for (const t of doc.tags) {
    if (semantic.includes(t.tagName) && !found.includes(t.tagName)) found.push(t.tagName);
  }
  return { tags: found, has_landmarks: found.length > 0 };
}

module.exports = {
  parseString, parseFile,
  getElementsByTagName, getElementsByClassName,
  getAllColors, extractCssVariables, detectComponentLibrary, detectDomLayout,
  extractColors, parseInlineStyle, parseDeclarations, normalizeHex
};
