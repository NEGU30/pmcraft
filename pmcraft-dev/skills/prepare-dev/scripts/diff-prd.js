#!/usr/bin/env node
/**
 * diff-prd.js — PRD 版本对比 diff（prepare-dev，替代 LLM 人肉 diff）
 *
 * 真实 PRD 结构（已验证）：用例靠 `#### 用例N：标题` 的 H4 标题序号标识，
 * 每用例是两列表格（字段名→内容）。按 H4 标题切分，同序号对比字段内容。
 *
 * 用法：
 *   node diff-prd.js --version-dir=<版本目录>
 *
 * 输出：{current_version, previous_version, current_prd, previous_prd,
 *        changes{summary{added,modified,removed,renamed},
 *        details[{case_no, type, title, title_changed, changed_fields}]}, is_new_project}
 *   type: ADDED | MODIFIED | REMOVED | RENAMED（仅标题变化、内容不变）
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
const { readUtf8 } = require(path.join(sharedLib, 'encoding'));
const { scanVersions } = require(path.join(sharedLib, 'version-scanner'));

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

/** 从版本目录找 PRD 文件（E 编号最大，排除简版PRD） */
function findLatestPrd(versionDir) {
  const prdDir = path.join(versionDir, 'prd');
  if (!fs.existsSync(prdDir)) return null;
  const files = fs.readdirSync(prdDir)
    .filter(f => /_PRD_E\d+\.md$/.test(f))
    // 排除文件名含「简版」的简版PRD（与 SKILL.md Phase 0 Step 2 排除规则一致）：
    // 简版PRD 与完整 PRD 的 E 编号独立递增、同目录并存，命中通配/正则两系列时
    // 简版 E 更大不代表它"更新"，误取会导致变更集错漏。显式排除，不依赖命名巧合。
    .filter(f => !f.includes('简版'))
    .map(f => {
      const m = /_E(\d+)\.md$/.exec(f);
      return { file: f, e: parseInt(m[1], 10) };
    })
    .sort((a, b) => b.e - a.e);
  return files.length ? files[0] : null;
}

/** 解析 PRD 用例：按 `#### 用例N：标题` 切分，返回 [{no, title, fields{field: content}}] */
function parseCases(content) {
  const lines = content.split(/\r?\n/);
  const cases = [];
  let current = null;
  for (const line of lines) {
    const headerMatch = /^####\s*用例(\d+)[：:]\s*(.+)$/.exec(line);
    if (headerMatch) {
      if (current) cases.push(current);
      current = { no: parseInt(headerMatch[1], 10), title: headerMatch[2].trim(), fields: {} };
      continue;
    }
    if (current) {
      // 两列表格：| **字段名** | 内容 |
      const tableMatch = /^\|\s*\*{0,2}([^*|]+?)\*{0,2}\s*\|\s*(.+?)\s*\|$/.exec(line);
      if (tableMatch) {
        const field = tableMatch[1].trim();
        const val = tableMatch[2].trim();
        if (field && !/^[-—]+$/.test(field)) {
          current.fields[field] = (current.fields[field] ? current.fields[field] + '\n' : '') + val;
        }
      }
    }
  }
  if (current) cases.push(current);
  return cases;
}

/** 对比两个用例集，输出变更详情 */
function diffCases(oldCases, newCases) {
  const details = [];
  const oldMap = new Map(oldCases.map(c => [c.no, c]));
  const newMap = new Map(newCases.map(c => [c.no, c]));

  // ADDED：仅新版有
  for (const [no, c] of newMap) {
    if (!oldMap.has(no)) {
      details.push({ case_no: no, type: 'ADDED', title: c.title, title_changed: false, changed_fields: [] });
    }
  }
  // REMOVED：仅旧版有
  for (const [no, c] of oldMap) {
    if (!newMap.has(no)) {
      details.push({ case_no: no, type: 'REMOVED', title: c.title, title_changed: false, changed_fields: [] });
    }
  }
  // MODIFIED：同序号对比
  for (const [no, oldC] of oldMap) {
    const newC = newMap.get(no);
    if (!newC) continue;
    const titleChanged = oldC.title !== newC.title;
    const changedFields = [];
    const allFields = new Set([...Object.keys(oldC.fields), ...Object.keys(newC.fields)]);
    for (const f of allFields) {
      const oldV = oldC.fields[f] || '';
      const newV = newC.fields[f] || '';
      if (oldV !== newV) changedFields.push(f);
    }
    if (titleChanged || changedFields.length) {
      // RENAMED：标题变化但字段内容不变（与 SKILL.md 对 RENAMED 的定义一致）
      const type = titleChanged && changedFields.length === 0 ? 'RENAMED' : 'MODIFIED';
      details.push({
        case_no: no, type, title: newC.title,
        title_changed: titleChanged,
        changed_fields: changedFields.slice(0, 10)
      });
    }
  }
  // 排序：按用例号
  details.sort((a, b) => a.case_no - b.case_no);
  return details;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args['version-dir']) usage('缺少 --version-dir（版本目录路径）');
  const versionDir = path.resolve(args['version-dir']);
  if (!fs.existsSync(versionDir)) fail('版本目录不存在', versionDir);

  // 定位版本：当前版本目录 + 上一版本（紧邻当前、版本号更小者）
  const projectRoot = path.dirname(versionDir);
  const versions = scanVersions(projectRoot);
  if (!versions.length) fail('未找到任何版本目录', projectRoot,
    '请确认 --version-dir 为 <项目文件夹>/V*.*.*/ 形式的版本目录（非项目文件夹本身）');
  const curVer = versions.find(v => v.path === versionDir);
  if (!curVer) fail('未匹配到版本目录（目录名须为 V*.*.* 格式）', versionDir);
  const curIdx = versions.indexOf(curVer);
  const prevVer = curIdx > 0 ? versions[curIdx - 1] : null;

  const curPrd = findLatestPrd(curVer.path);
  if (!curPrd) fail('当前版本无 PRD 文件', curVer.path);

  // 首次版本（无上一版本或上一版本无 PRD）
  const prevPrd = prevVer ? findLatestPrd(prevVer.path) : null;
  const isNewProject = !prevPrd;

  let details;
  if (isNewProject) {
    const cases = parseCases(readUtf8(path.join(curVer.path, 'prd', curPrd.file)) || '');
    details = cases.map(c => ({ case_no: c.no, type: 'ADDED', title: c.title, title_changed: false, changed_fields: [] }));
  } else {
    const oldContent = readUtf8(path.join(prevVer.path, 'prd', prevPrd.file)) || '';
    const newContent = readUtf8(path.join(curVer.path, 'prd', curPrd.file)) || '';
    const oldCases = parseCases(oldContent);
    const newCases = parseCases(newContent);
    details = diffCases(oldCases, newCases);
  }

  const summary = {
    added: details.filter(d => d.type === 'ADDED').length,
    modified: details.filter(d => d.type === 'MODIFIED').length,
    removed: details.filter(d => d.type === 'REMOVED').length,
    renamed: details.filter(d => d.type === 'RENAMED').length
  };

  ok({
    current_version: curVer.version,
    previous_version: prevVer ? prevVer.version : null,
    current_prd: { path: path.join(curVer.path, 'prd', curPrd.file).replace(/\\/g, '/'), e_number: `E${curPrd.e}` },
    previous_prd: prevPrd ? { path: path.join(prevVer.path, 'prd', prevPrd.file).replace(/\\/g, '/'), e_number: `E${prevPrd.e}` } : null,
    changes: { summary, details },
    is_new_project: isNewProject
  });
}

main();
