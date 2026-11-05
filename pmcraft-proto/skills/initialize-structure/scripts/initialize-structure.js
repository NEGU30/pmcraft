#!/usr/bin/env node
/**
 * initialize-structure.js — 原型目录初始化（替代原 SKILL.md 中 LLM 手动 mkdir/复制的流程）
 *
 * 功能：版本目录路径校验 → 存量结构识别（标准/非标准位置）→ 全局基准继承（baseline 四件套）
 *       → 设计规范前递（specs 静默复制）→ 状态识别创建目录（幂等）
 *
 * 用法：
 *   node initialize-structure.js --version-dir=<版本目录> [--answers=<决策>] [--dry-run]
 *
 * 交互点（status:"interaction"，LLM 收集决策后带 --answers 重调）：
 *   - version_dir_missing  版本目录不存在，询问是否创建
 *   - nonstandard_migrate  检测到非标准位置 prototype/，询问是否迁移
 *   - baseline_inherit     检测到全局基准四件套，询问是否继承
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
const { ok, fail, usage, interact } = require(path.join(sharedLib, 'json-output'));
const { toForwardSlashes, ensureDir, copyDir, copyFile } = require(path.join(sharedLib, 'encoding'));

const VERSION_RE = /^[Vv]?\d+\.\d+\.\d+$/;
// 非标准位置候选（旧版 save-doc 或手移遗留）
const NONSTANDARD_CANDIDATES = ['assets/prototype', 'static/prototype', 'public/prototype', 'resources/prototype'];

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

/** 检测版本目录下的非标准 prototype/ 位置，返回首个存在且非空的候选（无则 null） */
function findNonstandardProto(versionDir) {
  for (const rel of NONSTANDARD_CANDIDATES) {
    const p = path.join(versionDir, rel);
    if (fs.existsSync(p)) {
      // 确认非空
      const entries = fs.readdirSync(p, { withFileTypes: true });
      if (entries.length > 0) return { path: p, rel };
    }
  }
  return null;
}

/** 检查 pmcraft/baseline/ 四件套是否完整（每项都非空） */
function checkBaseline(pmcraftDir) {
  const baseline = path.join(pmcraftDir, 'baseline');
  const parts = {
    'source': path.join(baseline, 'source'),
    'framework': path.join(baseline, 'framework'),
    'DESIGN.md': path.join(baseline, 'DESIGN.md'),
    'design-system.css': path.join(baseline, 'design-system.css')
  };
  const missing = [];
  const found = {};
  for (const [name, p] of Object.entries(parts)) {
    if (!fs.existsSync(p)) { missing.push(name); continue; }
    // 目录至少一个文件，文件内容长度 > 0
    let nonEmpty = false;
    if (fs.statSync(p).isDirectory()) {
      nonEmpty = fs.readdirSync(p).some(e => fs.statSync(path.join(p, e)).size > 0);
    } else {
      nonEmpty = fs.statSync(p).size > 0;
    }
    if (nonEmpty) found[name] = p; else missing.push(name);
  }
  return { complete: missing.length === 0, missing, found };
}

/** 检查 pmcraft/specs/ 是否非空（至少一个 .md 文件） */
function checkSpecs(pmcraftDir) {
  const specs = path.join(pmcraftDir, 'specs');
  if (!fs.existsSync(specs)) return null;
  const files = fs.readdirSync(specs, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.md'));
  return files.length > 0 ? specs : null;
}

/** 从版本目录向上找 pmcraft/ 目录（CLAUDE.md 相邻或版本目录父级） */
function findPmcraftDir(versionDir) {
  let dir = path.resolve(versionDir);
  // 先查版本目录本身及父目录
  for (let i = 0; i < 3 && dir !== path.parse(dir).root; i++) {
    const p = path.join(dir, 'pmcraft');
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    dir = path.dirname(dir);
  }
  // 再向上遍历找含 pmcraft/ 的项目根
  dir = path.resolve(versionDir);
  while (dir !== path.parse(dir).root) {
    const p = path.join(dir, 'pmcraft');
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    dir = path.dirname(dir);
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
  const answers = (args.answers || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!args['version-dir']) usage('缺少 --version-dir（版本目录路径）');
  const versionDir = path.resolve(args['version-dir']);

  // ---- 路径合法性检查 ----
  const isVersionName = VERSION_RE.test(path.basename(versionDir));
  const dirExists = fs.existsSync(versionDir);

  if (!dirExists && !answers.includes('create_dir')) {
    interact('version_dir_missing', {
      target: toForwardSlashes(versionDir),
      prompt: `路径 \`${toForwardSlashes(versionDir)}\` 不存在，需要先创建该目录吗？`,
      options: [
        { label: '创建目录', description: `mkdir -p 创建 ${toForwardSlashes(versionDir)} 后继续` },
        { label: '取消', description: '退出初始化' }
      ]
    });
  }
  if (!isVersionName && !answers.includes('confirm_nonversion')) {
    interact('confirm_nonversion', {
      target: toForwardSlashes(versionDir),
      prompt: `路径末端看起来不太像版本目录（预期如 1.0.0、V1.0.0 或 v1.0.0）。确定在此路径下初始化 prototype/ 吗？`,
      options: [
        { label: '继续', description: '在指定路径初始化' },
        { label: '取消', description: '退出初始化' }
      ]
    });
  }
  if (!dirExists) ensureDir(versionDir);

  const protoDir = path.join(versionDir, 'prototype');
  const pmcraftDir = findPmcraftDir(versionDir);

  // ---- 2.0 预先扫描：非标准位置 ----
  let nonstandard = null;
  if (!fs.existsSync(protoDir)) {
    nonstandard = findNonstandardProto(versionDir);
    if (nonstandard && !answers.includes('migrate') && !answers.includes('no_migrate')) {
      interact('nonstandard_migrate', {
        nonstandard_path: toForwardSlashes(nonstandard.path),
        prompt: `检测到现有 prototype/ 位于非标准路径 \`${toForwardSlashes(nonstandard.path)}\`（预期应在版本目录根下）。建议迁移到 \`prototype/\` 后继续。需要我帮你迁移吗？`,
        options: [
          { label: '迁移', description: '整体移动到版本目录根下的 prototype/' },
          { label: '不迁移', description: '在标准位置另建（旧路径文件不会被自动引用）' }
        ]
      });
    }
    if (nonstandard && answers.includes('migrate')) {
      ensureDir(protoDir);
      // 整体移动内容（含隐藏文件）
      const entries = fs.readdirSync(nonstandard.path, { withFileTypes: true });
      for (const e of entries) {
        const src = path.join(nonstandard.path, e.name);
        const dest = path.join(protoDir, e.name);
        if (e.isDirectory()) copyDir(src, dest, []);
        else copyFile(src, dest);
      }
      // 清理原父目录（若空则删除）
      const parent = path.dirname(nonstandard.path);
      const parentRemaining = fs.readdirSync(parent).filter(n => n !== 'prototype' && !['.','..'].includes(n));
      if (parentRemaining.length === 0) {
        try { fs.rmSync(nonstandard.path, { recursive: true, force: true }); } catch (e) {}
      }
    }
  }

  // ---- 2.0a 全局基准前递（仅当无 prototype/ 且未迁移） ----
  let baselineInherited = false;
  let baselineRefused = false;
  if (!fs.existsSync(protoDir) && pmcraftDir) {
    const baseline = checkBaseline(pmcraftDir);
    if (baseline.complete && !answers.includes('inherit_baseline') && !answers.includes('no_baseline')) {
      interact('baseline_inherit', {
        baseline_path: toForwardSlashes(path.join(pmcraftDir, 'baseline')),
        prompt: '检测到全局基准设计系统（pmcraft/baseline/，含 source/ 备份、framework/ 框架壳、DESIGN.md、design-system.css）。从全局基准复制到当前版本即可直接使用，无需重新抽取设计。',
        options: [
          { label: '继承使用', description: '从全局基准复制全部四件套到当前版本' },
          { label: '不用，重新开始', description: '跳过继承，创建空目录后续单独设定风格' }
        ]
      });
    }
    if (answers.includes('inherit_baseline') && baseline.complete) {
      ensureDir(path.join(protoDir, 'working'));
      ensureDir(path.join(protoDir, 'reference'));
      copyDir(baseline.found['source'], path.join(protoDir, 'reference', 'source'), []);
      copyDir(baseline.found['framework'], path.join(protoDir, 'working', 'framework'), []);
      copyFile(baseline.found['DESIGN.md'], path.join(protoDir, 'working', 'DESIGN.md'));
      copyFile(baseline.found['design-system.css'], path.join(protoDir, 'working', 'design-system.css'));
      baselineInherited = true;
    }
    if (answers.includes('no_baseline')) baselineRefused = true;
  }

  // ---- 2.0b 权威规范前递（静默，不询问） ----
  let specsInherited = false;
  if (!fs.existsSync(protoDir) && pmcraftDir) {
    const specs = checkSpecs(pmcraftDir);
    if (specs) {
      const dest = path.join(protoDir, 'specs');
      copyDir(specs, dest, []);
      specsInherited = true;
    }
  }

  // ---- 2.1 状态识别 ----
  const created = [];
  if (baselineInherited) {
    // 已由基准继承创建 working/ + reference/
    ensureDir(path.join(protoDir, 'working', 'components'));
  } else {
    // 状态 a/b/c/d
    const workingDir = path.join(protoDir, 'working');
    const componentsDir = path.join(protoDir, 'working', 'components');
    const referenceDir = path.join(protoDir, 'reference');
    if (!fs.existsSync(workingDir)) { ensureDir(workingDir); created.push('working/'); }
    if (!fs.existsSync(componentsDir)) { ensureDir(componentsDir); created.push('working/components/'); }
    if (!fs.existsSync(referenceDir)) { ensureDir(referenceDir); created.push('reference/'); }
  }

  // ---- 2.1a 设计资产继承（目录就绪后，缺失资产时检查基准） ----
  if (!baselineInherited && !baselineRefused && pmcraftDir) {
    const workingDir = path.join(protoDir, 'working');
    const missingAssets = [];
    if (!fs.existsSync(path.join(workingDir, 'DESIGN.md'))) missingAssets.push('DESIGN.md');
    if (!fs.existsSync(path.join(workingDir, 'design-system.css'))) missingAssets.push('design-system.css');
    if (!fs.existsSync(path.join(workingDir, 'framework'))) missingAssets.push('framework/');
    if (!fs.existsSync(path.join(protoDir, 'reference', 'source'))) missingAssets.push('reference/source/');
    if (missingAssets.length > 0) {
      const baseline = checkBaseline(pmcraftDir);
      if (baseline.complete && !answers.includes('inherit_baseline') && !answers.includes('no_baseline')) {
        interact('baseline_inherit', {
          missing_assets: missingAssets,
          baseline_path: toForwardSlashes(path.join(pmcraftDir, 'baseline')),
          prompt: `当前版本还缺少部分设计资产（${missingAssets.join('、')}）。检测到全局基准 pmcraft/baseline/ 已有完整设计系统，从全局基准复制过来直接沿用？`,
          options: [
            { label: '继承使用', description: '从全局基准复制四件套（目标已有则跳过）' },
            { label: '不用', description: '跳过继承，后续由 set-style 或 extract-design 生成' }
          ]
        });
      }
      if (answers.includes('inherit_baseline') && baseline.complete) {
        const b = baseline.found;
        if (!fs.existsSync(path.join(protoDir, 'reference', 'source')) && b['source']) copyDir(b['source'], path.join(protoDir, 'reference', 'source'), []);
        if (!fs.existsSync(path.join(workingDir, 'framework')) && b['framework']) copyDir(b['framework'], path.join(workingDir, 'framework'), []);
        if (!fs.existsSync(path.join(workingDir, 'DESIGN.md')) && b['DESIGN.md']) copyFile(b['DESIGN.md'], path.join(workingDir, 'DESIGN.md'));
        if (!fs.existsSync(path.join(workingDir, 'design-system.css')) && b['design-system.css']) copyFile(b['design-system.css'], path.join(workingDir, 'design-system.css'));
        baselineInherited = true;
      }
    }
  }

  // ---- 2.1b 设计规范继承（静默） ----
  if (!specsInherited && pmcraftDir) {
    const specsDest = path.join(protoDir, 'specs');
    if (!fs.existsSync(specsDest)) {
      const specs = checkSpecs(pmcraftDir);
      if (specs) {
        copyDir(specs, specsDest, []);
        specsInherited = true;
      }
    }
  }

  // ---- 输出 ----
  const workingDir = path.join(protoDir, 'working');
  const componentsDir = path.join(protoDir, 'working', 'components');
  const referenceDir = path.join(protoDir, 'reference');
  const statusOf = p => fs.existsSync(p) ? (created.includes(toForwardSlashes(path.relative(protoDir, p)) + '/') ? '新创建' : '已存在') : '缺失';
  ok({
    version_dir: toForwardSlashes(versionDir),
    prototype_dir: toForwardSlashes(protoDir),
    dirs: {
      'working/': statusOf(workingDir),
      'working/components/': statusOf(componentsDir),
      'reference/': statusOf(referenceDir)
    },
    created_count: created.length,
    baseline_inherited: baselineInherited,
    specs_inherited: specsInherited,
    nonstandard_migrated: !!(nonstandard && answers.includes('migrate'))
  });
}

main();
