# 子 agent 生成规约（Phase 3.6 步骤 3 专用 — 权威单一来源）

> 本文件是子 agent 生成 `TCxx.spec.ts` / `data/TCxx.json` 时必须逐条遵守的规约。
> 内容摘取自 SKILL.md Phase 3.5 骨架与 Phase 3.6 生成规范（子集），随生成包（gen-bundle.md）下发。
> 子 agent 只读生成包 + 组内 TC 行数据（prompt 内嵌），不读 SKILL.md / 其他散件。

## 1. 骨架硬性要求（Phase 3.7 门禁逐条检查）

- **import 三件套**：`import { test, expect } from '@playwright/test';`（expect 必须导入，陷阱: missing_expect_import）+ `import { checkpoint, initCapture, finalizeCapture } from './assets/checkpoint/framework.js';` + `import { SEL, loc } from './assets/selector-lib.js';` + `import data from './data/TCxx.json' assert { type: 'json' };`
- `initCapture(page, data.tcId)` 必须在 `page.goto` 前调用
- 导航：`waitForLoadState('domcontentloaded')`（**禁止 networkidle**，陷阱: spa_networkidle_timeout）
- spec 末尾 **MUST** 调用 `finalizeCapture(data.tcId)`（否则 checkpoint 日志为空）
- `s()` 定义必须在 initCapture 后、任何 checkpoint 之前（trap: s_defined_after_goto — 含 goto 前置操作如 setViewportSize 的 spec 会先于 s 定义使用 s() → ReferenceError）

## 2. s() 引用纪律（数据与脚本分离）

- 所有数据值从 `data/TCxx.json` 引用：`const s = (op) => data.steps.find(e => e.operation === op);` → `s('fill_search').value`；**禁止在 .spec.ts 中硬编码数据值**（关键词、行号、字段值、rowDescription）
- 选择器一律 `SEL.*` + `loc(page, SEL.X)` 引用；**禁止硬编码** `getByText`/`getByRole`/`getByPlaceholder` 字符串、禁止现场自造选择器（selector-lib 缺失 → 报告父 agent 回 Phase 3.3 补充，不自造）

## 3. checkpoint 包裹规则

- 每个操作包裹在 `checkpoint(page, async () => {...}, { tcId, operationIndex, operationName, selector: SEL.X, description })` 中，**不跳过任何一步**
- ⚡ click 与 loading 断言 **MUST 放同一 checkpoint()**（trap: loading_assert_split_checkpoint — checkpoint 的 before 截图间隙会错过 ~300ms loading 窗口）
- 时序敏感断言用 expect 自动重试（如 `expect(...).toHaveClass(/is-loading/, { timeout })`），禁止固定 waitForTimeout 后断言

## 4. 断言纪律（MUST）

- 可验证预期结果必须有对应 `expect()` 断言（断言映射规则见 SKILL.md Phase 3.7.1；弱化/缺失 → 阻塞）
- ⚡ **禁止弱化断言**：禁止"结果可能为空或非空，不断言具体行数""不验证具体值"等弱化表述；凡有实测数据支撑的预期（数据存在、行数可推导）→ 必须断言（toHaveCount > 0 / 具体值）
- ⚡ **禁止反转断言方向**：PRD 预期 X，禁止改为断言 非X；预期与线上不符 → 记 `prd_vs_live_gaps` + 标记需 FAILED，不反转断言
- el-table 列头断言统一 `toContainText`（子串匹配）而非 `toHaveText`；`toContainText` 不能作用于多元素 locator（先 `toHaveCount(N)` 再逐 `nth(i)` 断言每项）

## 5. test.fail 证据要求（MUST）

- 仅当 PRD 定义的行为在当前线上环境**实测确实未实现**时才允许 `test.fail`
- 使用前必须已有 MCP 实测证据截图（`logs/page-map/{tc}_fail_evidence.png`）；**无实测证据 → 禁止 test.fail**，一律 `test()` + 注释标记"待确认"（陷阱: test_fail_without_evidence）

## 6. 产出成对纪律与自检

- 每条 TC 同时产出 `data/TCxx.json` + `TCxx.spec.ts`，**成对完成**（不允许积攒 JSON 后批量生成 TS）
- 只写本组文件（`scripts/TCxx.spec.ts` + `scripts/data/TCxx.json`），**禁止修改共享文件**（selector-lib.ts / sample-data.json / page-map.json / traps.json 等）
- 生成完本组全部文件后，**立即自检（MUST）**：`node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}" --files "{本组 spec 文件名逗号列表}"` → 输出 `PASS` = 通过；`BLOCKED` → **只修本组文件** → 重跑，至多 3 次（沿用既有上限）；产出汇报中**附 PASS 行**

## 7. 禁止事项

- **禁止触碰 MCP 浏览器**（浏览器只有主 agent 能碰，MCP 竞争防护）
- 禁止读 SKILL.md / spec-template.ts / selector-lib.ts / traps 散件（生成包已含全部所需：规约 → selector-lib → 模板 → 实测数据 → traps）
- 禁止 networkidle、禁止无证据 test.fail、禁止弱化/反转断言（见上）
