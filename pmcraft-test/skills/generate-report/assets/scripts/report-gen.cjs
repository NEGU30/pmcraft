#!/usr/bin/env node
// report-gen.cjs — 测试报告渲染固化（generate-report Phase 6.4）
// 读取 checkpoint 日志 + run_state + traps → 汇总 → 渲染自包含 HTML → 写 final-report.html/.json
// 用法: node report-gen.cjs --e2eDir <时间戳目录> [--defects <report/defects.json>]
// 说明: 零依赖（纯 Node 内置模块）；样式从同目录 ../template.html 的 <style> 块提取（单一事实来源）；
//       AI 只做缺陷分类（写 report/defects.json），渲染全由本脚本完成。
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--e2eDir') args.e2eDir = argv[++i];
    else if (argv[i] === '--defects') args.defects = argv[++i];
  }
  return args;
}

const { e2eDir, defects: defectsPath } = parseArgs(process.argv);
if (!e2eDir || !fs.existsSync(e2eDir)) {
  console.error('Usage: node report-gen.cjs --e2eDir <时间戳目录> [--defects <report/defects.json>]');
  process.exit(1);
}

// ---------- 读取数据 ----------
const checkpointDir = path.join(e2eDir, 'logs', 'checkpoint');
const runStatePath = path.join(e2eDir, 'run_state.json');
const trapsPath = path.join(e2eDir, 'traps.json');
const configPath = path.join(e2eDir, '..', 'config.json');  // e2e/config.json（跨时间戳共享）

const readJson = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
};

const runState = readJson(runStatePath, null);
const traps = readJson(trapsPath, []);
const config = readJson(configPath, {});
// 人工测试结果（collect-manual 产出，可选）
const manualResultsData = readJson(path.join(e2eDir, 'manual-results.json'), null);
const manualResultsMap = manualResultsData && manualResultsData.manualResults ? manualResultsData.manualResults : {};
let defects = [];
if (defectsPath && fs.existsSync(defectsPath)) defects = readJson(defectsPath, []);
// 兼容：defects 也可能是 {defects: [...]} 包装
if (defects && !Array.isArray(defects) && Array.isArray(defects.defects)) defects = defects.defects;
// 合并人工测试发现的缺陷（MANUAL_FAILED）到缺陷表
for (const [tcId, mr] of Object.entries(manualResultsMap)) {
  if (mr && mr.status === 'MANUAL_FAILED' && mr.defectType) {
    defects.push({ type: mr.defectType, tcId, description: mr.defectDescription || mr.note || '人工测试发现缺陷', source: 'manual' });
  }
}

// checkpoint 日志（按 tcId 映射）
const checkpointLogs = {};
if (fs.existsSync(checkpointDir)) {
  for (const f of fs.readdirSync(checkpointDir)) {
    if (f.endsWith('_checkpoint_log.json')) {
      const log = readJson(path.join(checkpointDir, f), null);
      if (log && log.tcId) checkpointLogs[log.tcId] = log;
    }
  }
}

// ---------- 汇总 ----------
// TC 状态：run_state.results 优先（PASSED/FAILED/FIXME/SKIPPED）；缺失时从 checkpoint 推导（全过 → PASSED，否则 FAILED）
// ⚡ run_state.skipped 数组（[{tcId, reason}] 或旧版字符串数组）中的 TC 计入总用例（trap: skipped_not_counted — 此前只统计 results，
//   3 条 SKIPPED 只存在于 skipped 数组导致报告"跳过 0 条"）
const results = runState ? runState.results : {};
const skippedList = (runState && Array.isArray(runState.skipped)) ? runState.skipped : [];
const skippedIds = new Set(skippedList.map(s => (typeof s === 'string') ? s : (s && s.tcId)));
const allTcIds = new Set([...Object.keys(results), ...Object.keys(checkpointLogs), ...skippedIds]);
const total = allTcIds.size;

// 兼容两代 checkpoint 日志结构：
//   新（framework.ts）：operations[] 含 checkpointId/operationIndex/beforeScreenshotPath 等
//   老（早期产物）：operations[] 仅 {label, status, duration, error}
const failedOpsOf = (l) => ((l && l.operations) || []).filter(o => o && o.status === 'FAILED').length;
const statusOf = (tcId) => {
  // 优先级 1：人工测试结果覆盖（原状态为 SKIPPED 或 NEEDS_MANUAL 或 needs_manual_verification 列表内或 skipped 数组时允许覆盖，防止污染自动化结果）
  // 人工结果 SKIPPED（"复核仍跳过"）不覆盖 NEEDS_MANUAL — 需人工复核项保持标注（collect-manual 约束 8）
  // ⚡ needs_manual_verification 列表内的 TC 即使自动化 FAILED 也可被人工结果覆盖（该列表语义 = 需人工定论，人工确认失败/通过为最终态）
  const inNeedsManual = !!(runState && runState.needs_manual_verification && runState.needs_manual_verification.includes(tcId));
  if ((results[tcId] === 'SKIPPED' || results[tcId] === 'NEEDS_MANUAL' || inNeedsManual || skippedIds.has(tcId)) && manualResultsMap[tcId] && manualResultsMap[tcId].status && manualResultsMap[tcId].status !== 'SKIPPED') {
    return manualResultsMap[tcId].status;
  }
  // 优先级 1.5：needs_manual_verification 列表内的 TC 且未标 PASSED → 需人工复核（脚本通过 ≠ 验证完成；FAILED 也归此 — 填值不可靠导致的失败不能定论）
  // ⚡ 已有人工结果（manual-results.json 中存在）的 TC 跳过此判定 — 人工结果已在优先级 1/2 处理，避免 MANUAL_PASSED/FAILED 被误判回 NEEDS_MANUAL（trap: manual_result_overridden_by_needs_manual）
  if (runState && runState.needs_manual_verification && runState.needs_manual_verification.includes(tcId) && results[tcId] !== 'PASSED' && !manualResultsMap[tcId]) {
    return 'NEEDS_MANUAL';
  }
  // 优先级 2：run_state.results
  if (results[tcId]) return results[tcId];
  // 优先级 2.5：run_state.skipped 数组（未生成脚本的 TC，如多角色/开发协同阻塞）→ SKIPPED
  if (skippedIds.has(tcId)) return 'SKIPPED';
  // 优先级 3：checkpoint 推导（全过 → PASSED，否则 FAILED）
  if (checkpointLogs[tcId]) {
    const l = checkpointLogs[tcId];
    const opsArr = (l && l.operations) || [];
    if (failedOpsOf(l) > 0) return 'FAILED';
    return opsArr.length ? 'PASSED' : 'UNKNOWN';
  }
  return 'UNKNOWN';
};

const countBy = (fn) => [...allTcIds].filter(fn).length;
const passed = countBy(id => statusOf(id) === 'PASSED');
const manualPassed = countBy(id => statusOf(id) === 'MANUAL_PASSED');
const manualFailed = countBy(id => statusOf(id) === 'MANUAL_FAILED');
const failed = countBy(id => statusOf(id) === 'FAILED' || statusOf(id) === 'FIXME');
const skipped = countBy(id => statusOf(id) === 'SKIPPED' || statusOf(id) === 'UNKNOWN');
// ⚡ 需人工复核（NEEDS_MANUAL）：不计入 passed/failed/skipped，单列；未验证的复核项不参与通过率
const needsManual = countBy(id => statusOf(id) === 'NEEDS_MANUAL');
const needsManualTcIds = [...allTcIds].filter(id => statusOf(id) === 'NEEDS_MANUAL');
const manualVerificationReason = (runState && runState.manual_verification_reason) || '—';
// 全量通过率（保守口径）：人工通过 = 已验证通过，计入分子；未验证的 SKIPPED 留在分母；NEEDS_MANUAL 项剔除分母
const rateDenominator = total - needsManual;
const passRate = rateDenominator > 0 ? Math.round(((passed + manualPassed) / rateDenominator) * 1000) / 10 : 0;
// ⚡ 自动化可判定口径（trap: executed_rate_denominator — 此前 executed=总数-跳过，把需人工复核/已人工复核的 TC
// 也计入"自动化执行"，导致 executed=23 但 18 通过+1 失败≠23，数字不闭合）：
//  - executed（自动化已执行）= 总数 - 跳过 - 需人工复核（NEEDS_MANUAL） - 已人工复核（MANUAL_*）
//  - 需人工复核/已人工复核的 TC：脚本虽跑，但结论归人工口径，不计入自动化执行
const manualExecuted = manualPassed + manualFailed;
const executed = total - skipped - needsManual - manualExecuted;
const executedRate = executed > 0 ? Math.round((passed / executed) * 1000) / 10 : 0;
// 人工验证口径：验证数 = 人工通过 + 人工失败；人工通过率 = 人工通过 / 验证数（验证 0 时 null → 显 "—"）
const manualRate = manualExecuted ? Math.round((manualPassed / manualExecuted) * 1000) / 10 : null;
// 跳过明细（含原因，reasonOf 从 skipped 数组 / skippedReasons / manualResults note 提取）
const skippedTcIds = [...allTcIds].filter(id => statusOf(id) === 'SKIPPED' || statusOf(id) === 'UNKNOWN');
const reasonOf = (id) => {
  const skipEntry = skippedList.find(s => (typeof s === 'string') ? s === id : (s && s.tcId === id));
  const r = (skipEntry && skipEntry.reason) || (runState && runState.skippedReasons && runState.skippedReasons[id]) || (manualResultsMap[id] && manualResultsMap[id].note) || '';
  return r || '—';
};

// ⚡ 问题清单自动推导（PM 2026-08-01 确认）：问题 = 执行结果不符合用例预期的 TC（FAILED / MANUAL_FAILED）
// 硬保证：自动化不通过 → 必上问题清单（一一对应，绝不遗漏）。defects.json 只补充类型/描述，无则自动标注"功能缺陷"。
const failedTcIds = [...allTcIds].filter(id => statusOf(id) === 'FAILED' || statusOf(id) === 'MANUAL_FAILED');
const defectsByTc = {};
for (const d of defects) { if (d.tcId && !defectsByTc[d.tcId]) defectsByTc[d.tcId] = d; }
// 推导生成问题清单条目（FAILED TC 全覆盖；defects.json 有则用其类型/描述，无则自动补全）
const issueList = failedTcIds.map(tcId => {
  const d = defectsByTc[tcId];
  return {
    tcId,
    type: (d && d.type) || '功能缺陷',
    description: (d && d.description) || `${tcId} 执行结果不符合用例预期（自动化断言失败）`,
    source: (d && d.source) || (statusOf(tcId) === 'MANUAL_FAILED' ? 'manual' : 'auto'),
  };
});
// 建议项（defects.json 中非问题条目）独立小节
const suggestions = defects.filter(d => !failedTcIds.includes(d.tcId) && (d.type || '建议项') === '建议项');

// 修复数：repair_history 或 repair_counts 非零的 TC（过程信息，保留在 summary 供自愈日志使用）
let repaired = 0;
if (runState) {
  if (Array.isArray(runState.repair_history)) {
    repaired = new Set(runState.repair_history.map(h => h.tcId).filter(Boolean)).size;
  }
  if (runState.repair_counts) {
    repaired = Math.max(repaired, Object.values(runState.repair_counts).filter(n => n > 0).length);
  }
}

const summary = { total, executed, passed, failed, repaired, skipped, manualPassed,
                  manualFailed, manualExecuted, manualRate, executedRate, passRate, skippedTcIds,
                  needsManual, needsManualTcIds, manualVerificationReason };

// ---------- 截图路径转换 ----------
// checkpoint_log 中截图路径相对 logs/checkpoint/（如 ../results/TC-F-1/screenshots/...）
// HTML 在 report/ 下 → 转成相对 report/ 的路径：../logs/checkpoint/{relPath}
const toReportRel = (p) => p ? `../logs/checkpoint/${p.replace(/\\/g, '/')}` : null;

// ---------- 构建 testCases ----------
// 证据存档（录像/trace）：run-tests Phase 5.2 收集于 logs/results/{tcId}/video.webm 与 trace.zip，
// 按磁盘实际存在扫描填充（此前 evidence 恒为空对象，renderEvidence 永远不输出 → "证据存档"区块
// 在 HTML 报告中永不渲染，与 SKILL.md 报告输出格式模板区块 6 声明不符 — 2026-08-26 审查修复）
const evidenceOf = (tcId) => {
  const ev = {};
  for (const [key, file] of [['video', 'video.webm'], ['trace', 'trace.zip']]) {
    if (fs.existsSync(path.join(e2eDir, 'logs', 'results', tcId, file))) {
      ev[key] = `../logs/results/${tcId}/${file}`;
    }
  }
  return ev;
};
const testCases = [...allTcIds].sort().map(tcId => {
  const log = checkpointLogs[tcId];
  const st = statusOf(tcId);
  const statusClass = st === 'PASSED' ? 'pass'
    : st === 'MANUAL_PASSED' ? 'manual-passed'
    : st === 'MANUAL_FAILED' ? 'manual-failed'
    : st === 'NEEDS_MANUAL' ? 'needs-manual'
    : (st === 'SKIPPED' || st === 'UNKNOWN') ? 'skip'
    : (st === 'FIXME' ? 'partial' : 'fail');
  const ops = (log && log.operations || []).map(op => ({
    operationIndex: op.operationIndex ?? op.label,
    status: op.status,
    statusClass: op.status === 'PASSED' ? 'pass' : 'fail',
    operationName: op.operationName || '',
    description: op.description || op.label || '',
    selector: op.selector || '',
    durationMs: op.durationMs ?? op.duration ?? 0,
    pageUrl: op.pageUrl || '',
    pageTitle: op.pageTitle || '',
    error: op.error ? { type: op.error.type || '', message: ((op.error.message || op.error || '').toString()).replace(/\[[0-9;]*m/g, ''), failureCategory: op.error.failureCategory || '' } : null,
    beforeScreenshotPath: toReportRel(op.beforeScreenshotPath),
    afterScreenshotPath: toReportRel(op.afterScreenshotPath),
  }));
  const cm = log ? log.consoleMessages : { total: 0, errors: 0, warnings: 0, messages: [] };
  const nr = log ? log.networkRequests : { total: 0, errors: 0, requests: [] };
  return {
    tcId, status: st, statusClass,
    description: '',  // checkpoint 日志无 TC 级描述字段，恒留空
    durationMs: log ? (log.duration || (log.operations || []).reduce((s, o) => s + (o.durationMs ?? o.duration ?? 0), 0)) : 0,
    operations: ops,
    consoleMessages: cm,
    networkRequests: nr,
    evidence: evidenceOf(tcId),
    logMissing: !log,
    // 人工测试结果（collect-manual 产出，仅 SKIPPED TC 可被覆盖）
    manualResult: manualResultsMap[tcId] || null,
  };
});

// 自愈日志（repair_history）
const healingLog = (runState && Array.isArray(runState.repair_history) ? runState.repair_history : [])
  .map(h => ({
    tcId: h.tcId, attempt: h.attempt || 1, timestamp: h.timestamp || '',
    failureType: h.failureType || h.issue || '', originalSelector: h.originalSelector || h.original || '',
    repairedSelector: h.repairedSelector || h.fix || '', strategy: h.strategy || '', success: h.success !== false,
    explanation: h.explanation || '',
  }));

// ---------- 模板渲染 ----------
// 从 ../template.html 提取 <style>（单一事实来源）；缺失 → 内置最小样式
let styleBlock = '';
const templatePath = path.join(__dirname, '..', 'template.html');
try {
  const tpl = fs.readFileSync(templatePath, 'utf-8');
  const m = tpl.match(/<style>[\s\S]*?<\/style>/);
  if (m) styleBlock = m[0];
} catch {}
if (!styleBlock) {
  styleBlock = `<style>
:root{--pass:#22C55E;--fail:#EF4444;--partial:#F59E0B;--skip:#94A3B8;--repaired:#3B82F6;--manual-pass:#0D9488;--bg:#F8FAFC;--card:#FFF;--text:#1E293B;--text-secondary:#64748B;--border:#E2E8F0;--primary:#2563EB;--radius:8px}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Segoe UI",sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.6;padding:24px}
h1{font-size:20px;margin-bottom:4px}h2{font-size:16px;margin:24px 0 12px}.meta{color:var(--text-secondary);font-size:12px;margin-bottom:24px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:24px}.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;text-align:center}.card .num{font-size:28px;font-weight:700}.card .label{font-size:12px;color:var(--text-secondary);margin-top:4px}.card.pass .num{color:var(--pass)}.card.fail .num{color:var(--fail)}.card.repair .num{color:var(--repaired)}.card.skip .num{color:var(--skip)}.card.manual .num{color:var(--manual-pass)}.card.rate .num{color:var(--primary)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px}th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--border)}th{background:#F1F5F9;font-weight:600;font-size:13px}td{font-size:13px}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}.badge-func{background:#FEE2E2;color:#DC2626}.badge-ux{background:#FEF3C7;color:#D97706}.badge-copy{background:#DBEAFE;color:#2563EB}.badge-sug{background:#F3F4F6;color:#6B7280}.badge-manual-passed{background:#CCFBF1;color:#0F766E}.badge-manual-failed{background:#FEE2E2;color:#DC2626}.badge-failcat-env{background:#E0F2FE;color:#0369A1}.badge-failcat-selector{background:#FEF3C7;color:#D97706}.badge-failcat-assertion{background:#FEE2E2;color:#DC2626}.badge-failcat-data{background:#EDE9FE;color:#6D28D9}.badge-failcat-unknown{background:#F3F4F6;color:#6B7280}
details{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;overflow:hidden}summary{padding:12px 16px;cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;gap:8px}summary::-webkit-details-marker{display:none}
.tc-status{display:inline-block;width:10px;height:10px;border-radius:50%;flex-shrink:0}.tc-status.pass{background:var(--pass)}.tc-status.fail{background:var(--fail)}.tc-status.partial{background:var(--partial)}.tc-status.skip{background:var(--skip)}.tc-status.manual-passed{background:var(--manual-pass)}.tc-status.manual-failed{background:var(--fail)}.tc-status.needs-manual{background:var(--partial)}
.tc-duration{margin-left:auto;font-weight:400;color:var(--text-secondary);font-size:12px}.tc-body{padding:0 16px 16px}.step{padding:8px 0;border-bottom:1px solid var(--border)}.step:last-child{border-bottom:none}.step-header{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:8px}.step-msg{font-size:12px;color:var(--text-secondary);margin-bottom:4px}.step-error{background:#FEF2F2;border:1px solid #FECACA;border-radius:4px;padding:8px 12px;font-size:12px;font-family:monospace;white-space:pre-wrap}.step-pair{display:flex;gap:12px;margin-top:8px}.step-pair img{max-width:48%;border:1px solid var(--border);border-radius:4px}
.heal-entry{padding:10px 14px;border-left:3px solid var(--repaired);background:#EFF6FF;margin-bottom:8px;border-radius:4px;font-size:13px}.heal-entry .time{font-size:11px;color:var(--text-secondary)}.heal-entry .strategy{font-family:monospace;font-size:12px}
.console-section{margin-top:16px}.network-section{margin-top:16px}.log-summary{font-size:12px;color:var(--text-secondary);margin-bottom:8px;cursor:pointer}.log-entry{font-family:monospace;font-size:11px;padding:2px 8px;border-bottom:1px solid #F1F5F9;display:flex;gap:8px}.network-entry{align-items:baseline}.console-entry .c-type{font-weight:600;min-width:60px;text-transform:uppercase;font-size:10px}.console-entry .c-type.error,.console-entry .c-type.unhandled_error{color:#EF4444}.console-entry .c-type.warning{color:#F59E0B}.console-entry .c-text{flex:1;word-break:break-all}.network-entry .n-status{font-weight:600;min-width:36px;text-align:center}.network-entry .n-status.error{color:#EF4444}.network-entry .n-method{min-width:48px;color:var(--text-secondary);font-size:10px}.network-entry .n-url{flex:1;word-break:break-all;font-size:10px}
@media (max-width:640px){body{padding:12px}.cards{grid-template-columns:repeat(2,1fr)}.step-pair{flex-direction:column}.step-pair img{max-width:100%}}
</style>`;
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 缺陷分类表（AI 的 defects.json → 类型分组）
const defectTypeMeta = {
  '功能缺陷': 'badge-func', '体验问题': 'badge-ux', '文案问题': 'badge-copy', '建议项': 'badge-sug',
};
const defectGroups = [];
const defectByType = {};
for (const d of defects) {
  const type = d.type || '建议项';
  (defectByType[type] = defectByType[type] || []).push(d);
}
for (const [type, list] of Object.entries(defectByType)) {
  defectGroups.push({
    type, typeClass: defectTypeMeta[type] || 'badge-sug', count: list.length,
    tcIds: list.map(d => d.tcId).join(', '),
    description: list.map(d => d.description).join('；'),
  });
}

// 问题清单：每条失败 TC 一行（从 FAILED TC 自动推导，defects.json 只补充类型/描述），建议项独立小节
// 概念统一（2026-08-01 PM 确认）：看板"问题" = 执行结果不符合用例预期的 TC（FAILED），与问题清单一一对应；
// "建议项"非问题（不影响验收），独立小节与问题区分。
function renderIssueList() {
  let html = '';
  if (issueList.length) {
    html += `<h2>问题清单（${issueList.length} 条 — 执行结果不符合用例预期）</h2>
${issueList.map(d => `
  <div class="issue-item">
    <div class="issue-header"><span class="badge ${defectTypeMeta[d.type] || 'badge-func'}">${esc(d.type || '功能缺陷')}</span>
      <span class="issue-tc">${esc(d.tcId)}</span><span class="issue-source">${d.source === 'manual' ? '人工验证发现' : '自动化执行发现'}</span></div>
    <div class="issue-desc">${esc(d.description)}</div>
  </div>`).join('')}`;
  }
  if (suggestions.length) {
    html += `<h2>建议项（${suggestions.length} 条 — 不影响验收，非问题）</h2>
${suggestions.map(d => `
  <div class="issue-item">
    <div class="issue-header"><span class="badge ${defectTypeMeta[d.type] || 'badge-sug'}">${esc(d.type || '建议项')}</span>
      <span class="issue-tc">${esc(d.tcId)}</span></div>
    <div class="issue-desc">${esc(d.description)}</div>
  </div>`).join('')}`;
  }
  return html;
}

function renderSteps(ops) {
  return ops.map(op => {
    const failcat = op.error && op.error.failureCategory ? `<span class="badge badge-failcat-${esc(op.error.failureCategory)}">${esc(op.error.failureCategory)}</span> ` : '';
    const err = op.error ? `<div class="step-error">${failcat}${esc(op.error.message || op.error.type)}</div>` : '';
    let pair = '';
    if (op.beforeScreenshotPath || op.afterScreenshotPath) {
      const before = op.beforeScreenshotPath ? `<img src="${esc(op.beforeScreenshotPath)}" alt="操作前" title="操作前">` : '';
      const after = op.afterScreenshotPath ? `<img src="${esc(op.afterScreenshotPath)}" alt="操作后" title="操作后">` : '';
      pair = `<div class="step-pair">${before}${after}</div>`;
    }
    return `
    <div class="step">
      <div class="step-header"><span class="tc-status ${op.statusClass}"></span><strong>步骤 ${op.operationIndex}</strong> — ${esc(op.description)}<span style="font-size:11px;color:var(--text-secondary);margin-left:auto;">${op.durationMs}ms</span></div>
      ${err}${pair}
    </div>`;
  }).join('');
}

function renderConsole(cm) {
  // errors=0 但 warnings>0 时也要渲染（warnings-only 场景不丢失）
  if (!cm || (!cm.errors && !cm.warnings)) return '';
  const entries = (cm.messages || []).map(m => `
    <div class="log-entry console-entry"><span class="c-type ${esc(m.type)}">${esc(m.type)}</span><span class="c-text">${esc(m.text)}</span></div>`).join('');
  return `<div class="console-section"><details><summary class="log-summary">🖥 控制台：${cm.errors} 错误 / ${cm.warnings} 警告 / ${cm.total} 总计</summary>${entries}</details></div>`;
}

function renderNetwork(nr) {
  // 有请求即使无错误也要渲染（errors=0 场景）；无任何请求才跳过
  if (!nr || !nr.total) return '';
  const entries = (nr.requests || []).map(r => `
    <div class="log-entry network-entry"><span class="n-status ${r.isError ? 'error' : ''}">${r.status}</span><span class="n-method">${esc(r.method)}</span><span class="n-url">${esc(r.url)}</span></div>`).join('');
  return `<div class="network-section"><details><summary class="log-summary">🌐 网络请求：${nr.errors} 错误 / ${nr.total} 总计</summary>${entries}</details></div>`;
}

function renderManualResult(tc) {
  const mr = tc.manualResult;
  if (!mr) return '';
  const statusLabel = mr.status === 'MANUAL_PASSED' ? '人工验证通过'
    : mr.status === 'MANUAL_FAILED' ? '人工验证失败' : '人工验证跳过';
  const badgeClass = mr.status === 'MANUAL_PASSED' ? 'badge-manual-passed'
    : mr.status === 'MANUAL_FAILED' ? 'badge-manual-failed' : 'badge-sug';
  let evidenceHtml = '';
  // ⚡ evidence === '无截图' 时显示文本而非 img（避免渲染指向不存在文件的破图，trap: execution_manual_screenshot_prompt）
  if (mr.evidence && mr.evidence !== '无截图') {
    const evidenceRel = `../logs/manual-evidence/${mr.evidence.replace(/\\/g, '/')}`;
    evidenceHtml = `<div class="step-pair" style="margin-top:8px;"><img src="${esc(evidenceRel)}" alt="人工验证截图" style="max-width:100%;border:1px solid var(--border);border-radius:4px;"></div>`;
  } else if (mr.evidence === '无截图') {
    evidenceHtml = `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">📷 无截图</div>`;
  }
  const defectInfo = mr.status === 'MANUAL_FAILED' && (mr.defectType || mr.defectDescription)
    ? `<div style="font-size:12px;color:#DC2626;margin-top:4px;">缺陷：${esc(mr.defectType || '')}${mr.defectType && mr.defectDescription ? ' — ' : ''}${esc(mr.defectDescription || '')}</div>` : '';
  // 返回内容块（不含 tc-body 包裹，由 renderTcDetails 外层统一包裹）
  return `<div style="padding:8px 0;font-size:13px;">
      <span class="badge ${badgeClass}">${esc(statusLabel)}</span>
      <span style="margin-left:12px;color:var(--text-secondary);">验证人：${esc(mr.executor || '未署名')}</span>
      <span style="margin-left:12px;color:var(--text-secondary);">时间：${esc(mr.resultTime || '')}</span>
    </div>
    <div style="font-size:13px;margin-top:4px;">${esc(mr.note || '')}</div>
    ${defectInfo}
    ${evidenceHtml}`;
}

function renderTcDetails() {
  return testCases.map(tc => {
    const missing = tc.logMissing ? `<div class="step-msg">⚠️ 日志缺失（可能使用非 Bash 捷径执行）</div>` : '';
    const manualBody = renderManualResult(tc);
    // ⚡ NEEDS_MANUAL 且无人工结果 → 显示"需人工复核"占位（脚本通过 ≠ 验证完成）
    const needsManualNote = tc.status === 'NEEDS_MANUAL' && !tc.manualResult
      ? `<div class="step-msg">⚠️ 需人工复核（${esc(summary.manualVerificationReason)}）— 自动化执行通过但结论待 collect-manual 人工确认</div>` : '';
    // 有人工结果 → 优先显示人工验证块（跳过 logMissing 警告）；否则正常渲染操作/日志
    const body = manualBody || `${missing}${needsManualNote}${renderSteps(tc.operations)}${renderConsole(tc.consoleMessages)}${renderNetwork(tc.networkRequests)}`;
    return `
<details ${tc.statusClass === 'fail' || tc.statusClass === 'partial' || tc.statusClass === 'manual-failed' ? 'open' : ''}>
  <summary><span class="tc-status ${tc.statusClass}"></span>${esc(tc.tcId)}: ${esc(tc.description || (tc.logMissing && !tc.manualResult ? '（无日志）' : ''))}<span class="tc-duration">${tc.durationMs}ms</span></summary>
  <div class="tc-body">${body}</div>
</details>`;
  }).join('');
}

// 自愈日志从 HTML 报告移除（PM 2026-08-01 确认）：修复过程是内部实现细节，PM 关注结果；
// 数据仍保留在 JSON 报告的 healingLog 字段与 run_state.repair_history，供 review-tests 复盘消费。
// （原 renderHealingLog 已删除，healingLog 变量保留供 JSON 输出）

function renderEvidence() {
  const items = testCases.filter(tc => tc.evidence && (tc.evidence.video || tc.evidence.trace))
    .map(tc => `<li><strong>${esc(tc.tcId)}</strong>：${tc.evidence.video ? `<a href="${esc(tc.evidence.video)}">录像</a>` : ''}${tc.evidence.video && tc.evidence.trace ? ' | ' : ''}${tc.evidence.trace ? `<a href="${esc(tc.evidence.trace)}">Trace</a>` : ''}</li>`).join('');
  if (!items) return '';
  return `<h2>证据存档</h2><ul style="margin-left:20px;font-size:13px;">${items}</ul>`;
}

const now = new Date().toISOString();
// ⚡ 标题明确化（2026-08-01）：功能名 + 版本号 + 验收测试报告；版本号紧邻功能名（读作"N 版本的功能"），
// 不放末尾（避免误读为"报告 v1.0.0"）；featureName 取不到时用通用标题（不再退化为冗余拼接标题）
const reportTitle = config.featureName
  ? `${config.featureName}${config.version ? ' v' + config.version : ''} 验收测试报告`
  : '验收测试报告';
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(reportTitle)}</title>
${styleBlock}
</head>
<body>
<h1>${esc(reportTitle)}</h1>
<div class="meta">
  <div>目标：<a href="${esc(config.targetUrl || '')}">${esc(config.targetUrl || '')}</a></div>
  <div>生成时间：${esc(now)}</div>
  <div>版本：${esc(config.version || '')}</div>
</div>
<h2>执行摘要</h2>
<!-- ■ 自动化测试 -->
<div class="group-label">自动化测试</div>
<div class="cards">
  <div class="card"><div class="num">${summary.executed}</div><div class="label">执行</div></div>
  <div class="card pass"><div class="num">${summary.passed}</div><div class="label">通过</div></div>
  <div class="card fail"><div class="num">${summary.failed}</div><div class="label">问题</div></div>
  <div class="card rate"><div class="num">${summary.executedRate}%</div><div class="label">通过率（已执行口径）</div></div>
</div>
<!-- ■ 人工测试 -->
<div class="group-label">人工测试</div>
<div class="cards">
  <div class="card"><div class="num">${summary.manualExecuted}</div><div class="label">验证</div></div>
  <div class="card pass"><div class="num">${summary.manualPassed}</div><div class="label">通过</div></div>
  <div class="card fail"><div class="num">${summary.manualFailed}</div><div class="label">问题</div></div>
  <div class="card rate"><div class="num">${summary.manualRate === null ? '—' : summary.manualRate + '%'}</div><div class="label">通过率</div></div>
</div>
<!-- ■ 跳过（未执行） -->
<div class="group-label">跳过（${summary.skipped} 条未执行）</div>
<div class="skip-detail">
  ${summary.skippedTcIds.map(id => `<div class="skip-item"><span class="skip-tc">${esc(id)}</span><span class="skip-reason">${esc(reasonOf(id))}</span></div>`).join('')}
</div>
<!-- ■ 需人工复核（NEEDS_MANUAL，0 条不渲染） -->
${summary.needsManualTcIds.length ? `<div class="group-label">需人工复核（${summary.needsManual} 条待人工确认）</div>
<div class="skip-detail">
  ${summary.needsManualTcIds.map(id => `<div class="skip-item"><span class="skip-tc">${esc(id)}</span><span class="skip-reason">${esc(summary.manualVerificationReason)}</span></div>`).join('')}
</div>` : ''}
<!-- ■ 全量统计 -->
<div class="group-label">全量统计</div>
<div class="cards">
  <div class="card"><div class="num">${summary.total}</div><div class="label">用例总数</div></div>
  <div class="card pass"><div class="num">${summary.passed + summary.manualPassed}</div><div class="label">通过</div></div>
  <div class="card fail"><div class="num">${summary.failed + summary.manualFailed}</div><div class="label">问题</div></div>
  <div class="card skip"><div class="num">${summary.skipped}</div><div class="label">跳过</div></div>
  <div class="card rate"><div class="num">${summary.passRate}%</div><div class="label">通过率（不含需人工复核）</div></div>
</div>
<div class="summary-note">注："问题"= 执行结果不符合用例预期的 TC（即功能缺陷），详情见下方"问题清单"；人工测试"验证"= 跳过 TC 经人工确认得出通过/问题结论的条数；自动化通过率 = ${summary.passed}/${summary.executed}（已执行口径），全量通过率 = ${summary.passed + summary.manualPassed}/${summary.total - summary.needsManual}（分母含未执行跳过、不含需人工复核）。修复 ${summary.repaired} 次为执行过程信息，已计入"通过"。</div>
${renderIssueList()}
<h2>测试用例详情</h2>
${renderTcDetails()}
${renderEvidence()}
</body>
</html>`;

// ---------- JSON 报告（事实来源） ----------
const jsonReport = {
  metadata: {
    generatedAt: now,
    targetUrl: config.targetUrl || '',
    version: config.version || '',
    featureName: config.featureName || '',
  },
  summary,
  defects: [...issueList, ...suggestions].map(d => ({ type: d.type, tcId: d.tcId, description: d.description, source: d.source || 'auto' })),
  testCases: testCases.map(tc => ({
    tcId: tc.tcId, status: tc.status, durationMs: tc.durationMs, logMissing: tc.logMissing,
    manualResult: tc.manualResult,
    evidence: tc.evidence,
    operations: tc.operations.map(op => ({ operationIndex: op.operationIndex, status: op.status, operationName: op.operationName, description: op.description, durationMs: op.durationMs, error: op.error })),
    consoleMessages: tc.consoleMessages, networkRequests: tc.networkRequests,
  })),
  healingLog,
};

// ---------- 落盘 ----------
const reportDir = path.join(e2eDir, 'report');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'final-report.html'), html, 'utf-8');
fs.writeFileSync(path.join(reportDir, 'final-report.json'), JSON.stringify(jsonReport, null, 2), 'utf-8');

console.log(JSON.stringify({
  ok: true,
  report: path.join(reportDir, 'final-report.html'),
  summary,
  checkpointLogs: Object.keys(checkpointLogs).length,
  defectGroups: defectGroups.length,
}));
