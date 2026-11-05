#!/usr/bin/env node
// jwt-ttl.cjs — 从 storage.json 解析 JWT cookie 的 exp（run-tests Phase 4.4 步骤 5）
// 用法: node jwt-ttl.cjs --storagePath <path> [--cookieName ims_token]
// 输出: {"exp":1234567890,"expiresAt":"ISO 8601"} 或 {"tokenExpiresAt":null}
// 说明: JWT 值经 Node fs 读取，不经 shell 字符串拼接（避免特殊字符干扰命令行）
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--storagePath') args.storagePath = argv[++i];
    else if (argv[i] === '--cookieName') args.cookieName = argv[++i];
  }
  return args;
}

const { storagePath, cookieName = 'ims_token' } = parseArgs(process.argv);
if (!storagePath) {
  console.error('Usage: node jwt-ttl.cjs --storagePath <path> [--cookieName ims_token]');
  process.exit(1);
}

try {
  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
  const jwtCookie = (storage.cookies || []).find(c => c.name === cookieName);
  if (!jwtCookie || !jwtCookie.value || jwtCookie.value.split('.').length < 2) {
    console.log(JSON.stringify({ tokenExpiresAt: null }));
    process.exit(0);
  }
  const payload = JSON.parse(Buffer.from(jwtCookie.value.split('.')[1], 'base64').toString());
  if (!payload.exp) { console.log(JSON.stringify({ tokenExpiresAt: null })); process.exit(0); }
  console.log(JSON.stringify({ exp: payload.exp, expiresAt: new Date(payload.exp * 1000).toISOString() }));
  process.exit(0);
} catch (e) {
  console.error('JWT_PARSE_ERROR: ' + e.message);
  process.exit(1);
}
