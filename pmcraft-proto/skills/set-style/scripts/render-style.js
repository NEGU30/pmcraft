#!/usr/bin/env node
/**
 * render-style.js — 设计系统四件套模板渲染（替代原 SKILL.md 中 LLM 手动重写模板）
 *
 * 渲染：design-system.css + preview.html + preview-key-page.html（模板在 scripts/templates/）
 * DESIGN.md 骨架由脚本生成（tokens 填充），文字段落（设计哲学/Do's and Don'ts）保留 AI。
 *
 * 用法：
 *   node render-style.js --config=<JSON配置或文件> --output-dir=<working/> [--page-inventory=<path>] [--dry-run]
 *
 * 配置：{style_name, colors{primary,accent,background,surface,text,border,danger,success,warning},
 *        typography{heading_font,heading_weight,body_font,body_weight},
 *        spacing, radius{sm,md,lg}, icon_library}
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
const { toForwardSlashes, ensureDir, writeUtf8, readUtf8, copyFile } = require(path.join(sharedLib, 'encoding'));
const { render } = require(path.join(sharedLib, 'tmpl'));

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

/** 解析 --config（JSON 字符串或文件路径） */
function resolveConfig(configArg) {
  if (!configArg) usage('缺少 --config（JSON 配置或文件路径）');
  // 尝试文件路径
  if (fs.existsSync(configArg)) {
    try { return JSON.parse(readUtf8(configArg)); } catch (e) { fail('配置 JSON 解析失败', e.message); }
  }
  // 尝试 JSON 字符串
  try { return JSON.parse(configArg); } catch (e) { fail('配置 JSON 解析失败', e.message); }
}

function main() {
  const args = parseArgs(process.argv);
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
  const config = resolveConfig(args.config);

  if (!args['output-dir']) usage('缺少 --output-dir（输出目录，prototype/working/）');
  const outputDir = path.resolve(args['output-dir']);

  // 模板目录（本技能内）
  const templatesDir = path.join(__dirname, 'templates');
  if (!fs.existsSync(templatesDir)) fail('模板目录不存在', templatesDir);

  const colors = config.colors || {};
  const typo = config.typography || {};
  const radius = config.radius || {};

  // 渲染变量（tmpl 占位符）
  const vars = {
    style_name: config.style_name || '设计系统',
    primary_hex: colors.primary || '#2563EB',
    accent_hex: colors.accent || '#0891B2',
    background_hex: colors.background || '#F8FAFC',
    surface_hex: colors.surface || '#FFFFFF',
    text_hex: colors.text || '#1E293B',
    border_hex: colors.border || '#E2E8F0',
    danger_hex: colors.danger || '#DC2626',
    success_hex: colors.success || '#16A34A',
    warning_hex: colors.warning || '#D97706',
    heading_font: typo.heading_font || 'Inter',
    heading_weight: typo.heading_weight || 700,
    body_font: typo.body_font || 'Inter',
    body_weight: typo.body_weight || 400,
    radius_sm: radius.sm || 2,
    radius_md: radius.md || 4,
    radius_lg: radius.lg || 8,
    // preview 字号（默认字阶）
    h1_size: '32px', h2_size: '24px', h3_size: '19px',
    body_size: '16px', small_size: '14px'
  };

  // ---- 1. design-system.css ----
  const cssTpl = readUtf8(path.join(templatesDir, 'design-system.css-template'));
  const cssContent = render(cssTpl, vars);
  const cssOut = path.join(outputDir, 'design-system.css');

  // ---- 2. preview.html ----
  const previewTpl = readUtf8(path.join(templatesDir, 'preview.html-template'));
  const previewContent = render(previewTpl, vars);
  const previewOut = path.join(outputDir, 'preview.html');

  // ---- 3. preview-key-page.html（仅当传 --page-inventory）----
  let keyPageOut = null;
  if (args['page-inventory']) {
    const keyTpl = path.join(templatesDir, 'preview-key-page.html-template');
    if (fs.existsSync(keyTpl)) {
      const keyContent = render(readUtf8(keyTpl), vars);
      keyPageOut = path.join(outputDir, 'preview-key-page.html');
      if (!dryRun) writeUtf8(keyPageOut, keyContent);
    }
  }

  // ---- 4. _common.css 复制（从 build-prototype assets）----
  const commonSrc = path.join(__dirname, '..', '..', '..', '_shared', '_common.css');
  let commonCopied = false;
  let commonSize = 0;
  if (fs.existsSync(commonSrc)) {
    if (!dryRun) {
      copyFile(commonSrc, path.join(outputDir, '_common.css'));
      commonSize = fs.statSync(path.join(outputDir, '_common.css')).size;
    } else {
      commonSize = fs.statSync(commonSrc).size;
    }
    commonCopied = true;
  }

  // ---- 5. DESIGN.md 骨架（tokens 填充，文字段留 AI）----
  const designMd = `---
# Primitive tokens
colors:
  gray-600: "${colors.text || '#1E293B'}"
  gray-200: "${colors.border || '#E2E8F0'}"
  gray-100: "${colors.background || '#F8FAFC'}"
  blue-600: "${colors.primary || '#2563EB'}"
  blue-500: "${colors.accent || '#0891B2'}"
  red-500: "${colors.danger || '#DC2626'}"
  green-500: "${colors.success || '#16A34A'}"
  orange-500: "${colors.warning || '#D97706'}"
  white: "#FFFFFF"
typography:
  heading-font: { family: "${typo.heading_font || 'Inter'}", weight: ${typo.heading_weight || 700} }
  body-font: { family: "${typo.body_font || 'Inter'}", weight: ${typo.body_weight || 400} }
spacing: { unit: 8px, sm: 4px, md: 8px, lg: 16px, xl: 24px, xxl: 32px }
radius: { sm: ${radius.sm || 2}px, md: ${radius.md || 4}px, lg: ${radius.lg || 8}px }
icon_library: ${config.icon_library || 'lucide'}
---
# Semantic tokens
colors:
  primary: {colors.blue-600}
  accent: {colors.blue-500}
  danger: {colors.red-500}
  success: {colors.green-500}
  warning: {colors.orange-500}
  background: {colors.gray-100}
  surface: {colors.white}
  text: {colors.gray-600}
  border: {colors.gray-200}
typography:
  h1: { fontFamily: {typography.heading-font.family}, fontSize: 1.75rem, fontWeight: ${typo.heading_weight || 700} }
  body: { fontFamily: {typography.body-font.family}, fontSize: 1rem, fontWeight: ${typo.body_weight || 400}, lineHeight: 1.6 }
components:
  button: { backgroundColor: {colors.primary}, textColor: {colors.white}, rounded: {radius.lg}, padding: "8px 16px" }
  card: { backgroundColor: {colors.surface}, rounded: {radius.md}, padding: "16px", shadow: "0 1px 3px rgba(0,0,0,0.1)" }

## Overview
（AI 填写：设计哲学和情感调性简述）

## Colors
（AI 填写：语义色的使用场景说明）

## Typography
（AI 填写：字阶、字重、行距说明）

## Components
（AI 填写：按钮、卡片、输入框的规格说明）

## Do's and Don'ts

风格红线。每条禁止项均配有验证过的替代方案——不只是"不要"，而是"要什么"。

| # | 禁止项 | 替代方案 |
|---|--------|---------|
| 1 | 纯黑 \`#000\` 或纯白 \`#fff\` | 带色相倾向的深浅色：深色文本用 \`#1A1A2E\` 系（偏冷）或 \`#1E1D1A\` 系（偏暖）；浅色背景用 \`#F8F9FA\` 系（偏冷）或 \`#FAF9F7\` 系（偏暖）。方向由品牌色相决定 |
| 2 | AI 特征配色：深色背景 + 蓝紫渐变 + 霓虹强调色 | 背景用单色或微妙的色温渐变（同色相、亮度差 < 15%）。强调色仅用于 hover/active 状态 |
| 3 | 渐变文字装饰标题或指标 | 标题和指标用纯色 \`var(--color-text)\`。如需突出，用字重（700/800）或字间距（-0.02em）区分 |
| 4 | 玻璃拟态（毛玻璃/glow 边框）作为默认装饰 | 毛玻璃效果仅在粘性导航栏中使用，且仅限 PC 端。表单、卡片、弹窗不使用 glass |
| 5 | 圆角卡片 + 一侧粗色边框 | 用背景对比区分层级，或用极细分隔线（\`1px solid var(--color-border)\`）代替粗色边框 |
| 6 | 卡片嵌套卡片 | 用背景色区分层级——子区域用比父区亮 2-5% 的 surface 色。或用分隔线代替内层卡片 |
| 7 | 每个交互区域都塞入卡片容器 | 卡片仅用于需要视觉隔离的独立信息块。列表行、导航项、标签组、操作栏不需要卡片 |
| 8 | 相同尺寸卡片 + 图标 + 标题 + 文案的重复网格 | 按内容类型变化布局密度：数值用 stat 卡，列表用表或行，详情用键值对 |
| 9 | Inter / Roboto / Arial / Open Sans / system-ui 作为唯一字体 | 作为 body font 可以，但不作为 display/heading 字体。display 用特征衬线或特征无衬线 |
| 10 | 滥用模态框 | 模态框仅用于必须中断用户流程的场景。编辑用内联表单或侧边抽屉 |

### 推荐项

- 中性色倾向品牌色相（轻微色相偏移创造潜意识统一感）
- 使用模块化字阶配合 \`clamp()\` 实现流体排版
- 用间距疏密创造视觉节奏，而非处处相同间距
`;

  const designOut = path.join(outputDir, 'DESIGN.md');

  const outputFiles = [];
  if (!dryRun) {
    writeUtf8(cssOut, cssContent);
    writeUtf8(previewOut, previewContent);
    writeUtf8(designOut, designMd);
  }
  outputFiles.push({ path: toForwardSlashes(cssOut), size: cssContent.length });
  outputFiles.push({ path: toForwardSlashes(previewOut), size: previewContent.length });
  outputFiles.push({ path: toForwardSlashes(designOut), size: designMd.length });
  if (keyPageOut) outputFiles.push({ path: toForwardSlashes(keyPageOut), size: 0 });
  if (commonCopied) outputFiles.push({ path: toForwardSlashes(path.join(outputDir, '_common.css')), size: commonSize });

  ok({
    output_files: outputFiles,
    has_key_page: !!keyPageOut,
    common_copied: commonCopied,
    dry_run: dryRun || undefined
  });
}

main();
