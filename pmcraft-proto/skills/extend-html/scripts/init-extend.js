#!/usr/bin/env node
/**
 * init-extend.js — extend-html 初始化（Phase 1 机械操作：校验输入 → source/ 备份 → pages/ 落副本
 *                  → index.html 入口 → .extend-html.json）
 *
 * 参照 save-version "脚本 + LLM" 模式：LLM 只负责运行脚本 → 解析 JSON → 交互决策 → 转述结果，
 * 不自行实现复制/命名/JSON 写入逻辑。
 *
 * 用法：
 *   node init-extend.js --version-dir=<版本目录> --inputs=<HTML路径1,HTML路径2> [--answers=<决策1,决策2>] [--dry-run]
 *   node init-extend.js --version-dir=<版本目录> --from-project [--inputs=<...>] [--dry-run]
 *
 * --from-project 入口（extract-design --project 交接）：source/ 与 pages/ 已由转换侧直接落盘，
 *   本脚本跳过 ②③，只执行 ④⑤（生成 index.html 入口 + 写/更新 .extend-html.json）。
 *   传 --inputs 时逐个登记 import 条目（页面名 = basename）；不传则扫描 pages/ 现有 .html 全量登记。
 *
 * 交互模式（同名冲突）：
 *   首次运行遇到同名冲突（source/ 或 pages/ 已存在同名文件且内容不同）→ 返回 status:"interaction"，
 *   data.collisions 含全部冲突项及选项。LLM 用 AskUserQuestion 收集 PM 决策后，
 *   携带 --answers（overwrite_<N> / suffix_<N>，N 为冲突序号）重调脚本一次完成。
 *   内容一致的同名文件视为重复导入，静默跳过（幂等）。
 *
 * --answers 可选值：
 *   overwrite_<N>  覆盖冲突项 N（source/ 与 pages/ 同步覆盖）
 *   suffix_<N>     为冲突项 N 追加 -2（同名已存在时递增 -2/-3/...）
 *
 * 输出 JSON 契约：
 *   {status, mode: "extend-html", imports: [{page, source, importedAt, fromProject}],
 *    index_entry: "stub" | "nav", extend_json: "created" | "updated",
 *    source_files: [...], working_files: [...], collisions: [...],
 *    warning: "<2MB 提示>" | null}
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
const { ensureDir, readUtf8, writeUtf8, toForwardSlashes } = require(path.join(sharedLib, 'encoding'));

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

/** 文件名校验清洗：保留 [A-Za-z0-9._-] 与中文/全角字符，其余替换为 -，末尾强制 .html */
function cleanBasename(name) {
  let base = path.basename(name).replace(/\.[^.]+$/, '');
  base = base.replace(/[^\w一-龥.\-]/g, '-').replace(/-+/g, '-');
  if (!base) base = 'page';
  return base + '.html';
}

/** 同名冲突：已存在且内容不同 → 冲突；内容一致 → 幂等跳过 */
function resolveConflict(targetFile, content) {
  if (!fs.existsSync(targetFile)) return 'none';
  const existing = readUtf8(targetFile);
  return existing === content ? 'duplicate' : 'conflict';
}

function main() {
  const args = parseArgs(process.argv);
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
  const fromProject = args['from-project'] === 'true' || args['from-project'] === true;
  const answers = (args.answers || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!args['version-dir']) usage('缺少 --version-dir（版本目录路径）');
  const versionDir = path.resolve(args['version-dir']);
  if (!fs.existsSync(versionDir)) fail('版本目录不存在', versionDir);

  const protoDir = path.join(versionDir, 'prototype');
  const sourceDir = path.join(protoDir, 'reference', 'source');
  const pagesDir = path.join(protoDir, 'working', 'pages');
  const workingDir = path.join(protoDir, 'working');
  const extendJsonPath = path.join(workingDir, '.extend-html.json');

  // ---- ① 校验输入 ----
  const inputs = (args.inputs || '').split(',').map(s => s.trim()).filter(Boolean);
  const validated = [];
  const invalid = [];
  for (const raw of inputs) {
    const p = path.resolve(raw);
    if (!fs.existsSync(p)) { invalid.push(`${raw}（文件不存在）`); continue; }
    if (!/\.html?$/i.test(p)) { invalid.push(`${raw}（非 .html 文件）`); continue; }
    const content = readUtf8(p);
    if (!/<html[\s>]/i.test(content)) { invalid.push(`${raw}（不含 <html 标记）`); continue; }
    validated.push({ p, content });
  }
  if (invalid.length) fail('输入校验未通过', invalid.join('；'));
  if (!fromProject && validated.length === 0) usage('缺少 --inputs（至少一个 HTML 文件路径，逗号分隔）');

  // ---- 大文件提示（>2MB 建议小步编辑）----
  const warnings = validated.filter(v => v.content.length > 2 * 1024 * 1024)
    .map(v => `${path.basename(v.p)}（${(v.content.length / 1024 / 1024).toFixed(1)}MB）`);
  const warning = warnings.length ? `导入文件较大（${warnings.join('、')}），建议小步修改：每次 Edit 精准片段替换，禁止整文件 Write 重写。` : null;

  // ---- ②③ source/ 备份 + pages/ 落副本（--from-project 跳过）----
  const sourceFiles = [];
  const workingFiles = [];
  const collisions = [];
  const imports = [];
  const now = new Date().toISOString();

  const pending = fromProject
    ? (validated.length ? validated : null) // null → 扫描 pages/ 现有 .html
    : validated;

  const targets = [];
  if (pending) {
    for (const v of pending) {
      targets.push({ name: cleanBasename(v.p), content: v.content, fromProject });
    }
  } else {
    // --from-project 无 --inputs：扫描 pages/ 现有 .html 全量登记
    if (!fs.existsSync(pagesDir)) fail('pages/ 目录不存在', '--from-project 且未传 --inputs 时要求 pages/ 已有转换产物');
    for (const f of fs.readdirSync(pagesDir)) {
      if (!/\.html?$/i.test(f)) continue;
      targets.push({ name: f, content: null, fromProject: true });
    }
  }

  // 同名去重（多次 --inputs 传入同一文件）→ 以最后一个为准
  const seen = new Set();
  for (const t of targets) {
    if (seen.has(t.name)) continue;
    seen.add(t.name);

    const sourceTarget = path.join(sourceDir, t.name);
    const workingTarget = path.join(pagesDir, t.name);

    if (!fromProject) {
      // ② ③：source/ 备份 + pages/ 落副本，冲突逐项判定
      const sourceC = resolveConflict(sourceTarget, t.content);
      const workingC = resolveConflict(workingTarget, t.content);
      if (sourceC === 'conflict' || workingC === 'conflict') {
        collisions.push({
          index: collisions.length,
          name: t.name,
          source_target: toForwardSlashes(sourceTarget),
          working_target: toForwardSlashes(workingTarget),
          source_state: sourceC,
          working_state: workingC,
          options: [
            { label: '覆盖', description: `用新文件覆盖现有 ${t.name}（source/ 与 pages/ 同步覆盖，原稿不可恢复）` },
            { label: '新副本 -2', description: `保留现有 ${t.name}，导入为新副本（同名已存在时递增 -2/-3/...）` }
          ]
        });
        continue;
      }
      // duplicate（两边都一致）→ 幂等跳过，仅登记
      const pageName = t.name;
      if (sourceC === 'duplicate' && workingC === 'duplicate') {
        imports.push({ page: pageName, source: pageName, importedAt: now, fromProject: false });
        continue;
      }
    }

    // 落盘（非 dry-run）
    if (!dryRun) {
      if (!fromProject) {
        ensureDir(sourceDir);
        writeUtf8(sourceTarget, t.content);
        ensureDir(pagesDir);
        writeUtf8(workingTarget, t.content);
        sourceFiles.push(toForwardSlashes(sourceTarget));
      }
      // --from-project：文件已由转换侧落盘，只登记不写
      workingFiles.push(toForwardSlashes(workingTarget));
    }
    const pageName = t.name;
    if (!fromProject || pending === null) {
      imports.push({ page: pageName, source: pageName, importedAt: now, fromProject });
    } else {
      imports.push({ page: pageName, source: '项目代码转换', importedAt: now, fromProject: true });
    }
  }

  // ---- 交互：有同名冲突且无答案 → 一次返回全部 ----
  if (!dryRun && collisions.length > 0 && !answers.length) {
    interact('init_extend_confirm', {
      ask: 'init_extend_confirm',
      collisions: collisions.map(c => ({
        index: c.index, name: c.name,
        source_target: c.source_target, working_target: c.working_target,
        source_state: c.source_state, working_state: c.working_state,
        options: c.options
      })),
      prompt: '导入时发现同名文件冲突（source/ 或 pages/ 已存在同名且内容不同）：'
    });
    return;
  }

  // ---- 应用答案（覆盖/新副本）----
  for (const c of collisions) {
    const overwrite = answers.some(a => a === `overwrite_${c.index}`);
    const suffix = answers.some(a => a === `suffix_${c.index}`);
    if (!overwrite && !suffix) continue; // 未决策的冲突跳过（不落盘该页）
    let name = c.name;
    if (suffix) {
      const base = c.name.replace(/\.html$/, '');
      let n = 2;
      while (fs.existsSync(path.join(pagesDir, `${base}-${n}.html`))) n++;
      name = `${base}-${n}.html`;
    }
    const t = pending.find(v => cleanBasename(v.p) === c.name);
    if (!t) continue;
    if (!dryRun) {
      ensureDir(sourceDir);
      ensureDir(pagesDir);
      writeUtf8(path.join(sourceDir, name), t.content);
      writeUtf8(path.join(pagesDir, name), t.content);
      sourceFiles.push(toForwardSlashes(path.join(sourceDir, name)));
      workingFiles.push(toForwardSlashes(path.join(pagesDir, name)));
    }
    imports.push({ page: name, source: name, importedAt: now, fromProject: false });
  }

  // ---- ⑤ 写/更新 .extend-html.json（多次导入追加）----
  let extendJson = { mode: 'extend-html', imports: [] };
  if (fs.existsSync(extendJsonPath)) {
    try {
      const existing = JSON.parse(readUtf8(extendJsonPath));
      if (existing && Array.isArray(existing.imports)) extendJson = existing;
    } catch (e) { /* 损坏则重建 */ }
  }
  const knownPages = new Set(extendJson.imports.map(i => i.page));
  for (const imp of imports) {
    if (!knownPages.has(imp.page)) extendJson.imports.push(imp);
  }
  let extendJsonState = 'created';
  if (fs.existsSync(extendJsonPath)) {
    try {
      const existing = JSON.parse(readUtf8(extendJsonPath));
      extendJsonState = existing && existing.imports.length === extendJson.imports.length ? 'unchanged' : 'updated';
    } catch (e) { extendJsonState = 'updated'; }
  }
  if (!dryRun) {
    ensureDir(workingDir);
    writeUtf8(extendJsonPath, JSON.stringify(extendJson, null, 2) + '\n');
  }

  // ---- ④ index.html 入口（单页 stub / 多页导航自动判断）——基于合并后的完整页面列表，
  //      与 .extend-html.json 保持一致（冲突后缀/覆盖后多页场景不产生 stub/导航漂移）----
  const uniquePages = [...new Set(extendJson.imports.map(i => i.page))];
  let indexEntry = null;
  if (!dryRun) {
    if (uniquePages.length === 1) {
      // 单页 → meta refresh 重定向 stub
      indexEntry = `stub`;
      writeUtf8(path.join(workingDir, 'index.html'),
        `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <title>extend-html 原型入口</title>\n  <meta http-equiv="refresh" content="0; url=pages/${uniquePages[0]}">\n</head>\n<body>\n  <p>跳转中… <a href="pages/${uniquePages[0]}">点击进入 ${uniquePages[0]}</a></p>\n</body>\n</html>\n`);
    } else {
      // 多页 → 页面列表导航入口
      indexEntry = `nav`;
      const rows = uniquePages.map(p =>
        `    <li><a href="pages/${p}">${p.replace(/\.html?$/, '')}</a></li>`).join('\n');
      writeUtf8(path.join(workingDir, 'index.html'),
        `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <title>extend-html 原型入口</title>\n  <style>\n    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 16px; color: #1a1a2e; }\n    h1 { font-size: 20px; }\n    ul { list-style: none; padding: 0; }\n    li { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }\n    a { color: #2563eb; text-decoration: none; }\n  </style>\n</head>\n<body>\n  <h1>extend-html 导入页面</h1>\n  <p>以下页面由存量 HTML 导入，点击进入（外部链接保持原 href 并标注「外链」）。</p>\n  <ul>\n${rows}\n  </ul>\n</body>\n</html>\n`);
    }
  }

  ok({
    status: 'ok',
    mode: 'extend-html',
    imports: extendJson.imports,
    index_entry: dryRun ? null : indexEntry,
    extend_json: extendJsonState,
    source_files: sourceFiles,
    working_files: workingFiles,
    collisions: collisions.map(c => c.name),
    warning
  });
}

main();
