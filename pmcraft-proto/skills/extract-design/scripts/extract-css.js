#!/usr/bin/env node
/**
 * extract-css.js — CSS 精确提取器（extract-design 的 HTML 路径，替代 LLM 手动当 CSS parser）
 *
 * 从 HTML 文件提取结构化设计数据：色值（hex/rgb/hsl + 频率）、CSS 变量（:root）、
 * 字体族/字号/字重、间距、圆角/阴影、组件库识别、DOM 布局标签、资源 URL。
 * 输出 JSON 供 AI 做风格判断。图片路径保留 AI（多模态）。
 *
 * 用法：
 *   node extract-css.js --html=<HTML路径> [--external-css=<目录>] [--dry-run]
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
const { readUtf8 } = require(path.join(sharedLib, 'encoding'));
const hp = require(path.join(sharedLib, 'html-parser'));

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
  if (!args.html) usage('缺少 --html（HTML 文件路径）');
  const htmlPath = path.resolve(args.html);
  if (!fs.existsSync(htmlPath)) fail('HTML 文件不存在', htmlPath);

  const doc = hp.parseFile(htmlPath);

  // ---- 1. 色值提取（含频率）----
  const hexValues = [];
  const rgbValues = [];
  const hslValues = [];
  const cssVarRefs = [];
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      for (const val of Object.values(rule.declarations)) {
        for (const c of hp.extractColors(val)) {
          if (c.value.startsWith('#')) hexValues.push(c.normalized);
          else if (/^rgba?\(/i.test(c.value)) rgbValues.push(c.value);
          else if (/^hsla?\(/i.test(c.value)) hslValues.push(c.value);
        }
        for (const vm of val.matchAll(/var\((--[\w-]+)/g)) cssVarRefs.push(vm[1]);
      }
    }
  }
  for (const t of doc.tags) {
    if (t.attrs.style) {
      for (const val of Object.values(hp.parseInlineStyle(t.attrs.style))) {
        for (const c of hp.extractColors(val)) {
          if (c.value.startsWith('#')) hexValues.push(c.normalized);
          else if (/^rgba?\(/i.test(c.value)) rgbValues.push(c.value);
        }
      }
    }
  }

  // ---- 2. CSS 变量（:root）----
  const cssVariables = Object.entries(hp.extractCssVariables(doc)).map(([name, value]) => ({ name, value }));

  // ---- 3. 字体 ----
  const fontFamilies = [];
  const fontSizes = [];
  const fontWeights = [];
  const lineHeights = [];
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      const d = rule.declarations;
      if (d['font-family']) fontFamilies.push(d['font-family'].split(',')[0].trim().replace(/['"]/g, ''));
      if (d['font-size']) fontSizes.push(d['font-size']);
      if (d['font-weight']) fontWeights.push(d['font-weight']);
      if (d['line-height']) lineHeights.push(d['line-height']);
    }
  }

  // ---- 4. 间距 ----
  const paddings = [];
  const margins = [];
  const gaps = [];
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      const d = rule.declarations;
      if (d.padding) paddings.push(d.padding);
      if (d.margin) margins.push(d.margin);
      if (d.gap) gaps.push(d.gap);
    }
  }

  // ---- 5. 装饰（圆角/阴影）----
  const borderRadii = [];
  const boxShadows = [];
  for (const block of doc.styleBlocks) {
    for (const rule of block.rules) {
      const d = rule.declarations;
      if (d['border-radius']) borderRadii.push(d['border-radius']);
      if (d['box-shadow']) boxShadows.push(d['box-shadow']);
    }
  }

  // ---- 6. 组件库识别 ----
  const lib = hp.detectComponentLibrary(doc);

  // ---- 7. DOM 布局 ----
  const layout = hp.detectDomLayout(doc);

  // ---- 8. 资源 URL ----
  const assetUrls = doc.linkHrefs.filter(u => /\.(png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|css)$/i.test(u));

  ok({
    input_path: htmlPath.replace(/\\/g, '/'),
    colors: {
      hex_values: freq(hexValues).slice(0, 20),
      rgb_rgba: freq(rgbValues).slice(0, 10),
      hsl_hsla: freq(hslValues).slice(0, 10),
      css_variables: cssVariables.slice(0, 30)
    },
    typography: {
      font_families: freq(fontFamilies).slice(0, 10),
      font_sizes: freq(fontSizes).slice(0, 10),
      font_weights: freq(fontWeights).slice(0, 5),
      line_heights: freq(lineHeights).slice(0, 5)
    },
    spacing: {
      padding_values: freq(paddings).slice(0, 10),
      margin_values: freq(margins).slice(0, 10),
      gap_values: freq(gaps).slice(0, 5)
    },
    decoration: {
      border_radius: freq(borderRadii).slice(0, 10),
      box_shadow: freq(boxShadows).slice(0, 5)
    },
    component_library: lib,
    dom_layout: layout,
    image_assets: {
      urls: assetUrls.slice(0, 20),
      local_count: assetUrls.filter(u => !/^https?:/.test(u)).length,
      remote_count: assetUrls.filter(u => /^https?:/.test(u)).length
    }
  });
}

main();
