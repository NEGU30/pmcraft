/**
 * version-scanner.js — 版本目录扫描
 *
 * 匹配 [Vv]?\d+\.\d+\.\d+ 格式的版本目录（如 1.0.0、V2.1.0）。
 * 供 initialize-structure / save-version / save-doc 共用。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const VERSION_RE = /^[Vv]?\d+\.\d+\.\d+$/;

/** 从目录向上遍历，查找匹配版本格式的目录（返回 {root, version} 或 null） */
function findVersionDir(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const name = path.basename(dir);
    if (VERSION_RE.test(name)) {
      return { root: path.dirname(dir), version: name.replace(/^[Vv]/, '') };
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 扫描目录下所有版本子目录，返回 [{name, version, path}]（升序） */
function scanVersions(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory() && VERSION_RE.test(name)) {
      out.push({ name, version: name.replace(/^[Vv]/, ''), path: full });
    }
  }
  return out.sort((a, b) => {
    const va = a.version.split('.').map(Number);
    const vb = b.version.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (va[i] !== vb[i]) return va[i] - vb[i];
    return 0;
  });
}

/** 版本号规范化：去掉 V/v 前缀 */
function normalizeVersion(v) {
  return String(v).replace(/^[Vv]/, '');
}

/** 从版本目录解析版本号（目录名为 1.0.0 或 V1.0.0） */
function versionOfDir(dir) {
  return normalizeVersion(path.basename(dir));
}

module.exports = { findVersionDir, scanVersions, normalizeVersion, versionOfDir, VERSION_RE };
