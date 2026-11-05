#!/usr/bin/env node
/**
 * deploy-survey.js — 问卷部署脚本（替代原 SKILL.md 中 LLM 手动模板复制/端口管理/启动的流程）
 *
 * 功能：模板复制 → index.html 标题替换 → survey.json/settings.json 写入 mock/ →
 *       survey.json 结构校验（.gen_survey.js）→ 端口检测/递增 → 服务启动 →
 *       IP 计算 → 可达性校验 → 管理员登录校验
 *
 * 保留 AI 的环节：survey.md→survey.json 解析、Playwright 前端测试、7c 修复循环。
 *
 * 用法：
 *   node deploy-survey.js --version-dir=<版本目录> --survey-json=<survey.json路径>
 *     --survey-title=<问卷标题> [--answers=<决策>] [--port=N] [--dry-run]
 *
 * 交互点（status:"interaction"）：
 *   - overwrite_existing  survey/web/ 已存在，询问是否覆盖
 *   - port_in_use         端口被本问卷自身占用
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
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
const { ok, fail, usage, interact, nodeMissing } = require(path.join(sharedLib, 'json-output'));
const { toForwardSlashes, ensureDir, copyDir, readUtf8, writeUtf8 } = require(path.join(sharedLib, 'encoding'));
const { portOccupiers, findFreePort } = require(path.join(sharedLib, 'port-finder'));
// 与 pmcraft-proto deploy-prototype.js 共用的部署逻辑（参数解析/IP 地址/pid 文件/启动/可达性/登录校验）
const { parseArgs, lanIPv4, readPid, pidFromFile, startServer, waitReachable, checkAdminLogin } = require(path.join(sharedLib, 'deploy-common'));

/** 转义 HTML 特殊字符（--survey-title 是用户输入，写入 <title> 前必须转义，防 markup/脚本注入） */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 读取 server.js 的默认端口 */
function readServerPort(webDir) {
  const serverJs = readUtf8(path.join(webDir, 'server.js')) || '';
  const m = serverJs.match(/PORT\s*=\s*process\.env\.PORT\s*\|\|\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 5178;
}

/** 运行时定位 pmcraft-proto 的 close.bat 模板（与 pmcraft-proto deploy-prototype 共用单一事实源）：
 * 从本脚本位置逐级向上找 pmcraft-proto 插件目录（源环境=marketplace 根，cache 环境=插件缓存根 pmcraft/），
 * 再定位其 deploy-prototype 技能模板；插件版本目录（cache 环境的 {版本}/ 层级）自动探测。 */
function resolveProtoCloseBat() {
  let dir = __dirname;
  for (;;) {
    const protoDir = path.join(dir, 'pmcraft-proto');
    if (fs.existsSync(protoDir) && fs.statSync(protoDir).isDirectory()) {
      const skillsCandidates = [];
      const direct = path.join(protoDir, 'skills');
      if (fs.existsSync(direct)) skillsCandidates.push(direct);
      for (const e of fs.readdirSync(protoDir)) {
        if (/^\d+\.\d+\.\d+$/.test(e)) skillsCandidates.push(path.join(protoDir, e, 'skills'));
      }
      for (const sc of skillsCandidates) {
        const f = path.join(sc, 'deploy-prototype', 'templates', 'close.bat-template');
        if (fs.existsSync(f)) return f;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
  const answers = (args.answers || '').split(',').map(s => s.trim()).filter(Boolean);

  // ---- Node 自检 ----
  try { execSync('node --version', { stdio: 'pipe' }); } catch (e) { nodeMissing(); }

  // ---- 必选参数 ----
  if (!args['version-dir']) usage('缺少 --version-dir（版本目录路径）');
  if (!args['survey-json']) usage('缺少 --survey-json（survey.json 路径）');
  if (!args['survey-title']) usage('缺少 --survey-title（问卷标题）');
  const versionDir = path.resolve(args['version-dir']);
  const surveyJsonPath = path.resolve(args['survey-json']);
  if (!fs.existsSync(versionDir)) fail('版本目录不存在', versionDir);
  if (!fs.existsSync(surveyJsonPath)) fail('survey.json 不存在', surveyJsonPath);

  const webDir = path.join(versionDir, 'survey', 'web');
  const mockDir = path.join(webDir, 'mock');
  const templatesDir = path.join(__dirname, '..', 'templates');

  // ---- 目标目录检查 ----
  if (fs.existsSync(webDir) && !answers.includes('overwrite') && !dryRun) {
    interact('overwrite_existing', {
      target: toForwardSlashes(webDir),
      prompt: 'survey/web/ 下已有旧版网页问卷。是否覆盖？（旧版的答卷数据在 mock/ 中，覆盖不会删除数据）',
      options: [
        { label: '覆盖', description: '重新复制模板（mock/ 数据保留）' },
        { label: '取消', description: '退出部署' }
      ]
    });
  }

  // ---- 模板文件检查 ----
  const tplFiles = ['index.html', 'admin.html', 'server.js', 'design-system.css'];
  for (const f of tplFiles) {
    if (!fs.existsSync(path.join(templatesDir, f))) {
      fail('模板文件缺失', `${f} 不存在于 templates/`, '请确认技能完整安装。若问题持续，重新安装 deploy-survey 技能。');
    }
  }
  const scriptsDir = path.join(templatesDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) fail('模板 scripts/ 目录缺失', scriptsDir);

  if (dryRun) {
    ok({
      dry_run: true,
      actions: [
        `复制模板到 ${toForwardSlashes(webDir)}/`,
        `写入 mock/survey.json（来自 ${toForwardSlashes(surveyJsonPath)}）`,
        '生成 mock/settings.json（6位随机密码）',
        '校验 survey.json 结构（.gen_survey.js）',
        '端口检测 + 启动服务',
        '可达性校验 + 管理员登录校验'
      ]
    });
  }

  // ---- 复制模板 ----
  ensureDir(webDir);
  ensureDir(mockDir);
  for (const f of tplFiles) {
    fs.copyFileSync(path.join(templatesDir, f), path.join(webDir, f));
  }
  // scripts/* 复制到 webDir 根
  for (const f of fs.readdirSync(scriptsDir)) {
    if (f === 'close.bat') continue; // 共享资产：与 pmcraft-proto deploy-prototype 共用同一模板（单一事实源，避免双份漂移）
    fs.copyFileSync(path.join(scriptsDir, f), path.join(webDir, f));
  }
  const protoCloseBat = resolveProtoCloseBat();
  if (protoCloseBat) {
    fs.copyFileSync(protoCloseBat, path.join(webDir, 'close.bat'));
  } else {
    fail('close.bat 模板缺失', 'pmcraft-proto/skills/deploy-prototype/templates/close.bat-template', 'pmcraft-proto 插件未完整安装，请重新运行 setup.cmd 后重试');
  }

  // ---- 写入 survey.json ----
  const surveyJson = readUtf8(surveyJsonPath);
  // 结构校验（.gen_survey.js）
  const genSurveyJs = path.join(templatesDir, '.gen_survey.js');
  if (fs.existsSync(genSurveyJs)) {
    try {
      // 用 spawnSync 免 shell 执行：路径直接作为 argv 传递，杜绝 cmd/PowerShell 注入（旧实现
      // execSync 走 cmd.exe，路径含 `"` 可逃出双引号上下文，`&` 可注入任意命令）
      const cp = spawnSync('node', [toForwardSlashes(genSurveyJs), toForwardSlashes(surveyJsonPath)], { encoding: 'utf8', stdio: 'pipe' });
      const out = (cp.stdout || '') + (cp.stderr || '');
      if (cp.status !== 0) throw Object.assign(new Error('exit ' + cp.status), { stdout: out });
      // 非零退出会被 catch；输出含错误信息时也失败
      if (/error|失败|invalid/i.test(out) && out.trim() !== '') {
        fail('survey.json 结构校验失败', out.trim(), '请按校验信息修正 survey.json 后重试');
      }
    } catch (e) {
      fail('survey.json 结构校验失败', (e.stdout || e.message || '').toString().trim(), '请按校验信息修正 survey.json 后重试');
    }
  }
  writeUtf8(path.join(mockDir, 'survey.json'), surveyJson);

  // ---- 生成 settings.json（adminPassword 6位随机数字） ----
  let adminPassword;
  const settingsPath = path.join(mockDir, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    // 保留已有密码（覆盖部署不应重置）
    try {
      const old = JSON.parse(readUtf8(settingsPath));
      adminPassword = old.adminPassword;
    } catch (e) {}
  }
  if (!adminPassword) {
    adminPassword = String(Math.floor(100000 + Math.random() * 900000));
  }
  const settings = {
    adminPassword,
    allowMulti: false
  };
  writeUtf8(settingsPath, JSON.stringify(settings, null, 2));

  // ---- 端口检测 ----
  const basePort = readServerPort(webDir);
  let finalPort = basePort;
  let portBumped = false;

  // 本问卷已在跑？
  const selfPid = readPid(webDir);
  const occupiers = portOccupiers(basePort);
  const isSelfRunning = selfPid && /^\d+$/.test(selfPid) && occupiers.includes(parseInt(selfPid, 10));

  if (isSelfRunning) {
    if (answers.includes('restart')) {
      try { execSync(`taskkill /F /PID ${selfPid}`, { stdio: 'ignore' }); } catch (e) {}
      try { fs.unlinkSync(path.join(mockDir, '.server.pid')); } catch (e) {}
    } else if (!answers.includes('reuse')) {
      const ips = lanIPv4();
      const url = ips.length ? `http://${ips[0]}:${basePort}/` : `http://localhost:${basePort}/`;
      interact('port_in_use', {
        occupied_port: basePort,
        existing_url: url,
        prompt: `这个问卷已经在 ${basePort} 上跑着了：${url}。直接用这条链接，还是停掉重启？`,
        options: [
          { label: '直接用现链接', description: '不重启，直接用已有服务' },
          { label: '停掉重启', description: '停止现有服务后重新启动' }
        ]
      });
    }
  } else if (occupiers.length > 0) {
    finalPort = findFreePort(basePort, 11);
    if (finalPort === null) {
      fail('端口全部被占', `从 ${basePort} 到 ${basePort + 10} 均被占用`, '请关闭部分服务后重试，或手动指定 --port');
    }
    portBumped = true;
  }

  // 用户指定端口
  if (args.port) {
    const p = parseInt(args.port, 10);
    if (!isNaN(p)) finalPort = p;
  }

  // ---- 端口同步：复制来的脚本/模板硬编码 5178，端口递增或指定后必须替换为实际端口 ----
  // 否则 start.bat 手动重启会起在 5178（可能被占或与交付链接不符），allow-firewall.bat/remove-firewall.bat 会放行错误端口导致局域网访问失败，
  // admin.html/index.html 中硬编码的 localhost:5178 指引链接也会变成死链（管理页"把 http://localhost:5178/ 发给填写者"文案）
  // 位置在 reuse 分支之前：reuse 模式只可能命中 basePort==finalPort（端口被占时 readServerPort 读的是刚复制的模板 5178，
  // 与运行中的服务端口不符会走占用分支），此处同步为无操作（5178→5178），而标题写入必须保证在任何复用/退出路径前完成。
  for (const f of ['server.js', 'start.bat', 'allow-firewall.bat', 'remove-firewall.bat', 'admin.html', 'index.html']) {
    const fp = path.join(webDir, f);
    if (!fs.existsSync(fp)) continue;
    const content = readUtf8(fp);
    if (content.includes('5178')) writeUtf8(fp, content.split('5178').join(String(finalPort)));
  }

  // ---- 修改 index.html 的 <title> ----
  // 必须在端口同步之后执行：用户提供的问卷标题可能含字面 "5178"（如 "5178 便民服务调查"），
  // 若先写标题再同步端口，端口递增/指定后标题中的 "5178" 会被误替换为实际端口（静默损坏用户内容）。
  const indexHtmlPath = path.join(webDir, 'index.html');
  let indexHtml = readUtf8(indexHtmlPath);
  indexHtml = indexHtml.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(args['survey-title'])}</title>`);
  writeUtf8(indexHtmlPath, indexHtml);

  // 复用现链接：不重新部署、不启动新服务（同一端口再启动会 EADDRINUSE 立即退出，
  // 且报告死进程 PID）。直接报告现有服务信息——与 deploy-prototype.js 的 reuse 分支行为一致。
  if (isSelfRunning && answers.includes('reuse')) {
    const ips = lanIPv4();
    ok({
      title: args['survey-title'],
      survey_web: toForwardSlashes(webDir),
      port: basePort, port_original: basePort, port_bumped: false,
      admin_password: adminPassword,
      lan_ips: ips,
      fill_url: `http://${ips.length ? ips[0] : 'localhost'}:${basePort}/`,
      admin_url: `http://localhost:${basePort}/admin`,
      pid: parseInt(selfPid, 10),
      service_reachable: true,
      reused: true,
      admin_login_ok: await checkAdminLogin(basePort, adminPassword),
      data_file: toForwardSlashes(path.join(mockDir, 'responses.jsonl'))
    });
  }

  // ---- 启动服务（win32: PowerShell 分离式；其他: sh nohup）----
  let pid = startServer(webDir, finalPort);

  // ---- 等待可达 + 校验 ----
  const reachable = waitReachable(finalPort, 5000);
  if (!reachable) {
    fail('服务启动失败或不可达', `http://localhost:${finalPort}/ 未响应`, '检查端口是否被占用、server.js 是否报错');
  }
  if (!pid) {
    pid = pidFromFile(webDir);
  }

  // ---- 管理员登录校验（用 Node http 避免 shell 引号/编码问题） ----
  const loginOk = await checkAdminLogin(finalPort, adminPassword);

  const ips = lanIPv4();
  ok({
    title: args['survey-title'],
    survey_web: toForwardSlashes(webDir),
    port: finalPort,
    port_original: basePort,
    port_bumped: portBumped,
    admin_password: adminPassword,
    lan_ips: ips,
    fill_url: `http://${ips.length ? ips[0] : 'localhost'}:${finalPort}/`,
    admin_url: `http://localhost:${finalPort}/admin`,
    pid,
    service_reachable: true,
    admin_login_ok: loginOk,
    data_file: toForwardSlashes(path.join(mockDir, 'responses.jsonl'))
  });
}

main();
