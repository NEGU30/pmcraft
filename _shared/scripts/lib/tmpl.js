/**
 * tmpl.js — 模板引擎（{占位符} 替换）
 *
 * 供 deploy-prototype / set-style 渲染本技能 templates/ 下的模板文件。
 * 占位符规则：{变量名}。未提供的占位符保持原样（避免静默丢失）。
 * 支持中文占位符键（如 {功能名}、{端口}）。
 */
'use strict';

/** 渲染模板：将 {key} 替换为 vars[key]；缺失的占位符保留原样 */
function render(template, vars) {
  return template.replace(/\{([^{}\n]+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
  });
}

/** 渲染模板文件（读取 → render → 返回字符串） */
function renderFile(file, vars) {
  const fs = require('fs');
  const src = fs.readFileSync(file, 'utf8');
  return render(src, vars);
}

module.exports = { render, renderFile };
