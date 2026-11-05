#!/usr/bin/env node
/**
 * bundle-icons.js — 图标库打包脚本
 *
 * 将每个图标库的 svg 源文件合并为单个 bundle.json（每库一个，进 git/随项目分发），
 * 键集与 {lib}/icons.json 完全一致（icons.json 是唯一来源）。
 *
 * 用法：
 *   node bundle-icons.js               # 打包全部 6 库
 *   node bundle-icons.js tabler        # 只打指定库
 *   node bundle-icons.js --verify [lib...]  # 校验模式（不落盘）
 *
 * 源目录双路径探测：优先项目内 _shared/icons/{lib}/svg/，
 * 否则用备份目录 C:\dev\pmcraft\_icon\{lib}\svg\（源文件已移出项目备份）。
 * 纯 Node stdlib，无任何依赖。Node >= 18。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = __dirname;
const ICONS_DIR = path.join(SCRIPTS_DIR, '..', 'icons');
const BACKUP_ROOT = 'C:\\dev\\pmcraft\\_icon'; // 源文件备份根（源文件已移出项目）

// 已知 6 库（打包顺序固定）
const LIBS = ['tabler', 'bootstrap', 'lucide', 'phosphor', 'iconoir', 'feather'];

/** 解析某库的 svg 源目录：项目内优先，其次备份目录 */
function resolveSvgDir(lib) {
  const inProject = path.join(ICONS_DIR, lib, 'svg');
  if (fs.existsSync(inProject)) return inProject;
  const inBackup = path.join(BACKUP_ROOT, lib, 'svg');
  if (fs.existsSync(inBackup)) return inBackup;
  return null;
}

/** 去除 SVG 顶部注释（如 Tabler 的 tags/unicode/version 元数据注释）并 trim */
function stripHeaderComment(content) {
  return content.replace(/^<!--[\s\S]*?-->\s*/, '').trim();
}

/** 打包单个库，返回 { lib, count, rawBytes, bundleBytes, sourceDir } 摘要 */
function bundleLib(lib) {
  const svgDir = resolveSvgDir(lib);
  if (!svgDir) {
    throw new Error(`[${lib}] 找不到 svg 源目录（项目内 ${path.join(ICONS_DIR, lib, 'svg')} 与备份 ${path.join(BACKUP_ROOT, lib, 'svg')} 均不存在）`);
  }

  const indexPath = path.join(ICONS_DIR, lib, 'icons.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`[${lib}] 缺少名称索引 ${indexPath}`);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const names = Object.keys(index); // 键序 = icons.json 序（字母序），bundle 保持一致

  let rawBytes = 0;
  const lines = names.map((name) => {
    const rel = index[name]; // 形如 "svg/search.svg"
    const file = path.join(svgDir, path.basename(rel)); // 源目录 = resolveSvgDir 探测结果（项目内或备份）
    const content = stripHeaderComment(fs.readFileSync(file, 'utf8'));
    rawBytes += content.length;
    return JSON.stringify(name) + ': ' + JSON.stringify(content);
  });

  const output = '{\n' + lines.join(',\n') + '\n}\n';
  const bundleBytes = Buffer.byteLength(output, 'utf8');

  // 写前自检：键数一致
  if (names.length !== Object.keys(index).length) {
    throw new Error(`[${lib}] 键数不一致：icons.json ${Object.keys(index).length} 条 vs 打包 ${names.length} 条，中止不落盘`);
  }

  const outPath = path.join(ICONS_DIR, lib, 'bundle.json');
  const tmpPath = outPath + '.tmp';
  fs.writeFileSync(tmpPath, output, 'utf8');
  fs.renameSync(tmpPath, outPath); // 原子替换，防崩溃产生半截 bundle

  // 落盘后轻量自验：重读键集相等
  const back = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  if (Object.keys(back).length !== names.length) {
    throw new Error(`[${lib}] 落盘自验失败：bundle 键数 ${Object.keys(back).length} ≠ 期望 ${names.length}`);
  }

  return { lib, count: names.length, rawBytes, bundleBytes, sourceDir: svgDir };
}

/** 校验模式：键集相等 + 逐条内容比对（与源文件去注释后一致） */
function verifyLib(lib) {
  const bundlePath = path.join(ICONS_DIR, lib, 'bundle.json');
  if (!fs.existsSync(bundlePath)) {
    console.error(`[${lib}] 缺少 bundle.json，先运行打包`);
    return false;
  }
  const svgDir = resolveSvgDir(lib);
  if (!svgDir) {
    console.error(`[${lib}] 找不到 svg 源目录，无法逐条比对（键集校验仍可进行）`);
    // 无源时降级为键集校验
  }

  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(ICONS_DIR, lib, 'icons.json'), 'utf8'));
  const bundleKeys = Object.keys(bundle);
  const indexKeys = Object.keys(index);

  let ok = true;
  if (bundleKeys.length !== indexKeys.length) {
    console.error(`[${lib}] 键数不一致：bundle ${bundleKeys.length} vs icons.json ${indexKeys.length}`);
    ok = false;
  }
  // 键集相等（不考虑顺序）
  const indexSet = new Set(indexKeys);
  const missing = bundleKeys.filter((k) => !indexSet.has(k));
  const extra = indexKeys.filter((k) => !(k in bundle));
  if (missing.length || extra.length) {
    if (missing.length) console.error(`[${lib}] bundle 多余键 ${missing.length} 个（如 ${missing.slice(0, 3).join(', ')}）`);
    if (extra.length) console.error(`[${lib}] bundle 缺失键 ${extra.length} 个（如 ${extra.slice(0, 3).join(', ')}）`);
    ok = false;
  }

  if (svgDir) {
    let mismatches = 0;
    for (const name of bundleKeys) {
      const rel = index[name];
      if (!rel) continue;
      const file = path.join(svgDir, path.basename(rel)); // 源目录 = resolveSvgDir 探测结果（项目内或备份）
      if (!fs.existsSync(file)) { console.error(`[${lib}] 源文件缺失: ${rel}`); mismatches++; continue; }
      const expected = stripHeaderComment(fs.readFileSync(file, 'utf8'));
      if (bundle[name] !== expected) {
        if (mismatches < 5) console.error(`[${lib}] 内容不一致: ${name}`);
        mismatches++;
      }
    }
    if (mismatches) { console.error(`[${lib}] 共 ${mismatches} 条内容不一致`); ok = false; }
  }

  return ok;
}

function humanSize(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + 'MB';
}

function main() {
  const args = process.argv.slice(2);
  const isVerify = args.includes('--verify');
  // 未知 flag 一律报错，避免拼错参数导致误触发全量打包
  const unknownFlags = args.filter((a) => a.startsWith('--') && a !== '--verify');
  if (unknownFlags.length) {
    console.error(`未知参数 ${unknownFlags.join(' ')}（仅支持 --verify）`);
    process.exit(2);
  }
  const libs = args.filter((a) => a !== '--verify');

  if (isVerify) {
    const targets = libs.length ? libs : LIBS;
    let allOk = true;
    for (const lib of targets) {
      try {
        const ok = verifyLib(lib);
        console.error(`[${lib}] ${ok ? 'OK ✓' : 'FAIL ✗'}`);
        if (!ok) allOk = false;
      } catch (e) {
        console.error(`[${lib}] FAIL ✗ ${e.message}`);
        allOk = false;
      }
    }
    process.exit(allOk ? 0 : 1);
  }

  const targets = libs.length ? libs : LIBS;
  // 校验库名合法性
  for (const lib of targets) {
    if (!LIBS.includes(lib)) {
      console.error(`未知库名 "${lib}"，可用：${LIBS.join(' / ')}`);
      process.exit(2);
    }
  }

  let failed = false;
  for (const lib of targets) {
    try {
      const r = bundleLib(lib);
      console.error(`[${r.lib}] ${r.count} icons, raw ${humanSize(r.rawBytes)} → bundle.json ${humanSize(r.bundleBytes)} (源: ${r.sourceDir})`);
    } catch (e) {
      console.error(e.message);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
