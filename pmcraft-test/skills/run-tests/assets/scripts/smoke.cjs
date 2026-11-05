#!/usr/bin/env node
// smoke.cjs — 冒烟验证脚本（run-tests Phase 5.0.5）
// 验证登录态有效 + 页面可达 + 基本断言正确。
// 用法: node smoke.cjs --baseUrl <url> --titleKeyword <text> [--actionKeyword <text>] [--browserChannel chrome|default] [--storageState <path>]
// exit code: 0 = SMOKE_PASSED | 2 = LOGIN_REQUIRED | 3 = TIMEOUT/INVALID/ERROR
// 注意: 禁止 networkidle（SPA 永不满足，trap: spa_networkidle_timeout）
const { chromium } = require('@playwright/test');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--baseUrl') args.baseUrl = argv[++i];
    else if (argv[i] === '--titleKeyword') args.titleKeyword = argv[++i];
    else if (argv[i] === '--actionKeyword') args.actionKeyword = argv[++i];
    else if (argv[i] === '--browserChannel') args.browserChannel = argv[++i];
    else if (argv[i] === '--storageState') args.storageState = argv[++i];
  }
  return args;
}

// URL 校验（node 层，不走 shell — 无注入面；validate-url 功能合并于此）
// 允许 http(s)://（远程/本地服务器）与 file://（static_html 场景）
function validateUrl(url) {
  if (typeof url !== 'string') throw new Error('URL must be a string');
  if (/[\n\r]/.test(url)) throw new Error('URL contains forbidden shell metacharacters');
  // ⚠️ 字符集显式排除单引号 '（与 login-storage-snippets.md validateUrlForShell 同口径，两端必须同步更新）
  if (/^https?:\/\//.test(url)) {
    if (!/^https?:\/\/[a-zA-Z0-9._~:/?#\[\]@!$&()*+,;=%-]+$/.test(url))
      throw new Error('URL contains invalid characters');
  } else if (/^file:\/\//.test(url)) {
    if (!/^file:\/\/[a-zA-Z0-9._~:/?#\[\]@!$&()*+,;=%-\\ ]+$/.test(url))
      throw new Error('URL contains invalid characters');
  } else {
    throw new Error('URL must start with http://, https:// or file://');
  }
  return url;
}

(async () => {
  const { baseUrl, titleKeyword, actionKeyword = '查询', browserChannel = 'default', storageState = '../auth/storage.json' } = parseArgs(process.argv);
  if (!baseUrl || !titleKeyword) {
    console.error('Usage: node smoke.cjs --baseUrl <url> --titleKeyword <text> [--actionKeyword <text>] [--browserChannel chrome|default] [--storageState <path>]');
    process.exit(3);
  }
  try { validateUrl(baseUrl); } catch (e) { console.error('INVALID_URL: ' + e.message); process.exit(3); }

  const launchOpts = { headless: true };
  if (browserChannel === 'chrome') launchOpts.channel = 'chrome';
  let browser;
  try {
    browser = await chromium.launch(launchOpts);
    // storageState 文件不存在（无登录场景，如 static_html）→ 跳过注入
    const ctxOpts = { viewport: { width: 1280, height: 720 } };
    if (storageState && require('fs').existsSync(storageState)) ctxOpts.storageState = storageState;
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (page.url().toLowerCase().includes('login')) throw new Error('LOGIN_REQUIRED');
    await page.getByText(titleKeyword).first().waitFor({ timeout: 5000 });
    // 主操作按钮（默认"查询"，可用 --actionKeyword 覆盖；非所有被测系统都有"查询"按钮）
    await page.getByRole('button', { name: actionKeyword }).waitFor({ timeout: 5000 });
    await browser.close();
    console.log('SMOKE_PASSED');
    process.exit(0);
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    if (e.message === 'LOGIN_REQUIRED') { console.log('LOGIN_REQUIRED'); process.exit(2); }
    console.error('SMOKE_FAILED: ' + e.message);
    process.exit(3);
  }
})();
