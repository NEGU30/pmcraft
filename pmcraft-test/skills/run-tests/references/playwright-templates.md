# Playwright 执行模板（Phase 5 使用）

> **FALLBACK REFERENCE**: 本文档为 AI 兜底构建参考（对应固化产物：`assets/scripts/smoke.cjs` 与 `assets/templates/playwright.config.ts`，SKILL.md 直接调用/复制）。
> 使用原则：**固化产物优先**，缺失时按本模板自行构建同构实现。与固化产物的差异点已逐节标注。

## 1. 冒烟验证脚本（Phase 5.0.5）

执行方式：`NODE_PATH="$APPDATA/npm/node_modules" node -e`，30 秒超时。

```js
const { chromium } = require('@playwright/test');
(async () => {
  const launchOpts = { headless: true };
  {browser_channel_smoke}
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    // ⚡ 无登录项目（static_html，无 auth/storage.json）→ 必须省略 storageState 注入，
    // 否则 Playwright newContext 抛 ENOENT（固化版 smoke.cjs 已做存在性检查，此处模板需同步）
    storageState: '../auth/storage.json', viewport: { width: 1280, height: 720 }
  });
  const page = await ctx.newPage();
  await page.goto('{baseUrl}', { waitUntil: 'domcontentloaded', timeout: 15000 });  // ⚡ 禁止 networkidle（陷阱: spa_networkidle_timeout）
  if (page.url().includes('login')) throw new Error('LOGIN_REQUIRED');
  await page.getByText('{页面标题关键词}').first().waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '{actionKeyword: 默认查询}' }).waitFor({ timeout: 5000 });
  await browser.close();
  console.log('SMOKE_PASSED');
})();
```

- 如果 `.browser-channel` = "chrome" → `{browser_channel_smoke}` 替换为 `launchOpts.channel = 'chrome';`
- 如果 `.browser-channel` = "default" 或不存在 → `{browser_channel_smoke}` 替换为空行（使用默认 Chromium）
- 主操作按钮文本默认 `查询`，可经 `--actionKeyword` 参数覆盖（固化版 smoke.cjs 已实现，此处模板同步）

## 2. playwright.config.ts 模板（Phase 5.1 模式 A 步骤 2）

Write 到 e2e 时间戳根目录：

```typescript
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './scripts',
  outputDir: './logs/playwright-output',  // ⚡ 必须独立于 checkpoint 截图目录 logs/results/（Playwright 每次运行开始清空 outputDir，指向截图目录会清掉前批截图，trap: playwright_outputdir_clears_screenshots）
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
    // ⚡ 无登录项目（static_html，无 auth/storage.json）→ 必须省略 storageState 注入（固化版已条件注入：存在才注入）
    storageState: '../auth/storage.json',  // 跨时间戳共享
    // ⚡ 证据存档生产源（Phase 5.2 每批归集到 logs/results/{tcId}/video.webm + trace.zip；缺失则报告"证据存档"区块无数据可渲染）
    video: 'on',
    trace: 'on',
    // 浏览器引擎 — 优先使用本地 Chrome，无需额外下载 Chromium
    {browser_channel_config}
  },
});
```

- 如果 `.browser-channel` = "chrome" → `{browser_channel_config}` 替换为 `channel: 'chrome',`
- 如果 `.browser-channel` = "default" 或文件不存在 → `{browser_channel_config}` 替换为空行（使用 Playwright 默认 Chromium）
- 固化版模板（`assets/templates/playwright.config.ts`）已改为运行时自读 `../.browser-channel`，无需占位符替换；storageState 仅当 `../auth/storage.json` 存在时注入
- **video/trace 已启用（`video: 'on'` + `trace: 'on'`）**：这是 run-tests Phase 5.2 录像/trace 证据与报告"证据存档"区块的数据来源。手工构建同构 config 时必须带上，否则 Phase 5.2 归集步骤与证据存档无数据可收集

## 3. run-all.cjs 关键参数（Phase 5.1 模式 B）

```js
const launchOpts = { headless: true };
{browser_channel_smoke}
chromium.launch(launchOpts)
browser.newContext({ /* ⚡ 无 auth/storage.json 的项目必须省略 storageState（同第 1/2 节口径）*/ storageState: '../auth/storage.json', viewport: { width: 1280, height: 720 } })
```

**约束**：headless: true（不弹窗），所有 TC 共用同一 page，失败 TC 仍走 Phase 5.3 修复流程。
