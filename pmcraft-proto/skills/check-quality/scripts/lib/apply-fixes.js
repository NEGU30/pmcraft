/**
 * apply-fixes.js — check-quality 自动修复的写盘管线（纯函数，可单测）
 *
 * 解决原 check-quality auto-fix "纸面修复"问题（fixes 只进 JSON 不写盘）。
 * 支持三种修复 kind：
 *   - 'replace'       字符串替换（如颜色值，大小写不敏感 + 计数）
 *   - 'append-style'  追加 CSS 规则到最后一个 </style> 前（幂等守卫：内容已含则 skipped_noop）
 *   - 'insert-before' 在匹配元素前插入内容（如 <label for="...">）
 *
 * 设计原则：
 *   - applied 为 0 时不写盘（防御性，避免无谓文件触碰）
 *   - 每条 fix 返回 status: 'applied' | 'failed' | 'skipped_noop'
 *   - 幂等：对已修复的内容二次应用，同类 fix 不再产生
 */
'use strict';

/**
 * kind='replace'：大小写不敏感替换 + 计数
 * @param {string} content 原始内容
 * @param {string} original 要替换的原文
 * @param {string} replacement 替换为
 * @returns {{count:number, content:string}}
 */
function replaceAll(content, original, replacement) {
  if (!original) return { count: 0, content };
  const re = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let count = 0;
  const out = content.replace(re, () => { count++; return replacement; });
  return { count, content: out };
}

/**
 * kind='append-style'：追加 CSS 规则到最后一个 </style> 前（幂等）
 * @returns {{applied:boolean, skippedNoop:boolean, content:string}}
 */
function appendStyle(content, ruleText) {
  if (!ruleText) return { applied: false, skippedNoop: false, content };
  // 幂等守卫：内容已含该规则文本 → 不重复追加
  if (content.includes(ruleText)) return { applied: false, skippedNoop: true, content };
  const styleClose = content.lastIndexOf('</style>');
  if (styleClose >= 0) {
    const out = content.slice(0, styleClose) + ruleText + '\n' + content.slice(styleClose);
    return { applied: true, skippedNoop: false, content: out };
  }
  // 无 style 块 → 在 </head> 前插入新块（或文档头部）
  const headClose = content.lastIndexOf('</head>');
  if (headClose >= 0) {
    const styleBlock = `<style>\n${ruleText}\n</style>\n`;
    return { applied: true, skippedNoop: false, content: content.slice(0, headClose) + styleBlock + content.slice(headClose) };
  }
  return { applied: false, skippedNoop: false, content };
}

/**
 * kind='insert-before'：基于 id 正则定位元素，在其前插入内容
 * @param {string} content 原始内容
 * @param {string} elementId 目标元素 id
 * @param {string} insertText 插入内容（如 <label for="...">...</label>）
 * @returns {{applied:boolean, skippedNoop:boolean, content:string}}
 */
function insertBeforeId(content, elementId, insertText) {
  if (!elementId || !insertText) return { applied: false, skippedNoop: false, content };
  // 匹配 <input ... id="xxx" ...>（自闭合/带斜杠皆可），不匹配 <input ... id="xxx-prefix"
  const re = new RegExp(`<\\s*(input|select|textarea)\\b[^>]*\\bid=["']${elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  const m = re.exec(content);
  if (!m) return { applied: false, skippedNoop: false, content };
  // 包裹守卫：目标元素已被 <label> 包裹（implicit label，任意深度祖先）→ 跳过，避免 label 嵌套 label
  const head = content.slice(0, m.index);
  const lastLabelOpen = head.lastIndexOf('<label');
  const lastLabelClose = head.lastIndexOf('</label>');
  if (lastLabelOpen > lastLabelClose) return { applied: false, skippedNoop: true, content };
  const out = content.slice(0, m.index) + insertText + content.slice(m.index);
  return { applied: true, skippedNoop: false, content: out };
}

/**
 * 应用一组 fix 到内容。fix 条目：
 *   { issue, kind: 'replace'|'append-style'|'insert-before', original?, replacement?, insertId?, insertText?, reason }
 * @param {string} content 原始 HTML 内容
 * @param {Array} fixes 待应用的 fix 列表
 * @returns {{content:string, applied:Array, failed:Array, skipped:Array}}
 */
function applyFixes(content, fixes) {
  let out = content;
  const applied = [];
  const failed = [];
  const skipped = [];
  for (const f of fixes) {
    switch (f.kind) {
      case 'replace': {
        const { count, content: nc } = replaceAll(out, f.original, f.replacement);
        if (count > 0) {
          out = nc;
          applied.push({ issue: f.issue, original: f.original, replacement: f.replacement, count, reason: f.reason });
        } else {
          failed.push({ issue: f.issue, original: f.original, reason: '原文未找到，可能已被其他 fix 覆盖' });
        }
        break;
      }
      case 'append-style': {
        const r = appendStyle(out, f.replacement);
        if (r.applied) {
          out = r.content;
          applied.push({ issue: f.issue, replacement: f.replacement, reason: f.reason });
        } else if (r.skippedNoop) {
          skipped.push({ issue: f.issue, reason: '内容已包含该样式规则，跳过（幂等）' });
        } else {
          failed.push({ issue: f.issue, reason: '找不到 </style> 或 </head> 插入点' });
        }
        break;
      }
      case 'insert-before': {
        const r = insertBeforeId(out, f.insertId, f.insertText);
        if (r.applied) {
          out = r.content;
          applied.push({ issue: f.issue, insertId: f.insertId, insertText: f.insertText, reason: f.reason });
        } else if (r.skippedNoop) {
          skipped.push({ issue: f.issue, insertId: f.insertId, reason: '目标元素已被 label 包裹（implicit label），跳过' });
        } else {
          failed.push({ issue: f.issue, insertId: f.insertId, reason: '找不到目标元素（id 不存在或格式不符）' });
        }
        break;
      }
      default:
        failed.push({ issue: f.issue, reason: `未知 kind: ${f.kind}` });
    }
  }
  return { content: out, applied, failed, skipped };
}

module.exports = { applyFixes, replaceAll, appendStyle, insertBeforeId };
