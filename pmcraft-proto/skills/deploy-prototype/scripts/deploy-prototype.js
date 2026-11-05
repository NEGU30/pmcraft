#!/usr/bin/env node
/**
 * deploy-prototype.js — 原型局域网部署（替代原 SKILL.md 中 LLM 手动渲染模板/管理端口/启动服务的流程）
 *
 * 功能：Node 自检 → 部署源校验 → A/B 模式识别 → 端口检测/递增 → 模板渲染落盘
 *       → 启动服务（Windows 分离式）→ IP 地址计算 → 可达性校验
 *
 * 用法：
 *   node deploy-prototype.js --source=<部署源绝对路径> [--port=N] [--dry-run]
 *
 * 部署源选择（main/优先/E目录/working）由 LLM 在 SKILL.md 流程中完成，脚本只接收最终 source。
 *
 * 交互点（status:"interaction"）：
 *   - port_in_use    基准端口被本原型自身占用，问 PM 复用现链接还是停掉重启
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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
const { toForwardSlashes, ensureDir, readUtf8, writeUtf8 } = require(path.join(sharedLib, 'encoding'));
const { portOccupiers, findFreePort } = require(path.join(sharedLib, 'port-finder'));
// 与 pmcraft-req deploy-survey.js 共用的部署逻辑（参数解析/IP 地址/pid 文件/启动/可达性）
const { parseArgs, lanIPv4, readPid, pidFromFile, startServer, waitReachable } = require(path.join(sharedLib, 'deploy-common'));
const { render } = require(path.join(sharedLib, 'tmpl'));

const A_MODE_BASE_PORT = 5178;

/** Node 自检 */
function checkNode() {
  try {
    const v = execSync('node --version', { encoding: 'utf8' });
    return v.trim();
  } catch (e) {
    nodeMissing();
  }
}

/** 读取 B 模式 server.js 的基准端口（PORT = process.env.PORT || NNNN） */
function readServerPort(sourceDir) {
  const serverJs = readUtf8(path.join(sourceDir, 'server.js')) || '';
  const m = serverJs.match(/PORT\s*=\s*process\.env\.PORT\s*\|\|\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

let sourceDirVar = null;

function main() {
  const args = parseArgs(process.argv);
  const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
  const answer = args.answer || '';

  // ---- Node 自检 ----
  const nodeVersion = checkNode();
  if (!nodeVersion) return;

  // ---- 部署源 ----
  if (!args.source) usage('缺少 --source（部署源目录）');
  sourceDirVar = path.resolve(args.source);
  if (!fs.existsSync(sourceDirVar)) fail('部署源目录不存在', sourceDirVar);

  const hasIndex = fs.existsSync(path.join(sourceDirVar, 'index.html'));
  const hasPages = fs.existsSync(path.join(sourceDirVar, 'pages'));
  const hasServer = fs.existsSync(path.join(sourceDirVar, 'server.js'));
  if (!hasIndex && !hasPages && !hasServer) {
    fail('部署源没有原型产物', '源目录下无 index.html / pages/ / server.js', '请先生成原型再部署');
  }

  // ---- 模式识别 + 基准端口 ----
  const mode = hasServer ? 'B' : 'A';
  let basePort = mode === 'A' ? A_MODE_BASE_PORT : (readServerPort(sourceDirVar) || A_MODE_BASE_PORT);

  // ---- 端口冲突检测 ----
  const occupiers = portOccupiers(basePort);
  let finalPort = basePort;
  let portBumped = false;
  let reuseExisting = false;

  if (occupiers.length > 0) {
    // 辨别占用者是否本原型自己（PID == mock/.server.pid；须为纯数字，与 stop-services.js/deploy-survey.js 校验一致）
    const selfPid = readPid(sourceDirVar);
    const isSelf = selfPid && /^\d+$/.test(selfPid) && occupiers.includes(parseInt(selfPid, 10));
    if (isSelf) {
      // 本原型已在跑：问 PM 复用还是重启
      const ips = lanIPv4();
      const url = ips.length ? `http://${ips[0]}:${basePort}/` : `http://localhost:${basePort}/`;
      if (answer === 'restart') {
        // 停掉重启
        try { execSync(`taskkill /F /PID ${selfPid}`, { stdio: 'ignore' }); } catch (e) {}
        try { fs.unlinkSync(path.join(sourceDirVar, 'mock', '.server.pid')); } catch (e) {}
        finalPort = basePort;
      } else if (answer === 'reuse') {
        reuseExisting = true;
      } else {
        interact('port_in_use', {
          occupied_port: basePort,
          occupied_by_self: true,
          existing_url: url,
          prompt: `这个原型已经在 ${basePort} 上跑着了：${url}。直接用这条链接分享，还是我帮你停掉重启一份？`,
          options: [
            { label: '直接用现链接', description: '不重启，直接用已有服务' },
            { label: '停掉重启', description: '停止现有服务后重新启动一份' }
          ]
        });
      }
    } else {
      // 别的程序占用：逐个 +1 找空闲（上限 +10）
      finalPort = findFreePort(basePort, 11);
      if (finalPort === null) {
        fail('端口全部被占', `从 ${basePort} 到 ${basePort + 10} 均被占用`, '请手动关闭占用程序或指定 --port');
      }
      portBumped = true;
    }
  }

  // ---- 用户显式指定端口 ----
  if (args.port && !reuseExisting) {
    const p = parseInt(args.port, 10);
    if (!isNaN(p)) finalPort = p;
  }

  if (reuseExisting) {
    // 不重新部署，只报链接
    const ips = lanIPv4();
    ok({
      mode, source: path.basename(sourceDirVar), source_path: toForwardSlashes(sourceDirVar),
      port: basePort, port_original: basePort, port_bumped: false, reused: true,
      lan_ips: ips, local_url: `http://localhost:${basePort}/`,
      admin_url: mode === 'B' ? `http://localhost:${basePort}/admin` : null,
      pid: parseInt(readPid(sourceDirVar) || '0', 10) || null,
      service_reachable: true, firewall_required: true
    });
  }

  if (dryRun) {
    ok({
      dry_run: true,
      mode, source: path.basename(sourceDirVar), source_path: toForwardSlashes(sourceDirVar),
      port: finalPort, port_original: basePort, port_bumped: portBumped,
      actions: [
        `模式识别：${mode}（基准端口 ${basePort}）`,
        `渲染模板到 ${sourceDirVar}/（server.js/start/close/防火墙/部署说明）`,
        `启动服务（PORT=${finalPort}）`,
        '计算 IP 地址 + 可达性校验'
      ]
    });
  }

  // ---- 模板渲染落盘 ----
  const templatesDir = path.join(__dirname, '..', 'templates');
  const deployedFiles = [];
  const writeRendered = (tpl, dest, vars) => {
    const src = readUtf8(path.join(templatesDir, tpl));
    const content = vars ? render(src, vars) : src.split('5178').join(String(finalPort));
    writeUtf8(path.join(sourceDirVar, dest), content);
    deployedFiles.push(dest);
  };

  if (mode === 'A') {
    // A 模式：生成通用静态服务器 + 启停脚本（全局替换 5178 → 最终端口）
    writeRendered('server.js-template', 'server.js');
  }
  // 两类都写：启停 + 防火墙 + 部署说明（B 模式若已存在则不覆盖 server.js，启停脚本按需补齐）
  if (mode === 'A' || !fs.existsSync(path.join(sourceDirVar, 'start.bat'))) {
    writeRendered('start.bat-template', 'start.bat');
  } else {
    deployedFiles.push('start.bat（已存在，跳过）');
  }
  if (mode === 'A' || !fs.existsSync(path.join(sourceDirVar, 'start.sh'))) {
    writeRendered('start.sh-template', 'start.sh');
  } else {
    deployedFiles.push('start.sh（已存在，跳过）');
  }
  if (mode === 'A' || !fs.existsSync(path.join(sourceDirVar, 'close.bat'))) {
    writeRendered('close.bat-template', 'close.bat');
  } else {
    deployedFiles.push('close.bat（已存在，跳过）');
  }
  if (mode === 'A' || !fs.existsSync(path.join(sourceDirVar, 'close.sh'))) {
    writeRendered('close.sh-template', 'close.sh');
  } else {
    deployedFiles.push('close.sh（已存在，跳过）');
  }
  writeRendered('allow-firewall.bat-template', 'allow-firewall.bat');
  writeRendered('remove-firewall.bat-template', 'remove-firewall.bat');

  // 部署说明.md：B 模式保留数据节，A 模式删去
  const deployMdTpl = readUtf8(path.join(templatesDir, '部署说明.md-template'));
  let deployMd = render(deployMdTpl, { 端口: String(finalPort), 功能名: path.basename(sourceDirVar) });
  // tmpl.render 的 {变量名} 正则（\{([^{}\n]+)\}）本就支持中文占位符键（{端口}/{功能名} 会被 render 替换）；
  // 下方显式替换为防御性兜底（幂等），保证即使模板含未转义变体也绝不残留占位符
  deployMd = deployMd.split('{功能名}').join(path.basename(sourceDirVar)).split('{端口}').join(String(finalPort));
  if (mode === 'A') {
    deployMd = deployMd.split('【B 模式附：数据在哪】（静态原型忽略此节）')[0]
      .replace(/【B 模式附：数据在哪】[\s\S]*?(?=\n-{3,})/g, '');
  }
  writeUtf8(path.join(sourceDirVar, '部署说明.md'), deployMd);
  deployedFiles.push('部署说明.md');

  // ---- 启动服务（win32: PowerShell 分离式；其他: sh nohup）----
  ensureDir(path.join(sourceDirVar, 'mock'));
  let pid = startServer(sourceDirVar, finalPort);

  // 等待服务就绪并回读 PID
  const reachable = waitReachable(finalPort, 3000);
  if (!pid) {
    pid = pidFromFile(sourceDirVar);
  }

  if (!reachable) {
    fail('服务启动失败或不可达', `http://localhost:${finalPort}/ 未响应`, '检查端口是否被占用、server.js 是否报错（在该目录运行 node server.js 查看）');
  }

  const ips = lanIPv4();
  ok({
    mode, source: path.basename(sourceDirVar), source_path: toForwardSlashes(sourceDirVar),
    port: finalPort, port_original: basePort, port_bumped: portBumped,
    lan_ips: ips,
    local_url: `http://localhost:${finalPort}/`,
    admin_url: mode === 'B' ? `http://localhost:${finalPort}/admin` : null,
    deployed_files: deployedFiles,
    pid,
    service_reachable: true,
    firewall_required: true
  });
}

main();
