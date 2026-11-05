// spec-template.ts — setup-tests Phase 3.6 生成脚本的模板基准（固化自 SKILL.md Phase 3.5/3.6）
// 子 agent 生成 TCxx.spec.ts 时以此骨架为准，只填 TC 特有内容（步骤序列 / 操作名 / SEL key / 断言）。
//
// 硬性要求（生成时必须满足，Phase 3.7 门禁逐条检查）：
//  - import { test, expect } — expect 必须导入（陷阱: missing_expect_import，P0-8 相关）
//  - 选择器一律经 SEL.* + loc(page, SEL.X) 引用，禁止硬编码选择器字符串（P0-1 检查）
//  - 数据值一律经 s('operationName') 从 data/TCxx.json 引用，禁止硬编码（Phase 3.6 步骤 4）
//  - 禁止 networkidle — 一律 domcontentloaded + 元素 waitFor（陷阱: spa_networkidle_timeout，P0-2 门禁）
//  - 每个操作包裹 checkpoint()，spec 末尾 MUST 调用 finalizeCapture(data.tcId)（否则 checkpoint 日志为空）
//  - ⚡ click 与 loading 断言 MUST 放同一 checkpoint()（trap: loading_assert_split_checkpoint — checkpoint 的 before 截图间隙会错过 ~300ms loading 窗口）
//  - test.fail 仅当 PRD 行为线上实测确实未实现且留存证据截图（陷阱: test_fail_without_evidence，P0-3 门禁）
//  - 可验证预期结果必须有对应 expect() 断言（Phase 3.7.1 断言映射规则）

import { test, expect } from '@playwright/test';   // expect 必须导入（陷阱: missing_expect_import）
import { checkpoint, initCapture, finalizeCapture } from './assets/checkpoint/framework.js';
import { SEL, loc } from './assets/selector-lib.js';  // ⚡ 选择器库：所有选择器从 SEL 引用，通过 loc(page, SEL.X) 构建 Locator，禁止硬编码
import data from './data/TCxx.json' assert { type: 'json' };

test('TCxx: {描述}', async ({ page }) => {
  initCapture(page, data.tcId);
  const s = (op: string) => data.steps.find((e: any) => e.operation === op);
  // ⚡ s() 定义必须在 initCapture 后、任何 checkpoint 之前（trap: s_defined_after_goto —
  // 含 goto 前置操作如 setViewportSize 的 spec 会先于 s 定义使用 s() → ReferenceError）
  await page.goto(data.context.baseUrl);
  await page.waitForLoadState('domcontentloaded');  // ⚡ 禁止 networkidle（陷阱: spa_networkidle_timeout）

  // 每个步骤包裹在 checkpoint() 中；选择器一律用 SEL.* 引用
  await checkpoint(page, async () => {
    await loc(page, SEL.XXX).fill(s('fill_xxx').value);
    await page.keyboard.press('Enter');
  }, { tcId: data.tcId, operationIndex: 1, operationName: 'fill_xxx',
       selector: SEL.XXX, description: s('fill_xxx').description });

  // ... 更多步骤（点击 / 断言 / 截图；可验证预期 → expect()，见 Phase 3.7.1 断言映射表）
  // 示例断言：
  // await expect(loc(page, SEL.RESULT_TABLE).getByRole('row')).toHaveCount(3);

  finalizeCapture(data.tcId);   // spec 末尾 MUST 调用
});
