#!/usr/bin/env node
/**
 * guard-preamble-insert.js — 27 个 SKILL.md 批量插入「Guard-Chat 守卫检查（第 0 步）」preamble
 *
 * 用法：node guard-preamble-insert.js [--apply] [--reapply]
 *   不带 --apply → dry-run，只打印每个文件的插入点
 *   带 --apply    → 实际写入（先备份原文件为 .bak）
 *   带 --reapply  → 已含本小节的文件：整段删除旧小节后重新插入新 PREAMBLE（PREAMBLE 文案修订的传播入口）
 *                  （隐含 --apply；.bak 仅在不存在时写，保留首次插入前备份）
 *
 * 插入规则：正文第一个 `## ` 二级标题之后、第二个 `## ` 之前
 * （跳过围栏代码块内的 `## ` 行；不修改 frontmatter）。
 *
 * 未来修订：修改下方 PREAMBLE 常量后运行 node guard-preamble-insert.js --reapply 即可（新文件插入，旧文件整段替换）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MARKET_ROOT = path.resolve(__dirname, '..', '..', '..'); // _shared/scripts/lib → pmcraft/
const COACH_DIR = path.join(MARKET_ROOT, 'pmcraft-coach', 'skills');
const REQ_DIR = path.join(MARKET_ROOT, 'pmcraft-req', 'skills');

const FILES = [
  ...[
    'concept-coach',
    'grilling-coach',
    'thinking-coach',
  ].map((n) => path.join(COACH_DIR, n, 'SKILL.md')),
  ...[
    'analyze-business',
    'analyze-competitor',
    'append-prd',
    'check-consistency',
    'compact-prd',
    'deploy-survey',
    'design-interview',
    'design-survey',
    'explore-solutions',
    'generate-flowchart',
    'generate-prd',
    'generate-sequence',
    'generate-testcase',
    'log-decisions',
    'plan-iteration',
    'review-brief',
    'review-journey',
    'review-prd',
    'revise-from-meeting',
    'revise-prd',
    'save-doc',
    'synthesize-research',
    'verify-direction',
    'write-brief',
  ].map((n) => path.join(REQ_DIR, n, 'SKILL.md')),
];

const MARKER = '## Guard-Chat 守卫检查（第 0 步）';

const PREAMBLE = `## Guard-Chat 守卫检查（第 0 步）

> 本小节为守卫开关检查，**不阻塞**主流程：执行完直接进入下一节。**子代理上下文**（被 spawn 执行、无法与用户交互，如 doc-reviewer/design-reviewer）整节静默跳过——不询问、不标记、不检测。

1. 运行 \`node "{插件根}/_shared/scripts/guard-chat.js" status\`，\`{插件根}\` = 从当前 SKILL.md 目录向上找第一个含 \`_shared/scripts/guard-chat.js\` 的祖先目录（source 环境=市场根，cache 环境=插件版本目录）。
2. 解析单行 JSON（契约：\`{"status":"ok","data":{"enabled":bool,"prompted":bool,"dir":"…"}}\`）：
   - \`prompted=false\` → 按话术库 GUARD-ASK（\`enabled=false\`）或 GUARD-ON（\`enabled=true\`）提示一次，然后运行 \`node "{插件根}/_shared/scripts/guard-chat.js" mark-prompted\`。用户紧随询问回复肯定意图（如「开启」），或任意轮次说「开启Guard-Chat」（路由表已注册）时，运行 \`guard-chat.js enable\`。
   - \`prompted=true\` → 跳过，不重复提示。
   - 话术库不可达（项目未跑 init-project、无大脑注入）→ 用兜底一句：「本会话可开启 Guard-Chat 守卫：开启后，你输入中可能影响判断的表述（如预设立场、权威宣称、逻辑谬误）会当场标注提醒；落盘文档中的对话填充语（如“好问题”、“希望对你有帮助”）会自动清除。说「开启Guard-Chat」开启（回复「开启」也可以），本会话只问一次。」（兜底非权威副本，有话术库时必须用话术库）
3. 脚本不可用（node 缺失/脚本缺失/JSON 解析失败）→ 静默跳过，继续主流程。
4. 本技能对话期间（仅 \`enabled=true\` 时）：① 每条用户消息经 \`guard-chat.js detect\`（stdin）检测，命中时单行简短标记，不打断流程；② 文档落盘前（save-doc 保存、直接写入报告文件）经 \`guard-chat.js purify\`（stdin）净化。规则见路由大脑「Guard-Chat 守卫行为」节。对话回复文风遵循 agent 定义的文风底线（无需脚本）。
`;

/** 从 lines[from] 起（含）找第一个 `## ` 二级标题行号（跳过围栏代码块内的行） */
function findNextH2(lines, from) {
  let fence = null;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      const f = fenceMatch[1];
      if (fence === f) fence = null;
      else fence = f;
      continue;
    }
    if (fence) continue;
    if (/^##\s+/.test(line)) return i;
  }
  return -1;
}

/** 找正文（frontmatter 后、围栏代码块外）第 1、2 个 `## ` 二级标题行号 */
function findInsertLine(lines) {
  const first = findNextH2(lines, 0);
  return { first, second: first < 0 ? -1 : findNextH2(lines, first + 1) };
}

function main() {
  const reapply = process.argv.includes('--reapply');
  const apply = process.argv.includes('--apply') || reapply;
  let ok = 0, skipped = 0, errors = 0;

  for (const file of FILES) {
    if (!fs.existsSync(file)) { console.log(`[缺失] ${file}`); errors++; continue; }
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');

    if (text.includes(MARKER)) {
      if (!reapply) { console.log(`[已存在] ${path.relative(MARKET_ROOT, file)}`); skipped++; continue; }
      // reapply：整段删除旧小节（MARKER 行到下一 H2 前），原地插入新 PREAMBLE
      const markerIdx = lines.findIndex((l) => l.includes(MARKER));
      const end = findNextH2(lines, markerIdx + 1);
      const cut = end < 0 ? lines.length : end;
      if (!fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', text, 'utf8');
      const newText = lines.slice(0, markerIdx).join('\n') + (markerIdx > 0 ? '\n' : '') + PREAMBLE.trimEnd() + '\n\n' + lines.slice(cut).join('\n');
      fs.writeFileSync(file, newText, 'utf8');
      console.log(`[已替换] ${path.relative(MARKET_ROOT, file)}（第 0 步小节整段替换）`);
      ok++;
      continue;
    }

    const { first, second } = findInsertLine(lines);
    if (first < 0 || second < 0) { console.log(`[跳过-不足两个H2] ${path.relative(MARKET_ROOT, file)}`); errors++; continue; }
    const preview = `${path.relative(MARKET_ROOT, file)}: 第1个H2@${first + 1}「${lines[first].trim()}」 → 插在 第2个H2@${second + 1}「${lines[second].trim()}」之前`;
    if (!apply) { console.log(`[dry-run] ${preview}`); ok++; continue; }
    const newText = lines.slice(0, second).join('\n') + (second > 0 ? '\n' : '') + PREAMBLE.trimEnd() + '\n\n' + lines.slice(second).join('\n');
    fs.writeFileSync(file + '.bak', text, 'utf8');
    fs.writeFileSync(file, newText, 'utf8');
    console.log(`[已插入] ${preview}`);
    ok++;
  }
  console.log(`\n共 ${FILES.length} 个文件：${ok} 成功${apply ? '' : '（dry-run）'} / ${skipped} 已存在跳过 / ${errors} 异常`);
}

main();
