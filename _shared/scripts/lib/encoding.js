/**
 * encoding.js — Windows 编码工具
 *
 * 解决中文 Windows 上 Bash(UTF-8) → cmd/PowerShell(GBK) 的编码断裂问题。
 * Node 内部一律 UTF-8；写文件默认 UTF-8 无 BOM；路径统一正斜杠。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

/** 路径统一为正斜杠（Windows 兼容、避免反斜杠转义问题） */
function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

/** 写 UTF-8 无 BOM 文件（默认 utf8 即无 BOM，显式声明防误改） */
function writeUtf8(file, content) {
  fs.writeFileSync(file, content, { encoding: 'utf8' });
  return file;
}

/** 读文件（自动 utf8），文件不存在返回 null */
function readUtf8(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

/** 确保目录存在（递归） */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 临时目录（纯 ASCII 路径，中文参数经此文件传递避免编码断裂） */
function tempDir() {
  return path.join(os.tmpdir(), 'pmcraft');
}

/** 生成临时文件路径（纯 ASCII 目录，timestamp + random 防冲突） */
function tempFilePath(prefix, ext) {
  ensureDir(tempDir());
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return toForwardSlashes(path.join(tempDir(), `${prefix}_${stamp}_${rand}.${ext || 'txt'}`));
}

/** 删除文件（吞掉错误，用于清理临时文件） */
function removeFile(file) {
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) {}
}

/** 复制单个文件（源不存在返回 false） */
function copyFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

/** 递归复制目录（返回复制的文件数；可选 exclude 数组，支持目录名前缀匹配） */
function copyDir(src, dest, exclude) {
  const excludes = exclude || [];
  if (!fs.existsSync(src)) return 0;
  ensureDir(dest);
  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const rel = entry.name;
    // 排除规则（与 SKILL.md 存档排除一致）：
    //   - 'xxx/' 结尾 → 目录规则：仅匹配同名目录本身（如 .dead/）
    //   - 含 '/' 的文件路径 → 按文件名匹配（如 mock/.server.pid 匹配任意 .server.pid）
    //   - 其余 → 精确匹配文件名
    const skip = excludes.some(e => {
      if (e.endsWith('/')) return entry.isDirectory() && rel === e.slice(0, -1);
      if (entry.isDirectory()) return false;
      return rel === e || (e.includes('/') && rel === e.split('/').pop());
    });
    if (skip) continue;
    const srcFull = path.join(src, rel);
    const destFull = path.join(dest, rel);
    if (entry.isDirectory()) {
      count += copyDir(srcFull, destFull, excludes);
    } else {
      copyFile(srcFull, destFull);
      count++;
    }
  }
  return count;
}

module.exports = {
  toForwardSlashes, writeUtf8, readUtf8, ensureDir,
  tempDir, tempFilePath, removeFile, copyFile, copyDir
};
