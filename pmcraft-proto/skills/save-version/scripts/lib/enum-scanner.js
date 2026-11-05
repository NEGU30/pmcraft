/**
 * enum-scanner.js — E 编号扫描 / 断层检测
 *
 * 供 save-version / save-doc / initialize-structure 共用。
 * 约定：E 编号统一为 E + 数字（E1、E2、E3…），大写 E + 阿拉伯数字。
 */
'use strict';
const fs = require('fs');
const path = require('path');

/** 扫描目录下所有 E{n} 子目录，返回编号数组（升序） */
function scanE(dir) {
  if (!fs.existsSync(dir)) return [];
  const nums = [];
  for (const name of fs.readdirSync(dir)) {
    const m = /^E(\d+)$/.exec(name);
    if (m && fs.statSync(path.join(dir, name)).isDirectory()) nums.push(parseInt(m[1], 10));
  }
  return nums.sort((a, b) => a - b);
}

/** 最大编号（无则返回 0） */
function maxE(dir) {
  const nums = scanE(dir);
  return nums.length ? nums[nums.length - 1] : 0;
}

/** 检测编号断层：对已有编号从 1 开始找第一个缺失的编号（返回 null 表示无断层） */
function findGap(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  let expected = 1;
  for (const n of sorted) {
    if (n === expected) { expected++; continue; }
    if (n > expected) return expected;
  }
  return null; // 连续（1,2,3...）无断层
}

/** 建议下一个编号（无断层 → max+1；有断层 → 返回断层处首个缺失编号） */
function nextE(dir) {
  const nums = scanE(dir);
  const gap = findGap(nums);
  return gap !== null ? gap : (maxE(dir) + 1);
}

/** 格式化 E 编号：数字 → E{n} 字符串 */
function fmt(n) {
  return 'E' + n;
}

module.exports = { scanE, maxE, findGap, nextE, fmt };
