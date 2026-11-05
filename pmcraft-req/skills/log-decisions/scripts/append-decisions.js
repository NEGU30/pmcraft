#!/usr/bin/env node
/**
 * append-decisions.js — 决策记录追加脚本（log-decisions action=append 的机械化部分）
 *
 * 功能：定位现有决策记录 → 解析最大 D 编号 → 分配新编号 → 插入决策正文 →
 *       同步状态索引 → 更新变更记录/元信息 → 写新 E 文件 → 删除旧 E 文件 → 重建 _index.md
 *
 * 用法：
 *   node append-decisions.js \
 *     --version-dir=<版本目录> \
 *     --decisions-file=<新决策条目 JSON> \
 *     [--state-updates-file=<状态更新 JSON>] \
 *     [--author=<负责人>] \
 *     [--dry-run]
 *
 * 输出契约：{"status":"ok"|"error","data":{...}}（与 pmcraft 其他脚本一致）
 *  - ok:    { old_file, new_file, old_edition, new_edition, added_ids:[], updated_ids:[], index_updated }
 *  - error: { message, detail, suggestion }
 *
 * 幂等保护：目标新 E 文件已存在 → 拒绝执行（防重复追加）。
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
const { readUtf8, writeUtf8, removeFile } = require(path.join(sharedLib, 'encoding'));
const { rebuildIndex } = require('../../save-doc/scripts/lib/indexer');

// ===== 参数解析（--key=value / --key value） =====
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) args[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[a.slice(2)] = argv[++i];
    else args[a.slice(2)] = 'true';
  }
  return args;
}

// ===== 工具 =====
const REG_D = /^D(\d+)$/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 从版本目录扫描决策记录文件，取最大 E */
function findLatestDecisionFile(versionDir) {
  const dir = path.join(versionDir, 'decision');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /^.+_决策记录_E\d+\.md$/.test(f));
  if (!files.length) return null;
  files.sort((a, b) => {
    const ea = parseInt(/E(\d+)/.exec(a)[1], 10), eb = parseInt(/E(\d+)/.exec(b)[1], 10);
    return eb - ea;
  });
  return { file: files[0], edition: parseInt(/E(\d+)/.exec(files[0])[1], 10), absPath: path.join(dir, files[0]) };
}

/** 提取当前最大 D 编号（从正文 ### Dxxx 标题） */
function maxD(content) {
  let max = 0;
  const re = /^###\s+D(\d+)/gm;
  let m;
  while ((m = re.exec(content))) max = Math.max(max, parseInt(m[1], 10));
  return max;
}

/** 提取既有 D 编号集合（正文 + 状态索引 + 决策速览） */
function existingDIds(content) {
  const set = new Set();
  let m;
  const re1 = /^###\s+(D\d+)/gm;
  while ((m = re1.exec(content))) set.add(m[1]);
  const re2 = /^\|\s*(D\d+)\s*\|/gm;
  while ((m = re2.exec(content))) set.add(m[1]);
  return set;
}

// ===== 决策速览表（## 5. 决策速览，append-decisions 自动维护） =====
const QUICK_VIEW_MARKER = '## 5. 决策速览';
const QUICK_VIEW_HEADER_RE = /\|:---\|:---\|:---\|:---\|:---\|/;

/** 单元格归一化：null→'—'、空白折叠、超长截断加… */
function cell(value, maxLen) {
  if (value == null) return '—';
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return '—';
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/** 结论单元格：单字母 decision（A/B/C）展开为「字母（选项原文）」；否则原样截断 */
function conclusionCell(item) {
  const d = item.decision;
  if (typeof d === 'string' && /^[A-Z]$/.test(d.trim()) && Array.isArray(item.options)) {
    const idx = d.trim().charCodeAt(0) - 65;
    if (item.options[idx] != null) return cell(`${d.trim()}（${item.options[idx]}）`, 30);
  }
  return cell(d, 30);
}

/** 速览行：| D001 | 标题 | 结论 | 影响 | 状态符号 |（状态列裸符号，勿带文字——避免污染元信息统计） */
function quickViewRow(id, item) {
  const statusSym = { '已确认': '✅', '条件触发': '⏳', '待确认': '❓', '已推翻': '❌', '已延期': '⏸' }[item.status] || '✅';
  return `| ${id} | ${cell(item.title, 40)} | ${conclusionCell(item)} | ${cell(item.cost, 40)} | ${statusSym} |`;
}

/**
 * 存量文件迁移：缺「## 5. 决策速览」节时在文末创建，并按状态索引回填（D 编号降序，最新在前）。
 * 回填行结论/影响为"—"（存量正文未解析），注释行指引到「3. 决策条目」。
 * @param {Set<string>} excludedIds 本次新分配 id 集合（回填仅覆盖存量决策，避免与新行重复）
 * @returns {{content: string, sectionStart: number}} 节标题在全文的偏移
 */
function ensureQuickViewSection(content, excludedIds) {
  const idx = content.indexOf(QUICK_VIEW_MARKER);
  if (idx !== -1) return { content, sectionStart: idx };
  // 从状态索引表解析回填行（编号/标题/状态符号——6 列表格取前 3 列）
  const rows = [];
  const idx4Pos = content.indexOf('## 4. 状态索引');
  if (idx4Pos !== -1) {
    const idx5Pos = content.indexOf(QUICK_VIEW_MARKER);
    const secEnd = idx5Pos === -1 ? content.length : idx5Pos;
    const statusIdxSection = content.slice(idx4Pos, secEnd);
    const re = /^\|\s*(D\d+)\s*\|([^|\n]*)\|\s*(✅|⏳|❓|❌|⏸)\s*\|/gm;
    let m;
    while ((m = re.exec(statusIdxSection))) {
      if (excludedIds && excludedIds.has(m[1])) continue;
      rows.push(`| ${m[1]} | ${cell(m[2], 40)} | — | — | ${m[3]} |`);
    }
  }
  rows.sort((a, b) => parseInt(/D(\d+)/.exec(b)[1], 10) - parseInt(/D(\d+)/.exec(a)[1], 10));
  const section = `\n---\n\n## 5. 决策速览\n> AI 维护，与正文保持同步。**最新决策在最前**（D 编号降序）。每行一条决策的一句话速览：结论超 30 字、影响超 40 字自动截断；完整内容见「3. 决策条目」。\n\n| 编号 | 标题 | 结论 | 影响 | 状态 |\n|:---|:---|:---|:---|:---|\n${rows.join('\n')}${rows.length ? '\n' : ''}${rows.length ? '> 迁移生成：存量决策的结论/影响见「3. 决策条目」对应条目。\n' : ''}`;
  const newContent = content.replace(/\s*$/, '') + section;
  return { content: newContent, sectionStart: newContent.indexOf(QUICK_VIEW_MARKER) };
}

// ===== 主流程 =====
function main() {
  const args = parseArgs(process.argv);
  const versionDir = args['version-dir'];
  const decisionsFile = args['decisions-file'];
  const stateUpdatesFile = args['state-updates-file'];
  const author = args.author || 'AI';
  const dryRun = args['dry-run'] === 'true';

  if (!versionDir || !decisionsFile) usage('缺少必选参数 --version-dir 与 --decisions-file');

  // 1. 校验 JSON 文件
  if (!fs.existsSync(decisionsFile)) fail('决策条目文件不存在', `未找到 ${decisionsFile}`, '请确认 --decisions-file 路径正确');
  let newItems;
  try { newItems = JSON.parse(fs.readFileSync(decisionsFile, 'utf8')); }
  catch (e) { fail('决策条目 JSON 解析失败', e.message, '请确认 decisions-file 为合法 JSON 数组'); }
  if (!Array.isArray(newItems)) fail('决策条目格式错误', 'decisions-file 应为 JSON 数组', '请按 SKILL.md 中的 decisions_file 格式编写');

  let stateUpdates = [];
  if (stateUpdatesFile) {
    if (!fs.existsSync(stateUpdatesFile)) fail('状态更新文件不存在', `未找到 ${stateUpdatesFile}`, '请确认 --state-updates-file 路径正确');
    try { stateUpdates = JSON.parse(fs.readFileSync(stateUpdatesFile, 'utf8')); }
    catch (e) { fail('状态更新 JSON 解析失败', e.message, '请确认 state-updates-file 为合法 JSON 数组'); }
    if (!Array.isArray(stateUpdates)) fail('状态更新格式错误', 'state-updates-file 应为 JSON 数组', '请按 SKILL.md 中的 state_updates_file 格式编写');
  }

  // 2. 定位现有决策记录
  const latest = findLatestDecisionFile(versionDir);
  if (!latest) fail('未找到决策记录文件', 'decision/ 目录下无 *_决策记录_E*.md', '建议先执行 write-brief 创建决策记录');

  // 3. 幂等保护：目标新 E 文件已存在 → 拒绝
  const newEdition = latest.edition + 1;
  const newFileName = latest.file.replace(/_E\d+\.md$/, `_E${newEdition}.md`);
  const newAbsPath = path.join(versionDir, 'decision', newFileName);
  if (fs.existsSync(newAbsPath)) {
    fail('目标新文件已存在，疑似重复追加',
      `目标文件 ${newFileName} 已存在（当前最大 E 为 E${latest.edition}）`,
      '请确认是否已追加过本次决策；若确认追加，请先移除已存在的目标文件后重试');
  }

  // 4. 读取现有内容，解析元信息（统一规范化为 LF，兼容 CRLF 源文件）
  let content = readUtf8(latest.absPath);
  if (!content) fail('读取现有决策记录失败', latest.absPath, '请检查文件权限');
  const hadCrlf = /\r\n/.test(content);
  content = content.replace(/\r\n/g, '\n');

  const funcMatch = /^([^_]+)_/.exec(latest.file);
  const funcName = funcMatch ? funcMatch[1] : '';
  const versionMatch = /_((?:V)?\d+\.\d+\.\d+)_/.exec(latest.file);
  const version = versionMatch ? versionMatch[1] : '';
  const todayStr = new Date().toISOString().slice(0, 10);

  // 5. 分配新 D 编号（跳过已存在编号）
  const existing = existingDIds(content);
  let nextD = maxD(content);
  const idMap = {};       // 旧 id（若提供）→ 新 id
  const assigned = [];
  for (const item of newItems) {
    let id = item.id;
    if (!id || !REG_D.test(id)) {
      // 自动分配：找到第一个未占用的 D 编号
      nextD++;
      while (existing.has(`D${String(nextD).padStart(3, '0')}`)) nextD++;
      id = `D${String(nextD).padStart(3, '0')}`;
      existing.add(id);
    }
    else {
      if (existing.has(id)) {
        // id 冲突：若新条目明确带 id 且已存在 → 自动分配下一个
        nextD = Math.max(nextD, parseInt(REG_D.exec(id)[1], 10));
        nextD++;
        while (existing.has(`D${String(nextD).padStart(3, '0')}`)) nextD++;
        const newId = `D${String(nextD).padStart(3, '0')}`;
        idMap[id] = newId; id = newId;
        existing.add(id);
      } else {
        nextD = Math.max(nextD, parseInt(REG_D.exec(id)[1], 10));
        existing.add(id);
      }
    }
    assigned.push({ origId: item.id || null, finalId: id, item });
  }

  // 6. 生成新决策正文块（模板结构）
  const blocks = assigned.map(({ finalId, item }) => {
    const lines = [];
    lines.push(`### ${finalId} · ${item.title || '（未命名决策）'}`, '');
    lines.push('| | |', '|:---|:---|');
    lines.push(`| **日期** | ${todayStr} |`);
    lines.push(`| **来源** | ${item.source || 'AI'} |`);
    const statusMap = { '已确认': '✅ 已确认', '条件触发': '⏳ 条件触发', '待确认': '❓ 待确认', '已推翻': '❌ 已推翻', '已延期': '⏸ 已延期' };
    lines.push(`| **状态** | ${statusMap[item.status] || item.status || '已确认'} |`);
    lines.push('');
    if (item.background) { lines.push('**背景**', item.background, ''); }
    if (item.options && item.options.length) {
      lines.push('**选项**');
      item.options.forEach((o, i) => lines.push(`- ${String.fromCharCode(65 + i)}. ${o}`));
      lines.push('');
    }
    if (item.decision) { lines.push(`**决定**：${item.decision}`, ''); }
    if (item.reason) { lines.push('**理由**', item.reason, ''); }
    if (item.cost) { lines.push('**代价**', item.cost, ''); }
    if (item.assumptions && item.assumptions.length) {
      lines.push('**前提假设**');
      item.assumptions.forEach(a => lines.push(`- ${a.text || a} ${a.source ? `*(${a.source})*` : ''}`));
      lines.push('');
    }
    if (item.links) { lines.push(`**关联**：${item.links}`, ''); }
    if (item.trigger_condition) { lines.push('**触发条件**', item.trigger_condition, ''); }
    if (item.superseded_by) { lines.push('**推翻记录**', `- 被 ${item.superseded_by} 推翻`, ''); }
    lines.push('---', '');
    return lines.join('\n');
  });

  // 7. 处理状态更新（正文 + 状态索引）
  const updatedIds = [];
  const statusLineMap = { '已确认': '✅ 已确认', '条件触发': '⏳ 条件触发', '待确认': '❓ 待确认', '已推翻': '❌ 已推翻', '已延期': '⏸ 已延期' };
  for (const upd of stateUpdates) {
    const id = upd.id;
    if (!REG_D.test(id)) continue;
    const blockRe = new RegExp(`(^###\\s+${esc(id)}\\s+·[^\\n]*\\n[\\s\\S]*?)(?=^###\\s+|^## 4\\.)`, 'm');
    // 状态行：| **状态** | ⏸ 已延期 | —— 状态值 = 非 | 非换行内容
    const statusRe = new RegExp(`(^\\| \\*\\*状态\\*\\* \\| )([^\\n|]+)( \\|$)`, 'm');
    if (blockRe.test(content)) {
      // 更新状态行
      content = content.replace(blockRe, (match, block) => {
        return block.replace(statusRe, (m2, pre, oldStatus, post) => {
          return `${pre}${statusLineMap[upd.new_status] || upd.new_status}${post}`;
        });
      });
      // 追加推翻记录（若已推翻）——插在块的 "---" 分隔线之前
      if (upd.new_status === '已推翻' && upd.superseded_by) {
        const endRe = new RegExp(`(^###\\s+${esc(id)}\\s+·[^\\n]*\\n[\\s\\S]*?)(^---\\n)`, 'm');
        content = content.replace(endRe, (match, block, sep) => {
          const reasonLine = `**推翻记录**：${upd.superseded_date || todayStr} 被 ${upd.superseded_by} 推翻——${upd.superseded_reason || ''}`;
          return `${block}${reasonLine}\n\n${sep}`;
        });
      }
      // 同步状态索引与决策速览表状态列（m flag：^ 匹配行首；无 g 标志 → 全文首个匹配 = 状态索引行，章节序保证）
      // post 分组为可选——状态索引 6 列满足，速览行 5 列（状态在末列）post 为空
      const idxRe = new RegExp(`(^\\|\\s*${esc(id)}\\s*\\|[^\\n]*?\\|\\s*)(✅|⏳|❓|❌|⏸)(\\s*\\|[^\\n]*\\|)?`, 'm');
      const symMap = { '已确认': '✅', '条件触发': '⏳', '待确认': '❓', '已推翻': '❌', '已延期': '⏸' };
      content = content.replace(idxRe, (m2, pre, _old, post) => `${pre}${symMap[upd.new_status] || '✅'}${post || ''}`);
      // 同步决策速览表状态列（## 5. 到 EOF 区域，同正则；速览行状态列在末列）
      const qvIdx = content.indexOf(QUICK_VIEW_MARKER);
      if (qvIdx !== -1) {
        const qvHead = content.slice(0, qvIdx);
        const qvTail = content.slice(qvIdx).replace(idxRe, (m2, pre, _old, post) => `${pre}${symMap[upd.new_status] || '✅'}${post || ''}`);
        content = qvHead + qvTail;
      }
      // 同步状态索引「被推翻于」列（第 6 列）——仅限 ## 4. 状态索引 区域，避免误伤速览 5 列行的状态符号
      if (upd.superseded_by) {
        const stIdxStart = content.indexOf('## 4. 状态索引');
        if (stIdxStart !== -1) {
          const stIdxEnd = content.indexOf(QUICK_VIEW_MARKER, stIdxStart);
          const regionEnd = stIdxEnd === -1 ? content.length : stIdxEnd;
          const supRe = new RegExp(`(^\\|\\s*${esc(id)}\\s*\\|[^\\n]+\\|)([^|\\n]*?)(\\s*\\|)$`, 'm');
          const head = content.slice(0, stIdxStart);
          const region = content.slice(stIdxStart, regionEnd).replace(supRe, (m2, pre, _v, post) => `${pre} ${upd.superseded_by}${post}`);
          content = head + region + content.slice(regionEnd);
        }
      }
      updatedIds.push(id);
    } else {
      // 未找到 → 警告（记录但继续）
      updatedIds.push(`${id} (未找到，跳过)`);
    }
  }

  // 8. 插入新决策块（在 "## 4. 状态索引" 之前）
  const marker4 = '## 4. 状态索引';
  if (!content.includes(marker4)) fail('现有决策记录缺少 "## 4. 状态索引" 章节', '无法定位插入点', '请检查决策记录文件格式');
  content = content.replace(marker4, blocks.join('') + marker4);

  // 9. 更新状态索引表（追加新行）
  const idxHeaderRe = /\|:---\|:---\|:---\|:---\|:---\|:---\|/;
  if (!idxHeaderRe.test(content)) fail('现有决策记录状态索引表头缺失', '无法定位索引表', '请检查决策记录文件格式');
  const idxRows = assigned.map(({ finalId, item }) => {
    const statusSym = { '已确认': '✅', '条件触发': '⏳', '待确认': '❓', '已推翻': '❌', '已延期': '⏸' }[item.status] || '✅';
    const links = item.links || '—';
    const trigger = item.trigger_condition || '—';
    const superseded = item.superseded_by || '—';
    return `| ${finalId} | ${item.title || '（未命名决策）'} | ${statusSym} | ${links} | ${trigger} | ${superseded} |`;
  });
  // 在状态索引节内最后一个索引数据行后追加（节内定位：## 4. 与 ## 5./EOF 之间——防止命中决策速览表行）
  const idx4At = content.indexOf('## 4. 状态索引');
  const idx5At = content.indexOf(QUICK_VIEW_MARKER);
  const regionEnd4 = idx5At === -1 ? content.length : idx5At;
  const lastIdxLine = content.slice(idx4At, regionEnd4).lastIndexOf('\n| D');
  if (lastIdxLine === -1) fail('状态索引表无数据行', '无法定位追加位置', '请检查决策记录文件格式');
  const lastIdxEol = content.indexOf('\n', idx4At + lastIdxLine + 1);
  content = content.slice(0, lastIdxEol + 1) + idxRows.join('\n') + '\n' + content.slice(lastIdxEol + 1);

  // 9.5 决策速览表：存量迁移（缺节自动创建并按状态索引回填）+ 倒序插入新行（最新在最前）
  // 排除集 = 本次新分配的 id（回填仅覆盖存量决策，避免与新行重复）
  const qv = ensureQuickViewSection(content, new Set(assigned.map(a => a.finalId)));
  content = qv.content;
  const qvRegion = content.slice(qv.sectionStart);
  if (!QUICK_VIEW_HEADER_RE.test(qvRegion)) fail('决策速览表表头缺失', '无法定位速览表', '请检查决策记录文件格式');
  const sepMatch = qvRegion.match(QUICK_VIEW_HEADER_RE);
  const sepEol = content.indexOf('\n', qv.sectionStart + sepMatch.index);
  // 新行按 D 编号降序（最新在前，不依赖 decisions.json 输入顺序）
  const qvNewRows = assigned
    .map(({ finalId, item }) => quickViewRow(finalId, item))
    .sort((a, b) => parseInt(/D(\d+)/.exec(b)[1], 10) - parseInt(/D(\d+)/.exec(a)[1], 10));
  content = content.slice(0, sepEol + 1) + qvNewRows.join('\n') + '\n' + content.slice(sepEol + 1);

  // 10. 更新变更记录（追加到 "## 2. 变更记录" 表格末尾，避免插到表格外）
  const changeSec = content.match(/(## 2\. 变更记录[\s\S]*?)(?=^## )/m);
  if (!changeSec) fail('现有决策记录缺少 "## 2. 变更记录" 章节', '无法定位变更记录', '请检查决策记录文件格式');
  const newChangeRow = `| E${newEdition} | ${todayStr} | 追加 ${assigned.map(a => a.finalId).join(', ')}（${author}） | ${author} |`;
  const updatedSec = changeSec[1].replace(/(\n\| E\d+ \|[^\n]*)(?=\n\s*\n?---\s*\n|$)/, `$1\n${newChangeRow}`);
  content = content.replace(changeSec[1], updatedSec);

  // 11. 更新元信息（决策条目统计）
  const statsMatch = content.match(/^\| \*\*决策条目\*\* \|[^\n]*\|/m);
  if (statsMatch) {
    // existing 集合在编号分配时已含本次新条目，直接取其 size，避免重复计数
    const total = existing.size;
    const confirmed = (content.match(/✅ 已确认/g) || []).length;
    const triggered = (content.match(/⏳ 条件触发/g) || []).length;
    const pending = (content.match(/❓ 待确认/g) || []).length;
    const superseded = (content.match(/❌ 已推翻/g) || []).length;
    const deferred = (content.match(/⏸ 已延期/g) || []).length;
    content = content.replace(statsMatch[0], `| **决策条目** | ${total} 条 · 已确认 ${confirmed} · 待确认 ${pending} · 条件触发 ${triggered} · 已推翻 ${superseded} · 已延期 ${deferred} |`);
  }
  // 最后更新日期 + 文档修订递增
  content = content.replace(/^\| \*\*最后更新\*\* \|[^\n]*\|/m, `| **最后更新** | ${todayStr} |`);
  content = content.replace(/^\| \*\*文档修订\*\* \|[^\n]*\|/m, `| **文档修订** | E${newEdition} |`);

  // 12. 写新文件、删旧文件、重建索引（输出统一 CRLF，与 indexer/其他 pmcraft 文档一致）
  if (!dryRun) {
    const outContent = hadCrlf ? content.replace(/\n/g, '\r\n') : content;
    writeUtf8(newAbsPath, outContent);
    removeFile(latest.absPath);
    const baseDir = path.dirname(versionDir);
    const indexFile = path.join(baseDir, '_index.md');
    const indexer = rebuildIndex({
      indexFile,
      funcName: funcName || path.basename(baseDir),
      baseDir,
      current: { version, subDir: 'decision', subGroup: '', edition: `E${newEdition}`, summary: `追加 ${assigned.map(a => a.finalId).join(', ')}（${author}）`, author }
    });
    ok({
      old_file: latest.file, new_file: newFileName,
      old_edition: `E${latest.edition}`, new_edition: `E${newEdition}`,
      added_ids: assigned.map(a => a.finalId),
      updated_ids: updatedIds,
      index_updated: true,
      files_needing_ai_summary: indexer.filesNeedingAI
    });
  } else {
    ok({ dry_run: true, would_create: newFileName, added_ids: assigned.map(a => a.finalId), updated_ids: updatedIds });
  }
}

main();
