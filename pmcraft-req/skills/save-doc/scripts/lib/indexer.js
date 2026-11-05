/**
 * indexer.js — _index.md 文件索引重建
 *
 * 从 save_doc.ps1 的 Rebuild-IndexFile 函数移植为 Node.js。
 * 行为与 ps1 版保持一致（子分组 / testcase 质量后缀 / prototype 快照排序 / 旧索引兼容）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const reportSubGroups = ['综合审查报告', '用户旅程审查报告', '一致性检查报告', '修订摘要', '伪需求判断报告'];
const prdSubGroups = ['简版PRD'];
const analysisSubGroups = ['商业分析报告', '竞品分析报告', '研究洞察报告'];
const docTypeOrder = ['brief', 'meeting', 'decision', 'prd', 'report', 'testcase', 'planning', 'flowchart', 'sequence', 'survey', 'analysis', 'development', 'prototype'];

/** 转义正则元字符 */
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 目录/文件最后修改日期 yyyy-MM-dd */
function fileDate(p) {
  try {
    const st = fs.statSync(p);
    const d = st.mtime;
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch (e) { return today(); }
}

/** 今天日期 yyyy-MM-dd */
function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 重建索引（与 ps1 Rebuild-IndexFile 行为一致）。
 *
 * @param {object} opts
 *   indexFile   _index.md 路径
 *   funcName    功能名（索引标题）
 *   baseDir     功能顶级目录
 *   current     当前保存文档摘要 {version, subDir, subGroup, edition, summary, author}（正常保存时传，IndexOnly 不传）
 *   external    IndexOnly 外部摘要 {key: {summary, author}}
 * @returns {{filesNeedingAI: string[]}}
 */
function rebuildIndex(opts) {
  const { indexFile, funcName, baseDir, current, external } = opts;
  const ext = external || {};

  // 1. 解析现有索引，收集已存储摘要
  const stored = {};
  if (fs.existsSync(indexFile)) {
    let versionCtx = '', subDirCtx = '', subGroupCtx = '';
    for (const line of fs.readFileSync(indexFile, 'utf8').split(/\r?\n/)) {
      let m = /^\s*##\s+((?:V)?\d+\.\d+\.\d+)\s*$/.exec(line);
      if (m) { versionCtx = m[1]; subDirCtx = ''; subGroupCtx = ''; continue; }
      m = /^\s*###\s+(\w+)\/\s*$/.exec(line);
      if (m) { subDirCtx = m[1]; subGroupCtx = ''; continue; }
      m = /^\s*\*\*(.+)\*\*\s*$/.exec(line);
      if (m) { subGroupCtx = m[1]; continue; }
      m = /^\s*\|\s*(E\d+|main)(?:（(.+?)）)?\s*\|.+\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
      if (m) {
        const ed = m[1], quality = m[2], summary = m[3].trim(), author = m[4].trim();
        if (subDirCtx === 'testcase' && quality) {
          stored[`${versionCtx}|${subDirCtx}|${quality}|${ed}`] = { summary, author };
        } else {
          stored[`${versionCtx}|${subDirCtx}|${subGroupCtx}|${ed}`] = { summary, author };
        }
      }
    }
  }

  // 2. 扫描所有版本目录，构建条目（单遍，摘要就地解析）
  const escapedName = esc(funcName);
  const allEntries = [];
  const indexedKeys = {};
  const filesNeedingAI = [];
  const hasCurrent = !!(current && current.summary);
  // 忠实复刻 ps1：prototype 分支复用最近一次普通文件匹配到的版本号（原始值，含 V 前缀）
  let currentFileVer = '';

  const resolveSummary = (fileVer, subDir, edition, subGroup, isCurrent) => {
    const key = `${fileVer}|${subDir}|${subGroup}|${edition}`;
    if (isCurrent && current.summary) return { summary: current.summary, author: current.author };
    if (ext[key]) return { summary: ext[key].summary, author: ext[key].author };
    if (stored[key]) return { summary: stored[key].summary, author: stored[key].author };
    return { summary: '', author: '' };
  };

  if (fs.existsSync(baseDir)) {
    const versionDirs = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^(V)?\d+\.\d+\.\d+$/.test(d.name))
      .map(d => d.name).sort((a, b) => a.localeCompare(b));

    for (const verDir of versionDirs) {
      for (const subDir of docTypeOrder) {
        const subPath = path.join(baseDir, verDir, subDir);
        if (!fs.existsSync(subPath)) continue;

        if (subDir === 'development') {
          const dirs = fs.readdirSync(subPath, { withFileTypes: true })
            .filter(d => d.isDirectory()).map(d => d.name).sort((a, b) => a.localeCompare(b));
          for (const name of dirs) {
            const m = new RegExp(`^${escapedName}_((?:V)?\\d+\\.\\d+\\.\\d+)_(.+)_E(\\d+)$`).exec(name);
            if (!m) continue;
            const fileVer = m[1], fileE = `E${m[3]}`;
            currentFileVer = fileVer;
            const key = `${fileVer}|${subDir}||${fileE}`;
            indexedKeys[key] = true;
            const sm = resolveSummary(fileVer, subDir, fileE, '', fileVer === (current && current.version) && subDir === (current && current.subDir) && fileE === (current && current.edition));
            if (!sm.summary) filesNeedingAI.push(`${fileVer}/${subDir}/${name}`);
            allEntries.push({ Version: fileVer, SubDir: subDir, SubGroup: '', Edition: fileE, DisplayEdition: fileE, Summary: sm.summary, Author: sm.author, LastWrite: fileDate(path.join(subPath, name)) });
          }
        } else if (subDir === 'prototype') {
          const dirs = fs.readdirSync(subPath, { withFileTypes: true })
            .filter(d => d.isDirectory()).map(d => d.name).sort((a, b) => a.localeCompare(b));
          for (const name of dirs) {
            if (!/^(E\d+|main)$/.test(name)) continue;
            // ps1 行为：复用最近一次普通文件匹配到的版本号（可能含 V 前缀）
            const ver = currentFileVer || verDir.replace(/^[Vv]/, '');
            const key = `${ver}|${subDir}||${name}`;
            indexedKeys[key] = true;
            const sm = resolveSummary(ver, subDir, name, '', false);
            if (!sm.summary) filesNeedingAI.push(`${ver}/${subDir}/${name}`);
            allEntries.push({ Version: ver, SubDir: subDir, SubGroup: '', Edition: name, DisplayEdition: name, Summary: sm.summary, Author: sm.author, LastWrite: fileDate(path.join(subPath, name)) });
          }
        } else {
          const files = fs.readdirSync(subPath, { withFileTypes: true })
            .filter(f => f.isFile() && f.name.endsWith('.md')).map(f => f.name).sort((a, b) => a.localeCompare(b));
          for (const name of files) {
            const m = new RegExp(`^${escapedName}_((?:V)?\\d+\\.\\d+\\.\\d+)_(.+)_E(\\d+)\\.md$`).exec(name);
            if (!m) continue;
            const fileVer = m[1], fileDocType = m[2], fileE = `E${m[3]}`;
            currentFileVer = fileVer;
            let fileSubGroup = '', displayEdition = fileE;
            if (subDir === 'report') {
              fileSubGroup = reportSubGroups.find(sg => fileDocType.includes(sg)) || fileDocType;
            } else if (subDir === 'analysis') {
              fileSubGroup = analysisSubGroups.find(sg => fileDocType.includes(sg)) || fileDocType;
            } else if (subDir === 'testcase') {
              const tm = /^测试用例_(.+)$/.exec(fileDocType);
              if (tm) { fileSubGroup = tm[1]; displayEdition = `${fileE}（${tm[1]}）`; }
            } else if (subDir === 'prd') {
              fileSubGroup = prdSubGroups.find(sg => fileDocType.includes(sg)) || '';
            }
            const entryKey = `${fileVer}|${subDir}|${fileSubGroup}|${fileE}`;
            indexedKeys[entryKey] = true;
            // isCurrent 须分组严格相等：current.subGroup 为空（完整 PRD / 标准测试用例）时也不能命中其他子分组的行
            // （否则保存"测试用例_高 E2"会把摘要盖到同 E 编号的标准版/中版行上）
            const isCurrent = fileVer === (current && current.version) && subDir === (current && current.subDir) && fileE === (current && current.edition) && fileSubGroup === ((current && current.subGroup) || '');
            const sm = resolveSummary(fileVer, subDir, fileE, fileSubGroup, isCurrent);
            // 旧索引兼容：testcase 质量后缀 key 无摘要时回退查旧 key
            let finalSm = sm;
            if (!finalSm.summary && subDir === 'testcase' && fileSubGroup) {
              const oldKey = `${fileVer}|${subDir}||${fileE}`;
              if (stored[oldKey]) finalSm = { summary: stored[oldKey].summary, author: stored[oldKey].author };
            }
            if (!finalSm.summary) filesNeedingAI.push(`${fileVer}/${subDir}/${name}`);
            allEntries.push({ Version: fileVer, SubDir: subDir, SubGroup: fileSubGroup, Edition: fileE, DisplayEdition: displayEdition, Summary: finalSm.summary, Author: finalSm.author, LastWrite: fileDate(path.join(subPath, name)) });
          }
        }
      }
    }
  }

  // 3. 当前文档补充（正常保存流程，且不在已索引中）
  if (hasCurrent) {
    const currentKey = `${current.version}|${current.subDir}|${current.subGroup}|${current.edition}`;
    if (!indexedKeys[currentKey]) {
      allEntries.push({ Version: current.version, SubDir: current.subDir, SubGroup: current.subGroup, Edition: current.edition, DisplayEdition: current.edition, Summary: current.summary, Author: current.author, LastWrite: today() });
    }
  }

  // 4. 排序（版本降序 → docTypeOrder → subgroup → Edition：main 最大，E{n} 降序）
  const versionNum = v => {
    const s = String(v).replace(/^V/, '').split('.').map(Number);
    return (s[0] || 0) * 1000000 + (s[1] || 0) * 1000 + (s[2] || 0);
  };
  const editionNum = e => e === 'main' ? 9999 : (/^E(\d+)$/.exec(e) ? parseInt(/^E(\d+)$/.exec(e)[1], 10) : 0);
  const sorted = [...allEntries].sort((a, b) => {
    const va = versionNum(a.Version), vb = versionNum(b.Version);
    if (va !== vb) return vb - va;
    const ia = docTypeOrder.indexOf(a.SubDir), ib = docTypeOrder.indexOf(b.SubDir);
    if (ia !== ib) return ia - ib;
    if (a.SubGroup !== b.SubGroup) return a.SubGroup.localeCompare(b.SubGroup, 'zh');
    return editionNum(b.Edition) - editionNum(a.Edition);
  });

  // 5. 渲染
  const lines = [`# ${funcName} - 文件索引`, ''];
  let prevVersion = '', prevSubDir = '', prevSubGroup = null;
  for (const entry of sorted) {
    if (entry.Version !== prevVersion) {
      if (prevVersion !== '') lines.push('');
      lines.push(`## ${entry.Version}`, ''); prevSubDir = ''; prevSubGroup = null;
      prevVersion = entry.Version;
    }
    if (entry.SubDir !== prevSubDir) {
      if (prevSubDir !== '') lines.push('');
      lines.push(`### ${entry.SubDir}/`, ''); prevSubGroup = null;
      prevSubDir = entry.SubDir;
    }
    if (entry.SubDir === 'report' || entry.SubDir === 'analysis' || entry.SubDir === 'prd') {
      // 换组判定：prevSubGroup 用 null 标记"未输出任何组"，保证空子分组（完整 PRD）首行也能输出表头
      if (entry.SubGroup !== prevSubGroup) {
        if (prevSubGroup !== '' && prevSubGroup !== null) lines.push('');
        // 子分组为空（完整 PRD 无分组）时不打印 `**${''}**` 空标题，仅输出表头
        if (entry.SubGroup !== '') lines.push(`**${entry.SubGroup}**`, '');
        lines.push('| E# | 最后更新 | 内容摘要（含变更说明） | 负责人 |', '|----|----------|------------------------|--------|');
        prevSubGroup = entry.SubGroup;
      }
    } else if (prevSubGroup === '' || prevSubGroup === null) {
      lines.push('| E# | 最后更新 | 内容摘要（含变更说明） | 负责人 |', '|----|----------|------------------------|--------|');
      prevSubGroup = 'hdr';
    }
    lines.push(`| ${entry.DisplayEdition} | ${entry.LastWrite} | ${entry.Summary} | ${entry.Author} |`);
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  fs.writeFileSync(indexFile, lines.join('\r\n'), { encoding: 'utf8' });

  return { filesNeedingAI };
}

module.exports = { rebuildIndex, parseExistingIndex: null, reportSubGroups, analysisSubGroups, docTypeOrder };
