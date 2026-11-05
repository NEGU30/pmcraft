#!/usr/bin/env node
/**
 * stop-services.js — 关闭 pmcraft 本地服务（路由层「关闭服务」脚本化）
 *
 * 替代 CLAUDE.md 中 LLM 手动执行的 Bash 序列：
 *   读 .server.pid → 验证 PID 是数字 → 验证属于 node 进程 → taskkill → 删文件
 *
 * 扫描位置：
 *   - {version_dir}/prototype/{working,main,E*}/mock/.server.pid   （原型服务；working/ 可部署边改边预览，同样关闭）
 *   - {version_dir}/survey/web/mock/.server.pid             （问卷服务）
 *
 * 用法：
 *   node stop-services.js --version-dir=<版本目录> [--dry-run]
 *
 * 输出：{killed: [{source, pid, verified}], skipped: [{source, pid, reason}], cleaned_pid_files, no_services_found}
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ok, fail, usage } = require('../scripts/lib/json-output');
const { readUtf8 } = require('../scripts/lib/encoding');

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

/** 验证 PID 是否为数字 */
function isNumeric(pid) {
  return /^\d+$/.test(String(pid));
}

/** 验证 PID 属于 node 进程（跨平台） */
function isNodeProcess(pid) {
  try {
    if (process.platform === 'win32') {
      // 用 PowerShell Get-Process 避免 tasklist 的 GBK 乱码（Git Bash 下 tasklist 输出中文乱码导致匹配失败）
      const out = execSync(
        `powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      return /node/i.test(out.trim());
    } else {
      const out = execSync(`ps -o comm= -p ${pid}`, { encoding: 'utf8', stdio: 'pipe' });
      return /node/i.test(out.trim());
    }
  } catch (e) {
    return false;
  }
}

/** 终止进程（跨平台） */
function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
    }
    return true;
  } catch (e) {
    return false;
  }
}

/** 扫描版本目录下所有 .server.pid 文件 */
function findPidFiles(versionDir) {
  const found = [];
  // 原型服务：prototype/{working,main,E*}/mock/.server.pid（working/ 可被部署（边改边预览），其服务同样需要关闭；reference/ 无服务）
  const protoDir = path.join(versionDir, 'prototype');
  if (fs.existsSync(protoDir)) {
    for (const name of fs.readdirSync(protoDir, { withFileTypes: true })) {
      if (!name.isDirectory() || name.name === 'reference') continue;
      const pidFile = path.join(protoDir, name.name, 'mock', '.server.pid');
      if (fs.existsSync(pidFile)) found.push({ source: `prototype/${name.name}/mock/.server.pid`, file: pidFile });
    }
  }
  // 问卷服务：survey/web/mock/.server.pid
  const surveyPid = path.join(versionDir, 'survey', 'web', 'mock', '.server.pid');
  if (fs.existsSync(surveyPid)) found.push({ source: 'survey/web/mock/.server.pid', file: surveyPid });
  return found;
}

function main() {
  const args = parseArgs(process.argv);
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;

  if (!args['version-dir']) usage('缺少 --version-dir（版本目录路径）');
  const versionDir = path.resolve(args['version-dir']);
  if (!fs.existsSync(versionDir)) fail('版本目录不存在', versionDir);

  const pidFiles = findPidFiles(versionDir);
  const killed = [];
  const skipped = [];
  let cleanedPidFiles = 0;

  for (const { source, file } of pidFiles) {
    const rawPid = (readUtf8(file) || '').trim();
    if (!isNumeric(rawPid)) {
      // 非数字 → 删除无效 PID 文件
      if (!dryRun) { try { fs.unlinkSync(file); } catch (e) {} }
      cleanedPidFiles++;
      skipped.push({ source, pid: rawPid, reason: 'invalid_pid_cleaned' });
      continue;
    }
    const pid = parseInt(rawPid, 10);
    if (!isNodeProcess(pid)) {
      // 非 node 进程 → 拒绝终止，删除 PID 文件
      if (!dryRun) { try { fs.unlinkSync(file); } catch (e) {} }
      cleanedPidFiles++;
      skipped.push({ source, pid, reason: 'not_node_process' });
      continue;
    }
    // 验证通过 → 终止 + 删文件
    if (!dryRun) {
      const killedOk = killPid(pid);
      try { fs.unlinkSync(file); } catch (e) {}
      if (killedOk) killed.push({ source, pid, verified: true });
      else skipped.push({ source, pid, reason: 'kill_failed' });
    } else {
      killed.push({ source, pid, verified: true });
    }
  }

  ok({
    killed,
    skipped,
    cleaned_pid_files: cleanedPidFiles,
    no_services_found: pidFiles.length === 0,
    dry_run: dryRun || undefined
  });
}

main();
