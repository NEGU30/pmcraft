// playwright.config.ts — 静态模板（run-tests Phase 5.1 模式 A 从 run-tests/assets/templates/ 复制到 e2e 时间戳根）
// 运行时自读 ../.browser-channel（相对本文件位置 = e2e 时间戳根 → 上一级 e2e/.browser-channel）
// 内容对应 references/playwright-templates.md §2（原 {browser_channel_config} 占位符已由运行时读取取代）
import { defineConfig } from '@playwright/test';
import { readFileSync } from 'fs';

const channel = (() => {
  try { return readFileSync('../.browser-channel', 'utf-8').trim(); } catch { return ''; }
})();
// storageState 仅当 ../auth/storage.json 存在时注入（无登录项目如 static_html 无此文件）
const storageState = (() => {
  try { readFileSync('../auth/storage.json', 'utf-8'); return '../auth/storage.json'; } catch { return undefined; }
})();

export default defineConfig({
  testDir: './scripts',
  // ⚡ outputDir 必须独立于 checkpoint framework 截图目录（logs/results/）：
  // Playwright 每次运行开始时自动清空 outputDir，若指向 logs/results 会把
  // framework 写入的 before/after 截图全部删掉（trap: playwright_outputdir_clears_screenshots）
  outputDir: './logs/playwright-output',
  timeout: 120000,              // ⚡ 单测试超时 2 分钟（实战教训：60s 默认值导致分页/多次查询用例超时）
  expect: { timeout: 10000 },   // ⚡ 单断言超时 10 秒
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['./scripts/assets/checkpoint/reporter.ts', { outputDir: './logs/checkpoint' }],
  ],
  use: {
    ...(storageState ? { storageState } : {}),  // 登录态跨时间戳共享（存在才注入）
    ...(channel === 'chrome' ? { channel: 'chrome' } : {}),  // 浏览器引擎：.browser-channel 为 chrome 时用本地 Chrome
    // ⚡ 证据存档生产源：Phase 5.2 每批归集到 logs/results/{tcId}/video.webm + trace.zip
    //（Playwright 输出目录每次运行开始即清空，不归集则录像/trace 丢失，报告"证据存档"区块无数据）
    video: 'on',
    trace: 'on',
  },
});
