#!/usr/bin/env node
/**
 * init-project.js — pmcraft 项目初始化脚本（Node.js 版，替代 init-project.sh）
 *
 * 模式：
 *   check                 检测项目初始化状态，输出 JSON
 *   init [--version=X] [--root=PATH]  执行初始化（幂等）
 *   --upgrade --action=diff|backup-overwrite|agents-only|backup-only  升级模式
 *
 * 模板源动态定位：本脚本所在目录上级 assets/（含 CLAUDE.md + agents/）优先，
 * 或上溯找含 pmcraft-brain 标记的 CLAUDE.md 所在目录。
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
const { toForwardSlashes, ensureDir, readUtf8, writeUtf8, copyFile } = require(path.join(sharedLib, 'encoding'));

const AGENT_NAMES = ['thinking-coach', 'concept-coach', 'grilling-coach', 'prompt-writer', 'req-analyst', 'proto-designer', 'doc-reviewer', 'design-reviewer', 'test-engineer'];
const VERSION_RE = /^[Vv]?\d+\.\d+\.\d+$/;
const BRAIN_MARK = 'pmcraft-brain';

// 脚本目录: scripts/ → 技能根（含 assets/）
const SKILL_ROOT = path.resolve(__dirname, '..');

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

// ---------- 工具 ----------
function topLevelCount(dir) {
  try { return fs.readdirSync(dir).length; } catch (e) { return 0; }
}

/** 定位模板源（assets/ 优先 → 上溯 pmcraft-brain → 环境变量） */
function findMarketplaceRoot() {
  const assets = path.join(SKILL_ROOT, 'assets');
  if (fs.existsSync(path.join(assets, 'CLAUDE.md')) && fs.existsSync(path.join(assets, 'agents'))) {
    return assets;
  }
  let dir = SKILL_ROOT;
  while (dir && dir !== path.parse(dir).root) {
    const md = path.join(dir, 'CLAUDE.md');
    if (fs.existsSync(md) && (readUtf8(md) || '').includes(BRAIN_MARK)) return dir;
    dir = path.dirname(dir);
  }
  if (process.env.PMCRAFT_ROOT) {
    const md = path.join(process.env.PMCRAFT_ROOT, 'CLAUDE.md');
    if (fs.existsSync(md) && (readUtf8(md) || '').includes(BRAIN_MARK)) return process.env.PMCRAFT_ROOT;
  }
  return null;
}

/**
 * 从起始目录向上找版本目录
 * 安全规则：
 *   1. cwd 近空（≤3 顶层条目）且无版本目录 → NONE（根=cwd）
 *   2. cwd 自身是版本目录 → 从父目录开始上溯
 *   3. 命中版本目录后校验命中层：近空 或 含 pmcraft-brain 标记 → 可信；否则继续上溯
 *   4. 多版本目录 → MULTI
 * @returns {string} NONE | MULTI|p1|p2|... | OK|root|version
 */
function detectVersion(dir) {
  let cur = path.resolve(dir);
  const isSelfVer = VERSION_RE.test(path.basename(cur));
  if (isSelfVer) {
    cur = path.dirname(cur);
  } else {
    const cnt = topLevelCount(cur);
    if (cnt <= 3) {
      let hasVer = false;
      try { hasVer = fs.readdirSync(cur, { withFileTypes: true }).some(e => e.isDirectory() && VERSION_RE.test(e.name)); } catch (e) { /* 读取失败视为无版本目录 */ }
      if (!hasVer) return 'NONE';
    }
  }
  while (cur && cur !== path.parse(cur).root) {
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
        .filter(e => e.isDirectory() && VERSION_RE.test(e.name))
        .map(e => path.join(cur, e.name));
    } catch (e) { /* 读取失败继续上溯 */ }
    if (entries.length > 1) {
      return 'MULTI|' + entries.join('|');
    } else if (entries.length === 1) {
      // 校验命中层可信度：近空 或 含 pmcraft-brain 标记
      const cnt = topLevelCount(cur);
      const brainMd = fs.existsSync(path.join(cur, 'CLAUDE.md')) && (readUtf8(path.join(cur, 'CLAUDE.md')) || '').includes(BRAIN_MARK);
      if (cnt > 3 && !brainMd) {
        cur = path.dirname(cur);
        continue;
      }
      const ver = path.basename(entries[0]).replace(/^[Vv]/, '');
      return `OK|${cur}|${ver}`;
    }
    cur = path.dirname(cur);
  }
  return 'NONE';
}

/**
 * 定位"插件根"（替换 CLAUDE.md 模板 {插件根} 占位符）：
 * 向上找第一个含 _shared/scripts/stop-services.js 的祖先目录——
 *   cache 环境 = 插件目录（setup.cmd Sync-SharedLibrary 已将 _shared/scripts 分发到每个插件缓存目录）
 *   source 环境 = marketplace 根（_shared 唯一维护处，如 pmcraft/_shared）
 * 找不到时兜底本插件目录（scripts/ 上级 3 层，与旧行为一致）
 */
function resolvePluginRoot() {
  let dir = __dirname;
  for (;;) {
    if (fs.existsSync(path.join(dir, '_shared', 'scripts', 'stop-services.js'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '../../..');
}

/** 标题替换：`# pmcraft — 产品工坊` → `# {项目名} — pmcraft 产品工坊`；{插件根} 占位符 → 插件根绝对路径（resolvePluginRoot） */
function writeClaudeMd(src, dst, name) {
  const content = readUtf8(src);
  const pluginRoot = toForwardSlashes(resolvePluginRoot());
  const replaced = content
    .replace(/^# pmcraft — 产品工坊$/m, `# ${name} — pmcraft 产品工坊`)
    .replace(/\{插件根\}/g, pluginRoot);
  writeUtf8(dst, replaced);
}

// ---------- check ----------
function doCheck(cwd, args) {
  // 项目根显式化：--root 优先，不依赖 cwd（SKILL.md 强制 LLM 传 --root）
  const effectiveCwd = args.root ? path.resolve(args.root) : cwd;
  const r = detectVersion(effectiveCwd);
  if (r === 'NONE') {
    const cnt = topLevelCount(effectiveCwd);
    if (cnt > 3) { ok({ status: 'silent', message: '非 pmcraft 项目，不打扰' }); return; }
    ok({ status: 'need_init', root: toForwardSlashes(effectiveCwd), missing: 'pmcraft/ 版本目录 CLAUDE.md' });
    return;
  }
  if (r.startsWith('MULTI')) {
    ok({ status: 'multi', candidates: r.split('|').slice(1) });
    return;
  }
  // OK|root|version
  const parts = r.split('|');
  const root = parts[1], ver = parts[2];
  const missing = [];
  if (!fs.existsSync(path.join(root, 'pmcraft'))) missing.push('pmcraft/');
  if (!fs.existsSync(path.join(root, ver))) missing.push(`${ver}/`);
  if (!fs.existsSync(path.join(root, 'CLAUDE.md'))) missing.push('CLAUDE.md');
  if (missing.length) {
    ok({ status: 'need_init', root: toForwardSlashes(root), missing: missing.join(' ') });
  } else {
    ok({ status: 'ready', project: path.basename(root), version: ver, root: toForwardSlashes(root) });
  }
}

// ---------- init ----------
function doInit(cwd, args) {
  let root = args.root || '';
  let version = args.version || '';
  if (root && version) {
    // 显式指定，跳过检测
  } else {
    const r = detectVersion(cwd);
    if (r === 'NONE') {
      if (!root) root = cwd;
      if (!version) version = '1.0.0';
    } else if (r.startsWith('MULTI')) {
      if (version && !root) fail('多版本目录需同时指定 --root=项目根', r.split('|').slice(1).join(', '));
      if (!version || !root) { ok({ status: 'multi', candidates: r.split('|').slice(1) }); return; }
    } else {
      const parts = r.split('|');
      if (!root) root = parts[1];
      if (!version) version = parts[2];
    }
  }
  version = version.replace(/^[Vv]/, ''); // 统一无 V 前缀
  // 防御：multi 状态下 candidates 是版本目录路径，若 --root 误传了候选版本目录本身，
  // 规整为上级项目根，避免生成嵌套版本目录（如 C:/proj/1.0.0/1.0.0）
  if (root && VERSION_RE.test(path.basename(root))) {
    root = path.dirname(root);
  }

  const mroot = findMarketplaceRoot();
  if (!mroot) fail('找不到 pmcraft 根模板', '可设 PMCRAFT_ROOT 环境变量指定');

  const name = path.basename(root);
  try {
    // 1. 版本目录
    ensureDir(path.join(root, version));
    // 2. pmcraft 骨架
    ensureDir(path.join(root, 'pmcraft', 'baseline'));
    ensureDir(path.join(root, 'pmcraft', 'specs'));
    // 2.1 pmcraft/temp/ — 过程性审查产物/临时文件区（不进 E 编号管理，不参与 _index.md）
    ensureDir(path.join(root, 'pmcraft', 'temp'));
    // 3. lessons.md（缺失才写）
    const lessonsPath = path.join(root, 'pmcraft', 'lessons.md');
    if (!fs.existsSync(lessonsPath)) {
      writeUtf8(lessonsPath, `# 经验规则库\n\n> 在此记录项目中反复出现的修正模式，build-prototype 生成时会自动读取并应用。\n\n## 规则列表\n\n（暂无）\n`);
    }
    // 4. agents（缺失才复制）
    ensureDir(path.join(root, '.claude', 'agents'));
    let agentsDir = path.join(mroot, 'agents');
    if (!fs.existsSync(agentsDir)) agentsDir = path.join(mroot, '.claude', 'agents');
    for (const agent of AGENT_NAMES) {
      const tgt = path.join(root, '.claude', 'agents', `${agent}.md`);
      const src = path.join(agentsDir, `${agent}.md`);
      if (!fs.existsSync(tgt) && fs.existsSync(src)) copyFile(src, tgt);
    }
    // 5. CLAUDE.md（不存在才写，标题替换）
    const claudeMd = path.join(root, 'CLAUDE.md');
    if (!fs.existsSync(claudeMd)) {
      writeClaudeMd(path.join(mroot, 'CLAUDE.md'), claudeMd, name);
    }
  } catch (e) {
    fail('初始化失败', e.message);
  }
  ok({ status: 'init_ok', project: name, version, root: toForwardSlashes(root) });
}

// ---------- upgrade ----------
function doUpgrade(cwd, args) {
  const action = args.action || '';
  if (!action) fail('需要 --action', 'diff | backup-overwrite | agents-only | backup-only');

  const mroot = findMarketplaceRoot();
  if (!mroot) fail('找不到 pmcraft 根模板', '可设 PMCRAFT_ROOT 环境变量指定');

  const r = detectVersion(cwd);
  let root = '';
  if (r.startsWith('OK')) root = r.split('|')[1];
  else if (r === 'NONE') root = cwd;
  else { ok({ status: 'multi', candidates: r.split('|').slice(1) }); return; }

  let agentsDir = path.join(mroot, 'agents');
  if (!fs.existsSync(agentsDir)) agentsDir = path.join(mroot, '.claude', 'agents');
  const files = ['CLAUDE.md', ...AGENT_NAMES];
  const tgtOf = f => f === 'CLAUDE.md' ? path.join(root, 'CLAUDE.md') : path.join(root, '.claude', 'agents', `${f}.md`);
  const srcOf = f => f === 'CLAUDE.md' ? path.join(mroot, 'CLAUDE.md') : path.join(agentsDir, `${f}.md`);

  if (action === 'diff') {
    const diffs = [];
    // 归一化还需还原 {插件根} 占位符：writeClaudeMd 已将其替换为插件根绝对路径，
    // 不还原则脚本初始化过的项目 CLAUDE.md 恒显示 DIFF，all_same 状态不可达
    const pluginRoot = toForwardSlashes(resolvePluginRoot());
    for (const f of files) {
      const tgt = tgtOf(f), src = srcOf(f);
      if (!fs.existsSync(tgt)) { diffs.push({ file: f, state: 'MISSING' }); continue; }
      const tgtContent = readUtf8(tgt) || '';
      const srcContent = readUtf8(src) || '';
      // 归一化标题行 + 插件根绝对路径后比较（忽略标题与占位符替换差异；split/join 为字面替换，避免正则转义问题）
      const norm = s => s.replace(/^# .* — pmcraft 产品工坊$/m, '# pmcraft — 产品工坊').split(pluginRoot).join('{插件根}');
      if (norm(tgtContent) !== norm(srcContent)) diffs.push({ file: f, state: 'DIFF' });
    }
    ok({ status: diffs.length ? 'diff' : 'all_same', diffs });
    return;
  }

  if (['backup-only', 'backup-overwrite', 'agents-only'].includes(action)) {
    // 备份
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    let backupDir = path.join(root, 'pmcraft', 'backup', ts);
    let n = 2;
    while (fs.existsSync(backupDir)) { backupDir = path.join(root, 'pmcraft', 'backup', `${ts}_${n}`); n++; }
    try {
      ensureDir(path.join(backupDir, 'agents'));
      for (const f of files) {
        const tgt = tgtOf(f);
        if (fs.existsSync(tgt)) {
          const dest = f === 'CLAUDE.md' ? path.join(backupDir, 'CLAUDE.md') : path.join(backupDir, 'agents', `${f}.md`);
          copyFile(tgt, dest);
        }
      }
      // 覆盖
      if (action === 'backup-overwrite' || action === 'agents-only') {
        for (const f of files) {
          if (f === 'CLAUDE.md') {
            if (action === 'backup-overwrite') writeClaudeMd(srcOf(f), tgtOf(f), path.basename(root));
          } else {
            copyFile(srcOf(f), tgtOf(f));
          }
        }
      }
    } catch (e) {
      fail('升级失败', e.message);
    }
    ok({ status: 'upgrade_ok', backup_dir: toForwardSlashes(backupDir) });
    return;
  }

  fail('未知 --action', action);
}

// ---------- 主入口 ----------
const rawArgv = process.argv.slice(2);
// --upgrade 是唯一以 `--` 开头的 mode，必须作首参；其余 mode 从非 `--` 操作数取
const mode = rawArgv[0] === '--upgrade' ? '--upgrade' : rawArgv.find(a => !a.startsWith('--'));
const args = parseArgs(process.argv);
const cwd = process.cwd();

switch (mode) {
  case 'check': doCheck(cwd, args); break;
  case 'init': doInit(cwd, args); break;
  case '--upgrade': doUpgrade(cwd, args); break;
  default: usage('用法: init-project.js check [--root=PATH] | init [--version=X] [--root=PATH] | --upgrade --action=...');
}
