#!/usr/bin/env node
// gate-check.cjs — P0-8 trap 复发机械检查（setup-tests Phase 3.7 + Phase 3.6 子 agent 自检）
// 用法: node gate-check.cjs --tsDir <时间戳目录绝对路径> [--files <spec文件名逗号列表>] [--emitTraps]
//       --tsDir     = $PRJ/$VER/e2e/{ts}
//       --files     = 子 agent 自检：只扫列出的 .spec.ts（selector-lib.ts 恒扫，父 agent 已生成完毕无竞态）
//       --emitTraps = 打印合并去重后的 traps JSON 后 exit 0（不扫描），供生成包下发生成约束
// 扫描: scripts/*.spec.ts + scripts/assets/selector-lib.ts（DEF 定义区）
// 合并: 工厂 FIXED_TRAPS + 用户级/项目级/当次 traps.json（按 scope 去重，用户级优先）
// 输出: 'PASS — 无 trap 复发（共检查 N 条 trap）'（exit 0）| 'BLOCKED — trap 复发: <JSON>'（exit 1）
// exit code: 0 = PASS | 1 = 复发/运行错误 | 2 = 用法错误（--tsDir 缺失或不存在）
//
// 与旧 heredoc 逻辑（gate-check-commands.md v2.0.0 前）的差异，仅两处声明式豁免，其余 1:1 搬运：
//   (1) selector-lib.ts 只扫 DEF 条目行（含 "{ m: '" 的行）——loc()/selDesc() 函数体是模板基础设施
//       （如 base.getByText(d.a[0]) 兜底行），任何项目相同，扫描纯属误报噪音
//   (2) grepPattern 含 'el-range-input' 的 trap 对 selector-lib.ts 豁免——Phase 3.2 规定
//       .el-range-input 是 el-date-picker 正确 CSS 类，DEF 中出现属正常用法（防 trap 误报）
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--tsDir') args.tsDir = argv[++i];
    else if (argv[i] === '--files') args.files = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (argv[i] === '--emitTraps') args.emitTraps = true;
  }
  return args;
}

const { tsDir, files, emitTraps } = parseArgs(process.argv);
if (!tsDir || !fs.existsSync(tsDir)) {
  console.error('Usage: node gate-check.cjs --tsDir <时间戳目录绝对路径> [--files <spec文件名逗号列表>] [--emitTraps]');
  process.exit(2);
}

// ---------- 工厂陷阱 grepPattern（技能内置，随版本维护；与 SKILL.md"工厂陷阱（内置）"章节对应） ----------
const FIXED_TRAPS = [
  'getByText\\([^)]*\\)',
  "getByRole\\('table'\\)",
  'assert_visible.*(date|日期|combobox).*默认|默认.*(日期|时间范围)',
  'test\\.fail',
  'networkidle',
  "^import \\{ (?!.*\\bexpect\\b).*\\} from '@playwright/test'$",
  'storageState',
  'DATEPICKER|el-range-input',
  'toHaveText\\(.*header|toHaveText.*(工单号|游戏|迁移内容|表头|账号|时间|渠道)',
  'locator([^)]*).evaluate',
  'outputDir:.*logs/results',
  'dateSelector|DATE_RANGE_INPUT.*reset|重置.*el-range-input',
  'source.*manual',
  'assert_loading',
  'invalid_page|GO_PAGE',
  'BTN_PREV|BTN_NEXT',
  'MENU_ACCOUNT_QUERY.*click|expand_menu',
  'el-card.*filter|filter.*hasText.*卡片',
  "共 20 条|toHaveValue\\('2'\\).*末页",
  '不断言|不验证|可能为空或非空|按线上行为断言',
  '不断言具体行数|结果可能为空或非空|不验证具体'
];

const userDataRoot = (process.env.USERPROFILE || process.env.HOME).replace(/\\/g, '/') + '/.claude/user-data';

const main = () => {
  // 1. 动态合并 traps（scope 去重用户级优先——文档声明（SKILL.md"工厂陷阱"节）与实现一致）
  //    合并顺序：用户级（PM 确认的跨项目通用教训，最高权威）→ 项目级 → 当次；first-seen-wins 保证冲突时用户级胜出。
  //    此前实现为 [当次, 项目级, 用户级]，first-seen-wins 使当次优先，与"用户级优先"声明相反（2026-08-26 审查修复）。
  const trapFiles = [
    path.join(userDataRoot, 'pmcraft-test', 'traps.json'), // 用户级（跨项目共享，升级不覆盖；scope 冲突时优先）
    path.join(tsDir, '..', 'traps.json'),                 // 项目级 = $PRJ/$VER/e2e/traps.json
    path.join(tsDir, 'traps.json')                        // 当次（Phase 3.6 修复沉淀）
  ];
  let traps = FIXED_TRAPS.map(p => ({ pattern: '(工厂)', grepPattern: p }));
  const seen = new Set();
  for (const f of trapFiles) {
    if (!fs.existsSync(f)) continue;
    let list;
    try { list = JSON.parse(fs.readFileSync(f, 'utf-8')); }
    catch (e) { throw new Error(`TRAPS_PARSE_ERROR: ${f} — ${e.message}`); }
    if (!Array.isArray(list)) throw new Error(`TRAPS_PARSE_ERROR: ${f} — 顶层应为数组`);
    for (const t of list) {
      if (t && !seen.has(t.scope)) { seen.add(t.scope); traps.push(t); }
    }
  }

  // 2. --emitTraps：打印合并去重后的 traps JSON 后直接退出（不扫描），供子 agent 生成包下发生成约束；
  //    合并逻辑单一权威来源（与扫描共用 1 步的合并结果）
  if (emitTraps) {
    console.log(JSON.stringify(traps));
    process.exit(0);
  }

  // 3. 逐 trap 扫描（外层 trap、内层文件/行，命中收集 `${相对路径}:${行号}:${行}`，每条最多 3 个命中）
  const hits = [];
  const scanFiles = (relDir) => {
    const absDir = path.join(tsDir, relDir);
    if (!fs.existsSync(absDir)) return [];
    return fs.readdirSync(absDir).filter(f => f.endsWith('.spec.ts') || f === 'selector-lib.ts');
  };
  for (const t of traps) {
    if (!t.grepPattern) continue;
    let re;
    try { re = new RegExp(t.grepPattern); } catch { continue; }  // 正则非法则跳过该 trap（与旧行为一致）
    const libExemptElRange = t.grepPattern.includes('el-range-input');  // 豁免 (2)
    const matches = [];
    for (const dir of ['scripts', 'scripts/assets']) {
      for (const f of scanFiles(dir)) {
        // --files 过滤只作用于 .spec.ts（子 agent 自检只扫本组文件）；selector-lib.ts 恒扫
        // （父 agent 在子 agent 启动前已生成完毕，无竞态；并行子 agent 互不读对方半成品）
        if (files && files.length && f.endsWith('.spec.ts') && !files.includes(f)) continue;
        const abs = path.join(tsDir, dir, f);
        if (!fs.statSync(abs).isFile()) continue;
        if (f === 'selector-lib.ts' && libExemptElRange) continue;       // 豁免 (2)
        const lines = fs.readFileSync(abs, 'utf-8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (f === 'selector-lib.ts' && !lines[i].includes("{ m: '")) continue;  // 豁免 (1): 只扫 DEF 条目行
          if (re.test(lines[i])) matches.push(`${dir}/${f}:${i + 1}:${lines[i].trim()}`);
        }
      }
    }
    if (matches.length) hits.push({ trap: t.pattern, matches: matches.slice(0, 3) });
  }

  // 4. 输出（与 heredoc 逐字一致）
  if (hits.length) { console.log('BLOCKED — trap 复发:', JSON.stringify(hits, null, 2)); process.exit(1); }
  console.log('PASS — 无 trap 复发（共检查', traps.length, '条 trap）');
  process.exit(0);
};

try { main(); } catch (e) { console.error('GATE_CHECK_ERROR: ' + e.message); process.exit(1); }
