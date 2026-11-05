#!/usr/bin/env node
/**
 * save-doc.js — 文档保存脚本（Node.js 版，替代 save_doc.ps1）
 *
 * 功能：创建标准目录树 → 按文档类型归类 → 扫描 E 编号 → 复制临时文件 →
 *       清理临时文件 → 重建 _index.md
 *
 * 用法：
 *   保存文档:  node save-doc.js --base-dir=<功能顶级目录> --version=<1.0.0> --doc-type=<PRD> --temp-file=<临时文件> [--summary=<摘要>] [--author=<负责人>] [--keep-temp] [--dry-run]
 *   仅更新索引: node save-doc.js --base-dir=<功能顶级目录> --index-only --summaries-file=<JSON文件>
 *
 * Node 原生 UTF-8，无 Bash→PowerShell 编码断裂问题；路径支持正斜杠/反斜杠，内部统一处理。
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
const { toForwardSlashes, ensureDir, removeFile, copyDir } = require(path.join(sharedLib, 'encoding'));
const { rebuildIndex } = require('./lib/indexer');
const readmePortal = require('./lib/readme-portal.cjs');   // README.html 门户生成器（refreshReadme 内调用）

// ===== 文档类型 → 子目录映射（与 ps1 一致） =====
function mapDocTypeToSubDir(docType) {
  const t = docType.toLowerCase();
  if (t.includes('简版prd')) return 'prd'; // 简版PRD（compact-prd 产出）：与完整PRD同存 prd/，文件名注明简版
  if (t.includes('规划')) return 'planning';
  if (t.includes('决策记录')) return 'decision';
  if (t.includes('简报')) return 'brief';
  if (t === 'prd') return 'prd';
  if (t.includes('分析')) return 'analysis';
  if (t.includes('研究')) return 'analysis';
  if (t.includes('报告') || t.includes('摘要')) return 'report';
  if (t.includes('流程')) return 'flowchart';
  if (t.includes('时序')) return 'sequence';
  if (t.includes('测试')) return 'testcase';
  if (t.includes('调研')) return 'survey';
  if (t.includes('开发交接')) return 'development';
  return null;
}

// 标准目录树（与 ps1 一致）
const SUB_DIRS = ['brief', 'prd', 'report', 'testcase', 'meeting', 'planning', 'decision', 'flowchart', 'sequence', 'survey', 'analysis', 'development', 'prototype'];

/** 解析 --key=value 或 --key value 参数 */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[++i];
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

/** 从 .feature-name 读取功能名，否则用文件夹名 */
function resolveFuncName(baseDir) {
  const featureFile = path.join(baseDir, '.feature-name');
  if (fs.existsSync(featureFile)) {
    const name = fs.readFileSync(featureFile, 'utf8').trim();
    if (name) return name;
  }
  return path.basename(baseDir);
}

/** 目录迁移（幂等）：flowcharts/→flowchart/，assets/prototype/→prototype/，assets/sequence/→sequence/，最后统一清理空 assets/ */
function migrateDirs(versionDir) {
  const migrateFiles = (oldDir, newDir) => {
    if (!fs.existsSync(oldDir)) return;
    ensureDir(newDir);
    const files = fs.readdirSync(oldDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile()) continue;
      const dest = path.join(newDir, f.name);
      if (!fs.existsSync(dest)) {
        try { fs.renameSync(path.join(oldDir, f.name), dest); } catch (e) {}
      }
    }
    // 全部迁移后删除旧目录
    const remaining = fs.readdirSync(oldDir, { withFileTypes: true }).filter(f => f.isFile());
    if (remaining.length === 0) {
      try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch (e) {}
    }
  };
  migrateFiles(path.join(versionDir, 'flowcharts'), path.join(versionDir, 'flowchart'));
  // 递归收集目录内全部文件（绝对路径）
  const collectFiles = root => {
    const out = [];
    const walk = p => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, e.name);
        if (e.isDirectory()) walk(full);
        else out.push(full);
      }
    };
    walk(root);
    return out;
  };
  // 将 srcRoot 下各子目录内文件平铺搬移到 destDir（同名跳过）；仅迁移，不删 assets（清理在最后统一做）
  const flattenMove = (srcRoot, destDir) => {
    if (!fs.existsSync(srcRoot)) return;
    ensureDir(destDir);
    const subDirs = fs.readdirSync(srcRoot, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const sd of subDirs) {
      for (const file of collectFiles(path.join(srcRoot, sd.name))) {
        const dest = path.join(destDir, path.basename(file));
        if (!fs.existsSync(dest)) {
          try { fs.renameSync(file, dest); } catch (e) {}
        }
      }
    }
  };
  // assets/prototype/<功能名>/ → prototype/（递归搬移文件到根级）
  flattenMove(path.join(versionDir, 'assets', 'prototype'), path.join(versionDir, 'prototype'));
  // assets/sequence/<功能名>/ → sequence/
  flattenMove(path.join(versionDir, 'assets', 'sequence'), path.join(versionDir, 'sequence'));
  // 统一清理：两个迁移都完成后 assets/ 下已无任何文件（仅剩空目录）才整体删除——
  // 不能在 prototype 块内提前删 assets，否则会连带删掉尚未迁移的 assets/sequence 内容
  const assetsDir = path.join(versionDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    // readdirSync recursive 返回相对 assetsDir 的路径，statSync 须基于 assetsDir 拼接（相对 cwd 会 ENOENT 崩溃）
    const remaining = fs.readdirSync(assetsDir, { recursive: true }).filter(p => { try { return fs.statSync(path.join(assetsDir, p)).isFile(); } catch (e) { return false; } });
    if (remaining.length === 0) {
      try { fs.rmSync(assetsDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

// ===== 预保存质量检查（4 项，内置为 save-doc 保存前自动检查） =====
// 返回 [{type, line, message}]，空数组 = 通过
function preSaveCheck(tempFilePath) {
  if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).isDirectory()) return []; // 目录形态（开发交接）跳过
  const content = fs.readFileSync(tempFilePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const warnings = [];

  // 1. Mermaid 闭合：每个 ```mermaid 需配对 ``` 闭合
  const fenceRe = /^```mermaid\s*$/;
  const closeRe = /^```\s*$/;
  let inMermaid = false;
  let mermaidStartLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (fenceRe.test(line)) {
      if (inMermaid) { warnings.push({ type: 'mermaid_unclosed', line: i + 1, message: '```mermaid 嵌套或未闭合（前一个未配对）' }); }
      inMermaid = true;
      mermaidStartLine = i + 1;
    } else if (closeRe.test(line) && inMermaid) {
      inMermaid = false;
    }
  }
  if (inMermaid) warnings.push({ type: 'mermaid_unclosed', line: mermaidStartLine, message: '```mermaid 未找到配对的 ```' });

  // 2. span 标签开闭平衡：全部 <span> 开标签与 </span> 闭标签数量一致（蓝色配对为其子集，兼容含优先级颜色的多色文档）
  const openSpan = (content.match(/<span\b[^>]*>/gi) || []).length;
  const closeSpan = (content.match(/<\/span>/gi) || []).length;
  if (openSpan !== closeSpan) {
    warnings.push({ type: 'span_tag_unbalanced', line: 0, message: `span 标签开闭不平衡：<span> 开标签有 ${openSpan} 个，</span> 闭标签有 ${closeSpan} 个，数量不一致` });
  }

  // 3. 占位符未替换：{待确认}、{N}、{N1}-{N3c}、{H}、{M}、{L}、{D}、{D1}-{D3}
  const placeholderRe = /\{(待确认|N\d*|N[123][a-z]?|H|M|L|D|D[123])\}/g;
  for (let i = 0; i < lines.length; i++) {
    const m = placeholderRe.exec(lines[i]);
    if (m) {
      warnings.push({ type: 'placeholder_unfilled', line: i + 1, message: `占位符 {${m[1]}} 未替换` });
      placeholderRe.lastIndex = 0;
    }
  }

  // 4. 版本号格式：文档内出现非 1.0.0/V1.0.0 格式的版本号（近似检查）
  const badVerRe = /\bv\d+\.\d+\.\d+\b/g; // 小写 v 前缀（不合法）
  for (let i = 0; i < lines.length; i++) {
    const m = badVerRe.exec(lines[i]);
    if (m) {
      warnings.push({ type: 'version_format', line: i + 1, message: `版本号格式错误：${m[0]}（应为 1.0.0 或 V1.0.0）` });
      badVerRe.lastIndex = 0;
    }
  }

  return warnings;
}

// ===== 必读指南 README.md + README.html 门户刷新（每次保存/索引重建后自动执行） =====
// {版本目录}/_README/ 内的《评审与开发必读指南》：README.md（数据源，三表结构）+
// README.html 门户（可点读、原型直达启动器）。路径实时扫描填充，未命中标注「未产出」。
// 与 _index.md 同生命周期（save-doc 每次保存后刷新），LLM 不参与生成；
// 原型存档（save-version）经 --index-only 调用本函数刷新原型行。
// 存量项目 README.md 在版本目录顶层 → readmePortal 自动"吸收"收编进 _README/。
const ESC_RE = /[.*+?^${}()|[\]\\]/g;
const escRe = s => s.replace(ESC_RE, '\\$&');
const PAD = n => String(n).padStart(2, '0');

/** 某目录下按正则匹配 E 编号最大的文件名（返回文件名或 null） */
function latestInDir(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  let best = null, bestE = 0;
  for (const name of fs.readdirSync(dir)) {
    const m = pattern.exec(name);
    if (m) { const e = parseInt(m[1], 10); if (e > bestE) { bestE = e; best = name; } }
  }
  return best;
}

/** report/ 等多类型目录：按关键字过滤后取 E 编号最大的文件名 */
function latestByKeyword(dir, keyword) {
  if (!fs.existsSync(dir)) return null;
  let best = null, bestE = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.includes(keyword)) continue;
    const m = /_E(\d+)\.md$/.exec(name);
    if (m) { const e = parseInt(m[1], 10); if (e > bestE) { bestE = e; best = name; } }
  }
  return best;
}

/** prd/ 下完整 PRD（排除简版PRD——两系列 E 编号独立递增，通配会误命中） */
function latestFullPrd(prdDir) {
  if (!fs.existsSync(prdDir)) return null;
  let best = null, bestE = 0;
  for (const name of fs.readdirSync(prdDir)) {
    if (name.includes('简版')) continue;
    const m = /_PRD_E(\d+)\.md$/.exec(name);
    if (m) { const e = parseInt(m[1], 10); if (e > bestE) { bestE = e; best = name; } }
  }
  return best;
}

/** 原型引用路径：prototype/main/ → prototype/E{最大}/ → assets/prototype/{功能名}/（旧项目兼容），均无返回 null */
function resolvePrototypePath(versionDir, funcName) {
  if (fs.existsSync(path.join(versionDir, 'prototype', 'main'))) return 'prototype/main/';
  const protoDir = path.join(versionDir, 'prototype');
  if (fs.existsSync(protoDir)) {
    let maxE = 0;
    for (const d of fs.readdirSync(protoDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const m = /^E(\d+)$/.exec(d.name);
      if (m) { const n = parseInt(m[1], 10); if (n > maxE) maxE = n; }
    }
    if (maxE > 0) return `prototype/E${maxE}/`;
  }
  if (fs.existsSync(path.join(versionDir, 'assets', 'prototype', funcName))) return `assets/prototype/${funcName}/`;
  return null;
}

/** 开发准备文件夹：development/ 下 {功能名}_{版本}_开发交接_E{最新} 目录名 */
function resolveDevHandoff(versionDir, funcName, version) {
  const devDir = path.join(versionDir, 'development');
  if (!fs.existsSync(devDir)) return null;
  const re = new RegExp(`^${escRe(funcName)}_${escRe(version)}_开发交接_E(\\d+)$`);
  let best = null, bestE = 0;
  for (const d of fs.readdirSync(devDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const m = re.exec(d.name);
    if (m) { const e = parseInt(m[1], 10); if (e > bestE) { bestE = e; best = d.name; } }
  }
  return best;
}

/** 刷新 {版本目录}/_README/（README.md 数据源 + README.html 门户）。
 *  返回 'ok' | 'skipped'（版本目录不存在）| 'error'；失败不抛异常（不阻塞保存/索引） */
function refreshReadme({ baseDir, funcName, version }) {
  let status = 'ok';
  try {
    const versionDir = path.join(baseDir, version);
    if (!fs.existsSync(versionDir)) return 'skipped';

    // 吸收：存量项目 README.md 在版本目录顶层（旧位置）→ 收编进 _README/（随后被下方新内容覆盖）
    const legacyReadme = path.join(versionDir, 'README.md');
    if (fs.existsSync(legacyReadme)) {
      fs.mkdirSync(path.join(versionDir, '_README'), { recursive: true });
      fs.copyFileSync(legacyReadme, path.join(versionDir, '_README', 'README.md'));
      fs.unlinkSync(legacyReadme);
    }

    const brief = latestInDir(path.join(versionDir, 'brief'), /简报_E(\d+)\.md$/);
    const fakeJudge = latestByKeyword(path.join(versionDir, 'report'), '伪需求判断报告');
    const simplePrd = latestInDir(path.join(versionDir, 'prd'), /_简版PRD_E(\d+)\.md$/);
    const flowchartDir = fs.existsSync(path.join(versionDir, 'flowchart')) ? 'flowchart' : 'flowcharts';
    const flowchart = latestInDir(path.join(versionDir, flowchartDir), /_流程图_E(\d+)\.md$/);
    const sequence = latestInDir(path.join(versionDir, 'sequence'), /_时序图_E(\d+)\.md$/);
    const reviewPrd = latestByKeyword(path.join(versionDir, 'report'), '综合审查报告');
    const decision = latestInDir(path.join(versionDir, 'decision'), /_决策记录_E(\d+)\.md$/);
    const planning = latestInDir(path.join(versionDir, 'planning'), /_产品迭代规划_E(\d+)\.md$/);
    const prototype = resolvePrototypePath(versionDir, funcName);
    const devHandoff = resolveDevHandoff(versionDir, funcName, version);
    const fullPrd = latestFullPrd(path.join(versionDir, 'prd'));

    const now = new Date();
    const ts = `${now.getFullYear()}-${PAD(now.getMonth() + 1)}-${PAD(now.getDate())} ${PAD(now.getHours())}:${PAD(now.getMinutes())}:${PAD(now.getSeconds())}`;
    const cell = (v, sub) => (v ? `\`${sub}${v}\`` : '未产出');
    const protoCell = prototype ? `\`${prototype}\`` : '未产出';
    const devCell = devHandoff ? `\`development/${devHandoff}/\`` : '未产出';
    const checklist = fs.existsSync(path.join(versionDir, '_进度清单.md')) ? '_进度清单.md' : '';

    const L = [];
    L.push(`# ${funcName} ${version} — 评审与开发必读指南`);
    L.push('');
    L.push(`> 路径基准：本文档内所有路径均相对于版本目录 \`${version}\`。`);
    L.push('> 标注「未产出」的文档表示对应目录中未找到该文档。');
    L.push('> 本文档由 pmcraft-req:save-doc 在每次保存文档后自动刷新（原型存档经 save-version 触发），请勿手动编辑路径。');
    L.push(`> 最后刷新：${ts}`);
    L.push('');
    // 整体进度：流程进度与待办清单（版本目录根 _进度清单.md，由路由大脑按 CLAUDE.md「流程清单」节维护；此处只机械维护存在性入口行）
    L.push('## 整体进度');
    L.push('');
    L.push('| 文档 | 路径 |');
    L.push('|:---|:---|');
    L.push(`| 进度清单（自动生成，随时说「进度」刷新） | ${cell(checklist, '')} |`);
    L.push('');
    // 阅读顺序：文字（简报/PRD）与静态图（流程/时序）先建立理解 → 原型（可交互对照 PRD）→ 质量与范围结论 → 决策记录（全程溯源档案，末位）
    L.push('## 产品评审必读');
    L.push('');
    L.push('| 文档 | 路径 |');
    L.push('|:---|:---|');
    L.push(`| 需求简报 | ${cell(brief, 'brief/')} |`);
    L.push(`| 简报审查报告（伪需求判断报告） | ${cell(fakeJudge, 'report/')} |`);
    L.push(`| 流程图 | ${cell(flowchart, `${flowchartDir}/`)} |`);
    L.push(`| 时序图 | ${cell(sequence, 'sequence/')} |`);
    L.push(`| PRD（简版） | ${cell(simplePrd, 'prd/')} |`);
    L.push(`| 原型 | ${protoCell} |`);
    L.push(`| 综合审查报告 | ${cell(reviewPrd, 'report/')} |`);
    L.push(`| 产品迭代规划 | ${cell(planning, 'planning/')} |`);
    L.push(`| 决策记录 | ${cell(decision, 'decision/')} |`);
    L.push('');
    // 开发先文字抓重点再图，最后对照原型
    L.push('## 程序开发前必读');
    L.push('');
    L.push('| 文档 | 路径 |');
    L.push('|:---|:---|');
    L.push(`| PRD（简版） | ${cell(simplePrd, 'prd/')} |`);
    L.push(`| 流程图 | ${cell(flowchart, `${flowchartDir}/`)} |`);
    L.push(`| 时序图 | ${cell(sequence, 'sequence/')} |`);
    L.push(`| 原型 | ${protoCell} |`);
    L.push(`| 产品迭代规划 | ${cell(planning, 'planning/')} |`);
    L.push(`| 开发准备文件夹 | ${devCell} |`);
    L.push('');
    L.push('## 程序开发前选读');
    L.push('');
    L.push('| 文档 | 路径 |');
    L.push('|:---|:---|');
    L.push(`| PRD（完整版） | ${cell(fullPrd, 'prd/')} |`);

    // README.md（门户数据源）→ _README/ 子目录；门户生成失败不影响 md 写盘
    fs.mkdirSync(path.join(versionDir, '_README'), { recursive: true });
    fs.writeFileSync(path.join(versionDir, '_README', 'README.md'), L.join('\n') + '\n', 'utf8');
    readmePortal.buildPortal({ versionDir, funcName, version });
  } catch (e) {
    // 必读指南/门户刷新失败不阻塞保存/索引
    status = 'error';
  }
  return status;
}

// ===== 主流程 =====
function main() {
  const args = parseArgs(process.argv);
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;

  // ---- 必选参数检查 ----
  if (!args['base-dir']) usage('缺少 --base-dir（功能顶级目录路径）');
  const baseDir = path.resolve(args['base-dir']);
  if (!fs.existsSync(baseDir)) fail('功能顶级文件夹路径不存在', baseDir);

  // ---- base-dir 防误传校验（对 IndexOnly 与正常保存两种模式均生效）----
  // base-dir 应为功能顶级目录（含版本子目录的父目录）。若 basename 匹配版本号格式
  // （如误传 C:/项目/账号系统/1.0.0），功能名会退化为"1.0.0"、文档落入嵌套 version/version/
  // 目录、_index.md 错位——污染难以自查，故在落盘前直接拒绝。
  const VERSION_DIR_RE = /^V?\d+\.\d+\.\d+$/;
  if (VERSION_DIR_RE.test(path.basename(baseDir))) {
    fail('base-dir 误传版本目录', `base-dir 应为功能顶级目录（版本子目录的父目录），收到：${baseDir}`, '正确示例：--base-dir=C:/项目/账号系统（不含版本号，版本号由 --version 单独指定）');
  }

  const funcName = resolveFuncName(baseDir);

  // ---- ReadmeOnly 模式：手动重生成 _README/（README.md + README.html 门户），不保存文档 ----
  if (args['readme-only'] === 'true' || args['readme-only'] === true) {
    if (!args.version) usage('--readme-only 需要 --version（版本号）');
    const v = args.version;
    if (!/^(V)?\d+\.\d+\.\d+$/.test(v)) {
      fail('版本号格式错误', `版本号须为 1.0.0 或 V1.0.0 格式，当前输入: ${v}`, '使用 1.0.0 或 V1.0.0 格式');
    }
    if (!fs.existsSync(path.join(baseDir, v))) fail('版本目录不存在', path.join(baseDir, v));
    const st = refreshReadme({ baseDir, funcName, version: v });
    ok({ readme_only: true, function_name: funcName, version: v, readme_html: st });
  }

  // ---- IndexOnly 模式 ----
  if (args['index-only'] === 'true' || args['index-only'] === true) {
    let external = {};
    if (args['summaries-file']) {
      const sf = path.resolve(args['summaries-file']);
      if (!fs.existsSync(sf)) fail('Summaries 文件不存在', sf);
      try {
        external = JSON.parse(fs.readFileSync(sf, 'utf8'));
      } catch (e) {
        fail('Summaries JSON 解析失败', e.message);
      }
    } else if (args.summaries) {
      try { external = JSON.parse(args.summaries); } catch (e) { fail('--summaries JSON 解析失败', e.message); }
    }
    const indexFile = path.join(baseDir, '_index.md');
    if (dryRun) {
      ok({ dry_run: true, action: 'index_only', index_file: toForwardSlashes(indexFile), func_name: funcName, summaries_count: Object.keys(external).length });
    }
    const { filesNeedingAI } = rebuildIndex({
      indexFile, funcName, baseDir, external
    });
    // 必读指南 README.md + 门户刷新：IndexOnly 无 --version，扫描 baseDir 下全部版本目录逐个刷新
    // （原型存档 save-version 经 --index-only 触发，原型行随之更新）
    const readmeStatuses = [];
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!/^(V)?\d+\.\d+\.\d+$/.test(entry.name)) continue;
      readmeStatuses.push(refreshReadme({ baseDir, funcName, version: entry.name }));
    }
    ok({
      index_updated: true, function_name: funcName, files_needing_ai_summary: filesNeedingAI,
      readme_html: readmeStatuses.length === 0 ? 'skipped'
        : readmeStatuses.every(s => s === 'ok') ? 'ok'
        : readmeStatuses.every(s => s !== 'ok') ? 'error' : 'partial'
    });
  }

  // ---- 正常保存流程 ----
  if (!args.version) usage('缺少 --version（版本号）');
  if (!args['doc-type']) usage('缺少 --doc-type（文档类型）');
  if (!args['temp-file']) usage('缺少 --temp-file（临时文件路径）');

  const version = args.version;
  if (!/^(V)?\d+\.\d+\.\d+$/.test(version)) {
    fail('版本号格式错误', `版本号须为 1.0.0 或 V1.0.0 格式，当前输入: ${version}`, '使用 1.0.0 或 V1.0.0 格式');
  }
  const docType = args['doc-type'];
  const tempFile = path.resolve(args['temp-file']);
  const summary = args.summary || '';
  const author = args.author || '';
  const keepTemp = args['keep-temp'] === 'true' || args['keep-temp'] === true;

  const targetSubDir = mapDocTypeToSubDir(docType);
  if (!targetSubDir) fail('无法识别的文档类型', docType, '支持：规划/决策记录/简报/PRD/分析/研究/报告/摘要/流程/时序/测试/调研/开发交接');

  // 临时文件检查
  const isFolder = fs.existsSync(tempFile) && fs.statSync(tempFile).isDirectory();
  if (!fs.existsSync(tempFile)) fail('临时文件不存在', tempFile);
  if (!isFolder && fs.statSync(tempFile).size === 0) {
    fail('临时文件为空', tempFile, '请确认临时文件内容已写入');
  }

  // ---- 预保存质量检查（4 项） ----
  // 内置为保存前自动检查：不合格拒绝保存（返回精确行号供修复）。--skip-precheck 逃生口。
  const skipPrecheck = args['skip-precheck'] === 'true' || args['skip-precheck'] === true;
  if (!isFolder && !skipPrecheck && !dryRun) {
    const checkWarnings = preSaveCheck(tempFile);
    if (checkWarnings.length > 0) {
      fail('预保存质量检查未通过', checkWarnings.map(w => `第 ${w.line} 行: ${w.message}`).join('\n'), '请修复后重新保存。若确认无需检查，可加 --skip-precheck');
    }
  }

  const versionDir = path.join(baseDir, version);
  const targetDir = path.join(versionDir, targetSubDir);

  // ---- 目录树创建 + 迁移 ----
  if (dryRun) {
    ok({
      dry_run: true,
      actions: [
        `创建目录树 ${SUB_DIRS.length} 个子目录（${versionDir}）`,
        `迁移旧目录（flowcharts/ assets/）`,
        `扫描 E 编号（${targetDir}）`,
        `复制临时文件 → ${targetDir}`,
        keepTemp ? '保留临时文件' : '删除临时文件',
        '重建 _index.md',
        '刷新 _README/README.md 并生成 README.html 门户'
      ],
      func_name: funcName, version, doc_type: docType, target_subdir: targetSubDir
    });
  }

  for (const sd of SUB_DIRS) ensureDir(path.join(versionDir, sd));
  migrateDirs(versionDir);

  // ---- E 编号扫描（单文件模式扫 .md，文件夹模式扫目录）+ TOCTOU 二次检查 ----
  const regexVersion = version.replace(/^V/, '(?:V)?').replace(/\./g, '\\.');
  const regexFuncName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexDocType = docType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = isFolder
    ? new RegExp(`^${regexFuncName}_${regexVersion}_${regexDocType}_E(\\d+)$`)
    : new RegExp(`^${regexFuncName}_${regexVersion}_${regexDocType}_E(\\d+)\\.md$`);

  const scanMaxE = () => {
    if (!fs.existsSync(targetDir)) return 0;
    const items = isFolder
      ? fs.readdirSync(targetDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
      : fs.readdirSync(targetDir, { withFileTypes: true }).filter(f => f.isFile()).map(f => f.name);
    let maxE = 0;
    for (const name of items) {
      const m = regexPattern.exec(name);
      if (m) { const n = parseInt(m[1], 10); if (n > maxE) maxE = n; }
    }
    return maxE;
  };

  let maxE = scanMaxE();
  let newE = maxE + 1;
  let newName = `${funcName}_${version}_${docType}_E${newE}`;
  if (!isFolder) newName += '.md';
  let newPath = path.join(targetDir, newName);

  // 二次检查（并发防碰撞）
  if (fs.existsSync(newPath)) {
    maxE = scanMaxE();
    newE = maxE + 1;
    newName = `${funcName}_${version}_${docType}_E${newE}`;
    if (!isFolder) newName += '.md';
    newPath = path.join(targetDir, newName);
  }

  // ---- 复制临时文件 ----
  try {
    if (isFolder) {
      copyDir(tempFile, newPath);
    } else {
      const content = fs.readFileSync(tempFile, 'utf8');
      fs.writeFileSync(newPath, content, { encoding: 'utf8' });
    }
  } catch (e) {
    fail('复制文件失败', e.message);
  }

  // ---- 清理临时文件 ----
  if (!keepTemp) {
    if (isFolder) { try { fs.rmSync(tempFile, { recursive: true, force: true }); } catch (e) {} }
    else removeFile(tempFile);
  }

  // ---- 重建 _index.md ----
  let currentSubGroup = '';
  if (targetSubDir === 'report') {
    if (docType.includes('综合审查')) currentSubGroup = '综合审查报告';
    else if (docType.includes('修订摘要')) currentSubGroup = '修订摘要';
    else if (docType.includes('伪需求')) currentSubGroup = '伪需求判断报告';
    else if (docType.includes('旅程审查')) currentSubGroup = '用户旅程审查报告';
    else if (docType.includes('一致性检查')) currentSubGroup = '一致性检查报告';
    else currentSubGroup = docType;
  }
  if (targetSubDir === 'analysis') {
    if (docType.includes('研究洞察')) currentSubGroup = '研究洞察报告';
    else if (docType.includes('竞品分析')) currentSubGroup = '竞品分析报告';
    else if (docType.includes('商业分析')) currentSubGroup = '商业分析报告';
    else currentSubGroup = docType;
  }
  if (targetSubDir === 'prd') {
    if (docType.includes('简版PRD')) currentSubGroup = '简版PRD';
  }
  if (targetSubDir === 'testcase') {
    // 质量后缀与 indexer.js testcase 子分组一致（标准='' / 中='中' / 高='高'），保证 isCurrent 摘要精确匹配
    const tm = /^测试用例_(.+)$/.exec(docType);
    if (tm) currentSubGroup = tm[1];
  }

  let filesNeedingAI = [];
  try {
    const indexFile = path.join(baseDir, '_index.md');
    const result = rebuildIndex({
      indexFile, funcName, baseDir,
      current: {
        version, subDir: targetSubDir, subGroup: currentSubGroup,
        edition: `E${newE}`, summary, author
      }
    });
    filesNeedingAI = result.filesNeedingAI;
  } catch (e) {
    // 索引失败不阻塞保存
  }

  // 必读指南 _README/（README.md + README.html 门户）刷新（与 _index.md 同步；开发交接目录形态保存时"开发准备文件夹"行恰好含刚保存的 E）
  const readmeHtmlStatus = refreshReadme({ baseDir, funcName, version });

  ok({
    path: toForwardSlashes(newPath),
    function_name: funcName,
    version,
    doc_type: docType,
    edition: `E${newE}`,
    index_updated: true,
    files_needing_ai_summary: filesNeedingAI,
    readme_html: readmeHtmlStatus
  });
}

main();
