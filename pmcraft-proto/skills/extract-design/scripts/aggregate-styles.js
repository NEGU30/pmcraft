#!/usr/bin/env node
/**
 * aggregate-styles.js — 项目全局样式聚合器（extract-design --project 模式的第 8 步）
 *
 * 轻量聚合框架项目的全局样式信息：扫描项目样式文件（CSS/SCSS/LESS/Vue <style> 块/
 * JSX/TSX 内联样式对象），提取 CSS 变量 / 色值 / 字体 / 间距 / 圆角，输出聚合 JSON，
 * 供 extend-html Phase 2 令牌校验与 design-reference 的"页面架构"维度使用。
 * 排除 node_modules / dist 等构建产物目录。
 *
 * 用法：
 *   node aggregate-styles.js --project-dir=<目录> [--out=<JSON 输出路径>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
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
const { readUtf8, toForwardSlashes } = require(path.join(sharedLib, 'encoding'));

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.idea', '.vscode', 'mock', 'public']);
const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

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

/** 递归收集样式相关文件（排除 IGNORE_DIRS） */
function collectStyleFiles(root) {
  const files = [];
  const walk = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(css|scss|less|vue|jsx|tsx)$/i.test(e.name)) files.push(p);
    }
  };
  walk(root);
  return files;
}

/** 提取一段 CSS 文本的令牌信息 */
function extractCssText(text) {
  const out = { css_variables: {}, colors: [], font_families: [], font_sizes: [], paddings: [], margins: [], gaps: [], border_radius: [] };
  // :root / * / html 块中的 CSS 变量
  const varBlockRe = /(?:^|[}\s])(:root|html|\*)\s*\{([^}]*)\}/g;
  let m;
  while ((m = varBlockRe.exec(text))) {
    for (const decl of m[2].split(';')) {
      const dm = /^\s*(--[\w-]+)\s*:\s*([^;]+)/.exec(decl);
      if (dm) out.css_variables[dm[1]] = dm[2].trim();
    }
  }
  // 颜色（hex）
  for (const c of text.matchAll(HEX_RE)) out.colors.push(c[0]);
  // 字体族/字号/间距/圆角
  for (const d of text.matchAll(/(?:^|[;{})\s])(font-family|font-size|padding|margin|gap|border-radius)\s*:\s*([^;{}]+)/gi)) {
    const key = d[1].toLowerCase();
    const val = d[2].trim();
    if (key === 'font-family') out.font_families.push(val.split(',')[0].trim().replace(/['"]/g, ''));
    else if (key === 'font-size') out.font_sizes.push(val);
    else if (key === 'padding') out.paddings.push(val);
    else if (key === 'margin') out.margins.push(val);
    else if (key === 'gap') out.gaps.push(val);
    else if (key === 'border-radius') out.border_radius.push(val);
  }
  return out;
}

/** 频率统计工具 */
function freq(items) {
  const map = {};
  for (const it of items) map[it] = (map[it] || 0) + 1;
  return Object.entries(map)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args['project-dir']) usage('缺少 --project-dir（项目目录）');
  const root = path.resolve(args['project-dir']);
  if (!fs.existsSync(root)) fail('项目目录不存在', root);

  const files = collectStyleFiles(root);
  const agg = {
    css_variables: {},
    colors: [],
    font_families: [],
    font_sizes: [],
    paddings: [],
    margins: [],
    gaps: [],
    border_radius: []
  };
  const style_files = [];

  for (const f of files) {
    let content;
    try { content = readUtf8(f); } catch (e) { continue; }
    const rel = path.relative(root, f).replace(/\\/g, '/');
    style_files.push(rel);
    if (/\.vue$/i.test(f)) {
      // Vue 单文件组件：提取 <style> 块
      for (const sm of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
        const r = extractCssText(sm[1]);
        merge(agg, r);
      }
    } else if (/\.(jsx|tsx)$/i.test(f)) {
      // JSX/TSX：style={{...}} 内联对象 + 模板字符串 CSS
      for (const sm of content.matchAll(/style=\{\{\s*([\s\S]*?)\}\}/g)) {
        const r = extractInlineObject(sm[1]);
        merge(agg, r);
      }
      for (const sm of content.matchAll(/`([\s\S]*?(?:color|background|font-family|padding|margin|gap|border-radius)[\s\S]*?)`/g)) {
        const r = extractCssText(sm[1]);
        merge(agg, r);
      }
    } else {
      // CSS/SCSS/LESS
      const r = extractCssText(content);
      merge(agg, r);
    }
  }

  function merge(target, r) {
    Object.assign(target.css_variables, r.css_variables);
    for (const k of ['colors', 'font_families', 'font_sizes', 'paddings', 'margins', 'gaps', 'border_radius']) {
      target[k].push(...r[k]);
    }
  }

  /** JSX style={{...}} 内联对象：提取 color/background 等色值与 fontSize 等 */
  function extractInlineObject(js) {
    const r = { css_variables: {}, colors: [], font_families: [], font_sizes: [], paddings: [], margins: [], gaps: [], border_radius: [] };
    const norm = js.replace(/'/g, '"');
    for (const c of norm.matchAll(HEX_RE)) r.colors.push(c[0]);
    const fm = /fontFamily\s*:\s*["']([^"']+)["']/i.exec(norm);
    if (fm) r.font_families.push(fm[1]);
    const fs = /fontSize\s*:\s*(\d+)\.?\d*\s*px?/i.exec(norm);
    if (fs) r.font_sizes.push(fs[1] + 'px');
    const bd = /borderRadius\s*:\s*(\d+)\.?\d*\s*px?/i.exec(norm);
    if (bd) r.border_radius.push(bd[1] + 'px');
    return r;
  }

  const result = {
    project_dir: toForwardSlashes(root),
    style_file_count: style_files.length,
    style_files: style_files.slice(0, 100),
    css_variables: agg.css_variables,
    colors: freq(agg.colors).slice(0, 20),
    typography: {
      font_families: freq(agg.font_families).slice(0, 10),
      font_sizes: freq(agg.font_sizes).slice(0, 10)
    },
    spacing: {
      padding_values: freq(agg.paddings).slice(0, 10),
      margin_values: freq(agg.margins).slice(0, 10),
      gap_values: freq(agg.gaps).slice(0, 5)
    },
    decoration: {
      border_radius: freq(agg.border_radius).slice(0, 10)
    }
  };

  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const { writeUtf8 } = require(path.join(sharedLib, 'encoding'));
    writeUtf8(outPath, JSON.stringify(result, null, 2) + '\n');
    ok({ status: 'ok', out_file: toForwardSlashes(outPath), style_file_count: style_files.length });
  } else {
    ok(result);
  }
}

main();
