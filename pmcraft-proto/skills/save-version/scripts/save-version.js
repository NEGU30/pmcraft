#!/usr/bin/env node
/**
 * save-version.js — 原型版本存档（替代原 SKILL.md 中 LLM 手动执行的存档流程）
 *
 * 功能：E 编号检测（最大+1/断层）→ working/ 必须文件检查 → 按排除规则复制到 E{N}/
 *       → CHANGELOG 累积追加 → main/ 同步（--main）→ 更新 _index.md
 *
 * 用法：
 *   node save-version.js --version-dir=<版本目录> [--e-number=N] [--main]
 *     [--changelog-new=<条目1,条目2>] [--changelog-changed=<...>] [--changelog-fixed=<...>]
 *     [--author=<负责人>] [--answers=<决策1,决策2>] [--dry-run]
 *
 * 交互模式（聚合一次收集）：
 *   首次运行无 --answers 且存在待决策项 → 返回 status:"interaction"，
 *   data 包含全部待决策项及选项。LLM 用 AskUserQuestion 收集 PM 决策后，
 *   携带完整参数（--e-number/--main/--answers）重调脚本一次完成存档。
 *
 *   --answers 可选值：
 *     fill_<N>       填补断层 E<N>
 *     continue_<N>   从 E<N> 继续（跳过断层）
 *     overwrite      覆盖已存在的目标 E 目录
 *     continue_missing 缺必须文件仍继续保存
 *     sync_main      存档后同步到 main/
 *     no_main        不同步 main/
 *     e_ok           确认自动建议的 E 编号
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
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
const { ok, fail, usage, interact } = require(path.join(sharedLib, 'json-output'));
const { toForwardSlashes, ensureDir, copyDir, readUtf8, writeUtf8 } = require(path.join(sharedLib, 'encoding'));
const { scanE, findGap, maxE } = require('./lib/enum-scanner');
const { findVersionDir } = require(path.join(sharedLib, 'version-scanner'));

/** 运行时定位 pmcraft-req 的 save-doc.js（与 deploy-survey.js resolveProtoCloseBat 同款逻辑）：
 * 从本脚本位置逐级向上找 pmcraft-req 插件目录（源环境=marketplace 根，cache 环境=插件缓存根 pmcraft/），
 * 再定位其 save-doc 技能脚本；插件版本目录（cache 环境的 {版本}/ 层级）自动探测。 */
function resolveSaveDocJs() {
  let dir = __dirname;
  for (;;) {
    const reqDir = path.join(dir, 'pmcraft-req');
    if (fs.existsSync(reqDir) && fs.statSync(reqDir).isDirectory()) {
      const candidates = [];
      const direct = path.join(reqDir, 'skills');
      if (fs.existsSync(direct)) candidates.push(direct);
      for (const e of fs.readdirSync(reqDir)) {
        if (/^\d+\.\d+\.\d+$/.test(e)) candidates.push(path.join(reqDir, e, 'skills'));
      }
      for (const sc of candidates) {
        const f = path.join(sc, 'save-doc', 'scripts', 'save-doc.js');
        if (fs.existsSync(f)) return f;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ===== 参数解析 =====
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

// ===== 存档排除规则（与 SKILL.md 第五步一致） =====
const EXCLUDES = ['spec.md', 'preview.html', 'preview-key-page.html', 'preview-dark.html', 'feedback.md', '.dead/', 'mock/.server.pid'];

// ===== 必须文件（与 SKILL.md 第三步一致） =====
const REQUIRED = ['index.html', 'DESIGN.md', 'design-system.css', 'page-inventory.md'];

/** 检查 working/ 下必须文件；返回缺失列表 */
function checkRequired(workingDir) {
  const missing = [];
  for (const f of REQUIRED) {
    if (!fs.existsSync(path.join(workingDir, f))) missing.push(f);
  }
  const pagesDir = path.join(workingDir, 'pages');
  if (fs.existsSync(pagesDir)) {
    const pageFiles = fs.readdirSync(pagesDir).filter(f => /\.(html|tsx|vue)$/.test(f));
    if (pageFiles.length === 0) missing.push('pages/（无页面文件）');
  } else {
    missing.push('pages/');
  }
  // index.html 在 React/Vue 模式下降级为可选
  const reactVue = fs.existsSync(pagesDir) && fs.readdirSync(pagesDir).some(f => /\.(tsx|vue)$/.test(f));
  if (reactVue && missing.includes('index.html')) {
    missing.splice(missing.indexOf('index.html'), 1);
  }
  return missing;
}

/** 检查 working/ 是否有可存档文件 */
function hasArchivable(workingDir) {
  const entries = fs.readdirSync(workingDir, { withFileTypes: true });
  for (const e of entries) {
    const skip = EXCLUDES.some(ex => {
      const exName = ex.endsWith('/') ? ex.slice(0, -1) : ex;
      if (e.isDirectory() && ex.endsWith('/')) return e.name === exName;
      return !e.isDirectory() && e.name === exName;
    });
    if (skip) continue;
    if (e.isDirectory()) { if (e.name !== '.dead') return true; }
    else return true;
  }
  return false;
}

/** 生成 CHANGELOG 条目 */
function buildChangelogEntry(eNumber, changes) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lines = [`## E${eNumber}（${date}）`, ''];
  const split = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const news = split(changes.new), changed = split(changes.changed), fixed = split(changes.fixed);
  if (news.length) { lines.push('### 新增'); news.forEach(x => lines.push(`- ${x}`)); lines.push(''); }
  if (changed.length) { lines.push('### 修改'); changed.forEach(x => lines.push(`- ${x}`)); lines.push(''); }
  if (fixed.length) { lines.push('### 修复'); fixed.forEach(x => lines.push(`- ${x}`)); lines.push(''); }
  return lines.join('\n');
}

/** 读取上一版本 CHANGELOG 全文（累积追加） */
function readPrevChangelog(protoDir, eNumber) {
  const nums = scanE(protoDir).filter(n => n < eNumber);
  const prev = nums.length ? Math.max(...nums) : null;
  if (prev === null) return null;
  const p = path.join(protoDir, `E${prev}`, 'CHANGELOG.md');
  return fs.existsSync(p) ? readUtf8(p) : null;
}

// ===== 主流程 =====
function main() {
  const args = parseArgs(process.argv);
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
  const mainMode = args.main === 'true' || args.main === true;
  const answers = (args.answers || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!args['version-dir']) usage('缺少 --version-dir（版本目录路径）');
  const versionDir = path.resolve(args['version-dir']);
  if (!fs.existsSync(versionDir)) fail('版本目录不存在', versionDir);

  const protoDir = path.join(versionDir, 'prototype');
  const workingDir = path.join(protoDir, 'working');

  if (!fs.existsSync(workingDir)) fail('还没有原型文件', 'prototype/working/ 不存在，请先生成原型再保存');
  if (!hasArchivable(workingDir)) {
    fail('working/ 下没有可存档的交付文件', 'working/ 下仅有 spec.md / preview.html / feedback.md / .dead/ 等非交付文件');
  }

  // ---- 检测阶段 ----
  const existingNums = scanE(protoDir);
  const gap = findGap(existingNums);
  const missing = checkRequired(workingDir);

  let eNumber = null;
  if (args['e-number']) {
    const m = /^E(\d+)$/i.exec(args['e-number']);
    if (!m) usage('E 编号格式错误，应为 E1、E2、E3 等格式');
    eNumber = parseInt(m[1], 10);
  } else {
    eNumber = gap !== null ? gap : (existingNums.length ? Math.max(...existingNums) + 1 : 1);
  }
  const targetExists = fs.existsSync(path.join(protoDir, `E${eNumber}`));
  const needEConfirm = !args['e-number'] && gap === null && existingNums.length > 0 && !answers.includes('e_ok');
  const needGap = gap !== null && !answers.some(a => a.startsWith('fill_') || a.startsWith('continue_'));
  const needOverwrite = targetExists && !answers.includes('overwrite');
  const needMissing = missing.length > 0 && !answers.includes('continue_missing');
  const needMain = !mainMode && !answers.some(a => a === 'sync_main' || a === 'no_main');

  // ---- 聚合交互：有任何待决策项且无答案 → 一次返回全部 ----
  if (!dryRun && (needGap || needOverwrite || needMissing || needMain || needEConfirm)) {
    const data = {
      ask: 'archive_confirm',
      existing_editions: existingNums.map(n => `E${n}`),
      recommended_edition: `E${eNumber}`,
      target_exists: targetExists,
      missing_files: missing,
      prompt: '存档前确认（可一次收集）：'
    };
    if (needGap) {
      data.gap = {
        first_gap: `E${gap}`,
        options: [
          { label: `填补 E${gap}`, description: `在 E${gap} 目录存档，补上编号空缺` },
          { label: `从 E${existingNums.length ? Math.max(...existingNums) + 1 : 1} 继续`, description: `跳过断层，使用 E${existingNums.length ? Math.max(...existingNums) + 1 : 1} 作为当前编号` }
        ]
      };
    }
    if (needEConfirm) data.e_confirm = { prompt: `建议保存为 E${eNumber}，确认或输入其他编号？` };
    if (needOverwrite) data.overwrite = { prompt: `目标目录 E${eNumber} 已存在，是否覆盖？已有文件将被替换。` };
    if (needMissing) data.missing = { prompt: `以下文件缺失：${missing.join('、')}。确定继续保存？` };
    if (needMain) data.main_sync = {
      prompt: '要标记为主分支吗？标记后部署和分享会默认使用这个版本。',
      options: [
        { label: '标记为主分支', description: '同步到 prototype/main/，作为正式交付版本' },
        { label: '暂不标记', description: '仅保存在 E 目录，以后需要时 save-version --main' }
      ]
    };
    interact('archive_confirm', data);
  }

  // ---- 应用答案 ----
  if (answers.some(a => a.startsWith('fill_'))) eNumber = parseInt(answers.find(a => a.startsWith('fill_')).replace('fill_', ''), 10);
  if (answers.some(a => a.startsWith('continue_'))) eNumber = parseInt(answers.find(a => a.startsWith('continue_')).replace('continue_', ''), 10);
  const syncMain = mainMode || answers.includes('sync_main');

  const targetDir = path.join(protoDir, `E${eNumber}`);

  if (dryRun) {
    ok({
      dry_run: true,
      e_number: `E${eNumber}`,
      target_dir: toForwardSlashes(targetDir),
      missing_files: missing,
      excluded_files: EXCLUDES,
      main_sync: syncMain,
      actions: ['检查 working/', `复制到 E${eNumber}/（排除 ${EXCLUDES.length} 条规则）`, '生成 CHANGELOG', syncMain ? '同步 main/' : '', '更新 _index.md'].filter(Boolean)
    });
  }

  // ---- 执行存档 ----
  ensureDir(targetDir);
  const fileCount = copyDir(workingDir, targetDir, EXCLUDES);

  // CHANGELOG 累积追加
  const entry = buildChangelogEntry(eNumber, {
    new: args['changelog-new'] || '', changed: args['changelog-changed'] || '', fixed: args['changelog-fixed'] || ''
  });
  const prevChangelog = readPrevChangelog(protoDir, eNumber);
  const changelogContent = prevChangelog ? (prevChangelog.trimEnd() + '\n\n' + entry + '\n') : (entry + '\n');
  writeUtf8(path.join(targetDir, 'CHANGELOG.md'), changelogContent);

  // main/ 同步
  let mainSynced = false;
  if (syncMain) {
    const mainDir = path.join(protoDir, 'main');
    if (fs.existsSync(mainDir)) fs.rmSync(mainDir, { recursive: true, force: true });
    ensureDir(mainDir);
    copyDir(targetDir, mainDir, []);
    mainSynced = true;
  }

  // _index.md 更新（调用 save-doc.js IndexOnly 模式）
  let indexUpdated = false;
  let indexError = null;
  try {
    const verInfo = findVersionDir(versionDir);
    const baseDir = verInfo ? verInfo.root : path.dirname(versionDir);
    const version = verInfo ? verInfo.version : path.basename(versionDir);
    const changelog = readUtf8(path.join(targetDir, 'CHANGELOG.md')) || '';
    // 提取当前版本自己条目（## E{n}）下的第一条"新增"；累积历史不取
    const addMatch = changelog.match(new RegExp(`## E${eNumber}（[^）]*）[\\s\\S]*?### 新增[\\s\\S]*?^- (.+)$`, 'm'));
    const summaryBase = addMatch ? addMatch[1].trim() : '原型存档';
    const summaries = {};
    summaries[`${version}|prototype||E${eNumber}`] = { summary: `快照E${eNumber}：${summaryBase}`, author: args.author || '' };
    if (mainSynced) {
      summaries[`${version}|prototype||main`] = { summary: `正式版原型：${summaryBase}`, author: args.author || '' };
    }
    const saveDocJs = resolveSaveDocJs();
    if (!saveDocJs) throw new Error('pmcraft-req 插件未完整安装：save-doc.js 缺失，请重新运行 setup.cmd 后重试');
    const tmpFile = path.join(os.tmpdir(), 'pmcraft', `save_version_summaries_${Date.now()}.json`);
    ensureDir(path.dirname(tmpFile));
    writeUtf8(tmpFile, JSON.stringify(summaries));
    const out = execFileSync('node', [saveDocJs, '--base-dir', toForwardSlashes(baseDir), '--index-only', '--summaries-file', toForwardSlashes(tmpFile)], { encoding: 'utf8' });
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    const parsed = JSON.parse(out);
    indexUpdated = parsed.status === 'ok';
    if (!indexUpdated) indexError = parsed.data && parsed.data.message;
  } catch (e) {
    indexError = e.message;
  }

  // ---- PRD 状态检查（供 LLM 第八步引导） ----
  let prdStatus = 'none';
  const prdDir = path.join(versionDir, 'prd');
  const mainDir = path.join(protoDir, 'main');
  if (fs.existsSync(prdDir)) {
    const prdFiles = fs.readdirSync(prdDir).filter(f => f.endsWith('.md'));
    if (prdFiles.length > 0) {
      const mainTime = (syncMain || fs.existsSync(mainDir)) ? fs.statSync(mainDir).mtimeMs : 0;
      const prdTime = Math.max(...prdFiles.map(f => fs.statSync(path.join(prdDir, f)).mtimeMs));
      prdStatus = prdTime > mainTime ? 'ahead' : (mainSynced ? 'behind' : 'exists');
    }
  }

  ok({
    e_number: `E${eNumber}`,
    target_dir: toForwardSlashes(targetDir),
    file_count: fileCount,
    changelog_updated: true,
    main_synced: mainSynced,
    main_exists: fs.existsSync(mainDir),
    main_sync_requested: mainMode,
    index_updated: indexUpdated,
    index_error: indexError,
    missing_files: missing,
    excluded_files: EXCLUDES,
    prd_status: prdStatus
  });
}

main();
