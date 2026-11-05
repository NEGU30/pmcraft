/**
 * deploy-common.js — 部署脚本共享逻辑（deploy-survey.js / deploy-prototype.js 共用）
 *
 * 单一事实源：两个插件各自的部署脚本不再各自维护 parseArgs/lanIPv4/readPid/
 * 启动服务/可达性轮询/管理员登录校验等逻辑，防止实现漂移
 * （历史上 deploy-survey 端口同步清单漏掉 admin.html 导致的管理页死链即此类漂移）。
 *
 * 约定：本模块函数均为纯逻辑、无副作用；路径传入原始 Windows 路径，
 * 正斜杠转换与 shell 转义在模块内部完成。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync, spawn } = require('child_process');

/** 解析 --key=value / --key value / --key 三类参数 */
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

/** IPv4 列表 */
function lanIPv4() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

/** 读取 dir/mock/.server.pid（存在则返回 trim 后的内容，否则 null） */
function readPid(dir) {
  const f = path.join(dir, 'mock', '.server.pid');
  if (!fs.existsSync(f)) return null;
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { return null; }
}

/** 从 pid 文件回读已校验的 PID（纯数字），无效则 null */
function pidFromFile(dir) {
  const p = readPid(dir);
  if (p && /^\d+$/.test(p)) return parseInt(p, 10);
  return null;
}

/**
 * 启动 node server.js（目录 dir、端口 port）。
 * - win32：PowerShell Start-Process（分离式、隐藏窗口），返回新进程 PID（解析失败返回 null）
 * - 其他：sh nohup 分离启动，返回 null（调用方自行从 pid 文件回读）
 *
 * 路径消毒（分平台）：
 * - PowerShell -Command 单引号字符串内仅 '' 是转义（$ ` " 均为字面量），只转义单引号；
 *   对 $ ` 再做反斜杠转义反而会破坏合法路径（如 C:\dev\my$proj → my\$proj）。
 * - POSIX sh 双引号字符串内 $ ` " 需反斜杠转义（\$ \` \" 为字面量）。
 */
function startServer(dir, port) {
  const fwd = dir.replace(/\\/g, '/');
  if (process.platform === 'win32') {
    const psDir = fwd.replace(/'/g, "''");
    const psCmd = `$env:PORT='${port}'; Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory '${psDir}' -WindowStyle Hidden -PassThru`;
    try {
      // spawnSync 免 cmd 外壳：命令作为独立 argv 传递，路径含 `"` 也不会逃出 cmd 双引号上下文注入
      const cp = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8' });
      const m = (cp.stdout || '').match(/Id\s+: (\d+)/);
      return m ? parseInt(m[1], 10) : null;
    } catch (e) { return null; }
  } else {
    const shDir = fwd.replace(/[$"`]/g, '\\$&');
    try {
      const child = spawn('sh', ['-c', `cd "${shDir}" && PORT=${port} nohup node server.js >/dev/null 2>&1 &`], { detached: true, stdio: 'ignore' });
      child.unref();
      return null;
    } catch (e) { return null; }
  }
}

/**
 * 轮询 http://localhost:{port}/ 直至可达或超时（deadlineMs 毫秒）。
 * 节流等待按平台分支：Windows 用 ping（timeout 在 stdin 重定向时报错）；POSIX 用 sleep——
 * `ping -n 1` 只在 Windows cmd 下是"1 次"语义，macOS/Linux 的 -n 是"数字输出"且无 -c 计数，
 * 会无限 ping → execSync 永久阻塞、deadline 保护失效（waitReachable 永不返回）。内部吞掉全部异常。
 */
function waitReachable(port, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  let reachable = false;
  while (Date.now() < deadline) {
    try {
      execSync(`node -e "require('http').get('http://localhost:${port}/',r=>process.exit(0)).on('error',()=>process.exit(1))"`, { stdio: 'pipe', timeout: 2500 });
      reachable = true;
      break;
    } catch (e) {
      if (process.platform === 'win32') {
        try { execSync('ping -n 1 127.0.0.1 >nul', { stdio: 'ignore' }); } catch (e2) {}
      } else {
        try { execSync('sleep 0.2', { stdio: 'ignore' }); } catch (e2) {}
      }
    }
  }
  return reachable;
}

/**
 * 管理员登录校验（用 Node http 避免 shell 引号/编码问题），返回是否 ok。
 * 仅 deploy-survey 使用；deploy-prototype（A/B 模式）无此端点，不调用。
 */
function checkAdminLogin(port, password) {
  return new Promise(resolve => {
    const http = require('http');
    const body = JSON.stringify({ password });
    const req = http.request({
      hostname: 'localhost', port, path: '/api/admin/login',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).ok === true); } catch (e) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

module.exports = { parseArgs, lanIPv4, readPid, pidFromFile, startServer, waitReachable, checkAdminLogin };
