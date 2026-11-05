#!/usr/bin/env node
// walkthrough-report-gen.cjs — 体验走查报告渲染固化（walkthrough Phase 9.6）
// 读取 walkthrough-findings.json → 汇总 → 渲染自包含 HTML → 写 walkthrough-report.html/.json
// 用法: node walkthrough-report-gen.cjs --walkthroughDir <时间戳目录>
// 说明: 零依赖（纯 Node 内置模块）；样式从同目录 ../walkthrough-report-template.html 的 <style> 块提取（单一事实来源）；
//       AI 只负责出清单/提取/归类（写 walkthrough-findings.json），渲染全由本脚本完成。
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--walkthroughDir') args.walkthroughDir = argv[++i];
  }
  return args;
}

const { walkthroughDir } = parseArgs(process.argv);
if (!walkthroughDir || !fs.existsSync(walkthroughDir)) {
  console.error('Usage: node walkthrough-report-gen.cjs --walkthroughDir <时间戳目录>');
  process.exit(1);
}

// ---------- 读取数据 ----------
const wtRoot = path.join(walkthroughDir, 'walkthrough');
const findingsPath = path.join(wtRoot, 'walkthrough-findings.json');
const readJson = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
};
const data = readJson(findingsPath, null);
if (!data || !data.session || !Array.isArray(data.findings)) {
  console.error(`未找到有效的 walkthrough-findings.json：${findingsPath}（请先完成 Phase 9.5 写盘）`);
  process.exit(1);
}

// ---------- 样式提取（单一事实来源） ----------
const templatePath = path.join(__dirname, '..', 'walkthrough-report-template.html');
let styleBlock = '';
try {
  const tpl = fs.readFileSync(templatePath, 'utf-8');
  const m = tpl.match(/<style>[\s\S]*?<\/style>/);
  styleBlock = m ? m[0] : '';
} catch {}
if (!styleBlock) {
  styleBlock = `<style>
body{font-family:"Segoe UI",-apple-system,sans-serif;background:#F8FAFC;color:#1E293B;font-size:14px;line-height:1.6;padding:24px}
h1{font-size:20px}h2{font-size:16px;margin:24px 0 12px}.meta{color:#64748B;font-size:12px}
.verdict-card{background:#fff;border:1px solid #E2E8F0;border-left:5px solid #2563EB;border-radius:8px;padding:16px 20px;margin-bottom:12px}
.disclaimer{font-size:12px;color:#64748B;margin-top:10px;padding:8px 12px;background:#FFFBEB;border-left:3px solid #F59E0B;border-radius:4px}
.issue-item{background:#fff;border:1px solid #E2E8F0;border-left:3px solid #F59E0B;border-radius:8px;padding:10px 14px;margin-bottom:8px}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
</style>`;
}

// ---------- 工具 ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const severityClass = { '严重': 'severe', '中等': 'medium', '轻微': 'minor' };
const severityBadge = { '严重': 'badge-severe', '中等': 'badge-medium', '轻微': 'badge-minor' };
const emotionClass = { '困惑': 'emotion-confusion', '挫败': 'emotion-frustration', '失望': 'emotion-frustration', '惊喜': 'emotion-delight', '满意': 'emotion-delight', '焦虑': 'emotion-frustration' };
const verdictClass = { 'GO': 'go', 'GO-with-conditions': 'cond', 'NO-GO': 'nogo' };
const verdictLabel = { 'GO': 'GO — 接受交付', 'GO-with-conditions': 'GO-with-conditions — 有条件接受', 'NO-GO': 'NO-GO — 不接受' };

const { session, journeys = [], findings = [] } = data;
const execLabel = (ex) => ex === 'peer' ? '同事走查' : (ex === 'pm' ? 'PM 亲手' : (ex || '未署名'));

// ---------- 区块 1：会话元信息 ----------
const metaHtml = `
<div class="meta">
  <b>${esc(session.featureName || '产品')}</b> 体验走查报告
  &nbsp;|&nbsp; e2e 目录：${esc(session.e2eDir)}
  &nbsp;|&nbsp; 目标：<a href="${esc(session.targetUrl)}">${esc(session.targetUrl)}</a>
  &nbsp;|&nbsp; 人设：${esc(session.persona || '—')}
  &nbsp;|&nbsp; 执行者：${esc(session.executor || '未署名')}
  &nbsp;|&nbsp; 时间：${esc(session.startedAt || '—')}
</div>`;

// ---------- 区块 2：接受度表态 ----------
const verdict = session.verdict;
const conditions = (data.conditions && Array.isArray(data.conditions)) ? data.conditions : [];
let verdictHtml = '';
if (verdict) {
  const vc = verdictClass[verdict] || '';
  verdictHtml = `
<h2>接受度表态</h2>
<div class="verdict-card ${vc}">
  <div class="verdict-title">${esc(verdictLabel[verdict] || verdict)}</div>
  ${conditions.length ? `<ul class="verdict-conditions">${conditions.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  <div class="disclaimer">⚠️ 代理声明：本表态基于 ${execLabel(session.executor)} 亲手体验（走查性质），未含真实用户验证；高风险产品建议补充真实用户测试。</div>
</div>`;
} else {
  verdictHtml = `
<h2>接受度表态</h2>
<div class="verdict-card"><div class="verdict-title" style="color:#64748B">未表态</div>
<div class="disclaimer">⚠️ 代理声明：本表态基于 ${execLabel(session.executor)} 亲手体验（走查性质），未含真实用户验证；高风险产品建议补充真实用户测试。</div></div>`;
}

// ---------- 区块 3：探索旅程总览 ----------
let journeyHtml = '';
if (journeys.length) {
  journeyHtml = `
<h2>探索旅程总览</h2>
${journeys.map(j => `
<div class="journey-item">
  <div class="journey-header">
    <span class="journey-id">${esc(j.id)}</span>
    <span class="journey-name">${esc(j.name)}</span>
    <span class="badge badge-exec">${execLabel(j.executor || session.executor)}</span>
  </div>
  <div class="journey-path">${esc((j.path || []).join(' → '))}</div>
</div>`).join('')}`;
}

// ---------- 区块 4：发现清单（按类型+严重度分组） ----------
const typeOrder = ['功能缺陷', '体验问题', '文案问题', '建议项'];
const sevOrder = ['严重', '中等', '轻微'];
let issueHtml = '';
if (findings.length) {
  const blocks = typeOrder.filter(t => findings.some(f => f.type === t)).map(t => {
    const items = findings.filter(f => f.type === t)
      .sort((a, b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity))
      .map(f => `
<div class="issue-item ${severityClass[f.severity] || ''}">
  <div class="issue-header">
    <span class="issue-id">${esc(f.id)}</span>
    <span class="badge ${severityBadge[f.severity] || ''}">${esc(f.severity || '—')}</span>
    <span class="badge badge-exec">${execLabel(f.executor)}</span>
    ${f.relatedTc ? `<span class="issue-extra">与 ${esc(f.relatedTc)} 重复（不重复计数）</span>` : ''}
  </div>
  <div class="issue-desc">${esc(f.description)}</div>
  ${f.suggestedFix ? `<div class="issue-fix"><b>建议：</b>${esc(f.suggestedFix)}</div>` : ''}
  <div class="issue-extra">${esc(f.step || '')}${f.screenshot ? ` ｜ 📷 ${esc(f.screenshot)}` : ''}${f.followUp ? ` ｜ 流转：${esc(f.followUp)}` : ''}</div>
</div>`).join('');
    return `<div class="group-label">${t}（${items.split('</div>').filter(x => x.includes('issue-header')).length} 条）</div>${items}`;
  });
  issueHtml = `<h2>发现清单</h2>${blocks.join('')}`;
} else {
  issueHtml = `<h2>发现清单</h2><div class="section-note">本轮走查未记录发现。</div>`;
}

// ---------- 区块 5：情绪体感记录 ----------
let emotionHtml = '';
const emotionFindings = findings.filter(f => f.emotion);
if (emotionFindings.length) {
  emotionHtml = `
<h2>情绪体感记录</h2>
${emotionFindings.map(f => `
<div class="emotion-block">
  <span class="emotion-tag ${emotionClass[f.emotion] || ''}">${esc(f.emotion)}</span>
  <span class="issue-id">${esc(f.id)}</span> ${esc(f.description)}
  <div class="issue-extra">${execLabel(f.executor)} ｜ ${esc(f.step || '')}</div>
</div>`).join('')}`;
}

// ---------- 区块 6：多视角对比 ----------
const cross = session.crossCheck;
let crossHtml = '';
if (cross) {
  const rows = [
    { key: 'both', label: '相同发现（高置信）', cls: 'cross-both' },
    { key: 'pmOnly', label: '仅亲手发现（作者偏差区）', cls: 'cross-pm' },
    { key: 'peerOnly', label: '仅他人发现（自解释性盲区）', cls: 'cross-peer' },
  ].filter(r => Array.isArray(cross[r.key]) && cross[r.key].length);
  if (rows.length) {
    crossHtml = `
<h2>多视角对比</h2>
${rows.map(r => `
<div class="cross-item">
  <span class="cross-tag ${r.cls}">${r.label}</span>
  ${cross[r.key].map(t => `<div class="issue-extra">• ${esc(t)}</div>`).join('')}
</div>`).join('')}
${cross.note ? `<div class="section-note">${esc(cross.note)}</div>` : ''}`;
  }
}

// ---------- 区块 7：衔接说明 ----------
const finalReportRel = path.join('..', 'report', 'final-report.html').replace(/\\/g, '/');
const linkHtml = `<div class="link-note">
📎 本报告为体验走查独立报告（走查性质，非测试、非真实用户验收），不合并自动化验收报告。
自动化验收报告见 <a href="${esc(finalReportRel)}">report/final-report.html</a>（相对链接，跨机器可开）。
</div>`;

// ---------- 组装 ----------
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>体验走查报告 — ${esc(session.featureName || '产品')}</title>
${styleBlock}
</head>
<body>
<h1>体验走查报告</h1>
${metaHtml}
${verdictHtml}
${journeyHtml}
${issueHtml}
${emotionHtml}
${crossHtml}
${linkHtml}
</body>
</html>`;

// ---------- 写盘 ----------
const outHtml = path.join(wtRoot, 'walkthrough-report.html');
const outJson = path.join(wtRoot, 'walkthrough-report.json');
fs.writeFileSync(outHtml, html, 'utf-8');
fs.writeFileSync(outJson, JSON.stringify({ session, journeys, findings, conditions, generatedAt: new Date().toISOString() }, null, 2), 'utf-8');
console.log(`✅ 体验走查报告已生成：${outHtml}`);
console.log(`   发现 ${findings.length} 条，旅程 ${journeys.length} 条，表态：${verdict || '未表态'}`);
