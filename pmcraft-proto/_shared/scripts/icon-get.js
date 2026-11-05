#!/usr/bin/env node
/**
 * icon-get.js — 图标查询脚本（build-prototype 生成原型时取内联 SVG 内容）
 *
 * stdout 只有 SVG 正文（可直接内联进 HTML），日志/错误全部走 stderr。
 * 内容来自 {lib}/bundle.json（打包时已剔除顶部注释）。
 *
 * 用法：
 *   node icon-get.js {lib} {图标名}          # stdout = SVG 正文；exit 0
 *   node icon-get.js {lib} --list {子串}     # 名称索引模糊查，一行一个
 *   node icon-get.js --libs                  # 列出 6 库及图标数
 *
 * 退出码：0 命中；1 名称未命中（stderr 附相近名称前 5 个）；2 非法库名/参数错误。
 * 纯 Node stdlib，无任何依赖。Node >= 18。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = __dirname;
const ICONS_DIR = path.join(SCRIPTS_DIR, '..', 'icons');

// 已知 6 库（与 bundle-icons.js 一致）
const LIBS = ['tabler', 'bootstrap', 'lucide', 'phosphor', 'iconoir', 'feather'];

function isLib(lib) {
  return LIBS.includes(lib);
}

/** 读某库 bundle.json（键 = 图标名，值 = SVG 正文）；文件损坏时友好报错并 exit 2 */
function loadBundle(lib) {
  const file = path.join(ICONS_DIR, lib, 'bundle.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[${lib}] bundle.json 解析失败（文件损坏或未完整打包）：${file}`);
    process.exit(2);
  }
}

/** 读某库 icons.json（名称索引，小文件；--list 用它避免加载大 bundle）；文件损坏时友好报错并 exit 2 */
function loadIndex(lib) {
  const file = path.join(ICONS_DIR, lib, 'icons.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[${lib}] icons.json 解析失败（文件损坏）：${file}`);
    process.exit(2);
  }
}

/** 编辑距离（快速剪枝：长度差 > 2 直接返回 Infinity） */
function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return Infinity;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...Array(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** 相近名称：子串匹配优先，其次编辑距离 <= 2 的模糊匹配，共取前 5 个 */
function suggestSimilar(names, query) {
  const exact = names.filter((n) => n.includes(query)).slice(0, 5);
  if (exact.length >= 5) return exact;
  const fuzzy = names
    .filter((n) => !n.includes(query))
    .map((n) => ({ n, d: editDistance(n, query) }))
    .filter((x) => x.d > 0 && x.d <= 2)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5 - exact.length)
    .map((x) => x.n);
  return exact.concat(fuzzy);
}

function listLibs() {
  for (const lib of LIBS) {
    const idx = loadIndex(lib);
    const count = idx ? Object.keys(idx).length : 0;
    console.error(`[${lib}] ${count} icons`);
  }
}

function listIcons(lib, substr) {
  const idx = loadIndex(lib);
  if (!idx) {
    console.error(`[${lib}] 缺少 icons.json（${path.join(ICONS_DIR, lib, 'icons.json')}）`);
    process.exit(2);
  }
  const names = Object.keys(idx);
  const filtered = substr ? names.filter((n) => n.includes(substr)) : names;
  if (!filtered.length) {
    console.error(`[${lib}] 无匹配 "${substr}" 的图标名`);
    process.exit(1);
  }
  for (const n of filtered) console.log(n);
}

function getIcon(lib, name) {
  const bundle = loadBundle(lib);
  if (!bundle) {
    console.error(`[${lib}] 缺少 bundle.json（${path.join(ICONS_DIR, lib, 'bundle.json')}），请先运行 bundle-icons.js 打包`);
    process.exit(2);
  }
  const content = bundle[name];
  if (content === undefined) {
    const idx = loadIndex(lib);
    const allNames = idx ? Object.keys(idx) : Object.keys(bundle);
    const hints = suggestSimilar(allNames, name);
    const hintText = hints.length ? `，相近名称：${hints.join(' / ')}` : '';
    console.error(`[${lib}] 未找到图标 "${name}"${hintText}`);
    process.exit(1);
  }
  console.log(content);
}

function main() {
  const args = process.argv.slice(2);

  // --libs
  if (args.length === 1 && args[0] === '--libs') {
    listLibs();
    return;
  }

  // 参数数量校验
  if (args.length < 2) {
    console.error('用法：node icon-get.js {lib} {图标名}   |   node icon-get.js {lib} --list {子串}   |   node icon-get.js --libs');
    process.exit(2);
  }

  const lib = args[0];
  if (!isLib(lib)) {
    console.error(`未知库名 "${lib}"，可用：${LIBS.join(' / ')}`);
    process.exit(2);
  }

  // --list 模式
  if (args[1] === '--list') {
    listIcons(lib, args[2] || '');
    return;
  }

  // 普通取内容：名称去掉 .svg 后缀并 trim
  const name = args[1].trim().replace(/\.svg$/i, '');
  getIcon(lib, name);
}

main();
