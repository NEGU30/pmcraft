/**
 * port-finder.js — 端口检测 / 递增
 *
 * 供 deploy-prototype / deploy-survey 共用。
 * Windows 用 netstat -ano 解析 LISTENING 行取 PID；其他平台用 lsof。
 */
'use strict';
const { execSync } = require('child_process');

/** 查询指定端口是否被占；返回占用 PID 数组（空闲返回 []） */
function portOccupiers(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr "LISTENING" | findstr ":${port} "`, { encoding: 'utf8' });
      const pids = [];
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/:(\d+)\s+.*LISTENING\s+(\d+)/);
        if (m && parseInt(m[1], 10) === port) pids.push(parseInt(m[2], 10));
      }
      return pids;
    } else {
      const out = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`, { encoding: 'utf8' });
      return out.split(/\r?\n/).map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);
    }
  } catch (e) {
    return []; // 命令失败视为无占用（保守）
  }
}

/** 从基准端口起找空闲端口，最多试 count 个（默认 11 个：基准 ~ 基准+10） */
function findFreePort(basePort, count) {
  const maxTry = count || 11;
  for (let i = 0; i < maxTry; i++) {
    const p = basePort + i;
    if (portOccupiers(p).length === 0) return p;
  }
  return null; // 全部被占
}

module.exports = { portOccupiers, findFreePort };
