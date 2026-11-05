/**
 * wcag-calc.js — WCAG 2.1 对比度计算
 *
 * 纯数学，零依赖。供 check-quality.js 使用。
 * 公式：contrastRatio = (L1 + 0.05) / (L2 + 0.05)，L 为相对亮度（sRGB gamma 校正）。
 */
'use strict';

/** hex 颜色 → {r, g, b} (0-255)。支持 #rgb / #rrggbb / #rrggbbaa */
function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (!h) return null;
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 4) h = h.split('').map(c => c + c).join(''); // #rgba → 8 位
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(isNaN)) return null;
  return { r, g, b };
}

/** rgb 通道 → sRGB 线性值（0-1） */
function channelLinear(v) {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** 相对亮度（0-1） */
function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

/** 对比度（≥1）。支持 hex 或 {r,g,b} */
function contrastRatio(c1, c2) {
  const l1 = typeof c1 === 'string' ? relativeLuminance(hexToRgb(c1)) : relativeLuminance(c1);
  const l2 = typeof c2 === 'string' ? relativeLuminance(hexToRgb(c2)) : relativeLuminance(c2);
  if (l1 == null || l2 == null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA 阈值判断：normal=4.5:1，large（≥18px 或 ≥14px bold）=3:1 */
function meetsAA(size, ratio) {
  if (ratio == null) return false;
  return ratio >= (size === 'large' ? 3 : 4.5);
}

/** 从色板找与目标色对比度最高的色（返回 {hex, ratio}） */
function findBestContrast(targetHex, palette) {
  let best = null;
  let bestRatio = 0;
  for (const hex of palette) {
    const ratio = contrastRatio(targetHex, hex);
    if (ratio != null && ratio > bestRatio) {
      bestRatio = ratio;
      best = { hex, ratio };
    }
  }
  return best;
}

/** 欧氏距离（RGB 空间），用于配色偏离找最近色板色 */
function colorDistance(hex1, hex2) {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return Infinity;
  return Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2));
}

/** 从色板找欧氏距离最近的色 */
function findClosestPaletteColor(hex, palette) {
  let best = null;
  let bestDist = Infinity;
  for (const p of palette) {
    const d = colorDistance(hex, p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return { hex: best, distance: bestDist };
}

module.exports = {
  hexToRgb, relativeLuminance, contrastRatio, meetsAA,
  findBestContrast, colorDistance, findClosestPaletteColor
};
