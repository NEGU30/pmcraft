---
name: generate-report
description: >
  当 run-tests 执行完成，需要汇总测试结果、对失败用例进行缺陷分类、生成自包含 HTML 报告时使用。
  可从已有 checkpoint 日志和 run_state 重新生成报告。
  由 pmcraft 路由大脑自动串联调用，也可单独使用。
type: skill
argument-hint: 无参数
tags:
  - 测试报告
  - HTML 报告
  - test
  - report
  - defect-classification
allowed-tools: [Read, Write, Edit, Bash, Glob, AskUserQuestion, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_run_code_unsafe]
dependencies:
  - Node.js（LTS，assets/scripts/report-gen.cjs 运行所需；缺失时报告生成失败，提示检查 Node.js 环境）
  - Playwright CLI + Playwright MCP（Phase 6.6 报告后修复循环的 MCP 实测诊断与测试重跑所需；常规报告生成不依赖，缺失时降级为仅基于日志诊断）
prompt: 查看报告|测试报告|生成报告|generate-report
---

# generate-report — 测试后报告

## 路径约定

- **版本目录**：pmcraft 自动从 cwd 向上查找 `[Vv]?\d+\.\d+\.\d+` 版本目录
- **测试域根**：`{版本目录}/e2e/`（与 `brief/`、`prd/`、`testcase/` 并列）
- **本技能源码目录**：当前 SKILL.md 所在目录（`.../pmcraft-test/skills/generate-report/`）

## 概述

读取 run-tests 产出的检查点日志和证据文件，汇总结果，用 AI 做缺陷分类（含规则降级兜底），
渲染自包含单文件 HTML 报告。

按 Phase 6.1 → 6.6 顺序执行，禁止跳步；每阶段完成其产出后再进入下一阶段。产出统一写入 e2e 时间戳目录的 `report/` 目录。

## 输入

| 参数 | 来源 |
|------|------|
| e2e 目录 | 时间戳目录（自动发现，有 run_state.json 优先） |
| checkpoint 日志 | `logs/checkpoint/TCxx_checkpoint_log.json`（操作级结果 + 控制台/网络） |
| 运行状态 | `run_state.json`（TC 级状态摘要） |
| 人工结果 | `manual-results.json`（collect-manual 产出，可选） |
| 自愈记录 | `traps.json` |
| HTML 样式 | `assets/template.html`（**样式单一事实来源**，report-gen.cjs 提取其样式块；文件内无模板体，渲染逻辑全在 report-gen.cjs） |
| 项目配置 | `../config.json`（e2e 根，报告 metadata） |

## Phase 6：生成报告

### 6.1 确定 e2e 目录

1. 如果由 run-tests 串联调用（运行上下文含时间戳目录）→ 直接使用该时间戳目录读取数据。
2. 否则（单独调用）→ 询问 PM："请提供 e2e 目录路径："，直至获得有效目录（PM 输入 **退出** 或 **取消** 可随时终止流程，与 write-brief 等确认循环的退出约定一致）。
3. 读取 `$PRJ/$VER/e2e/config.json`：如果存在 → 将 projectPath / targetUrl / version / featureName 填入报告 metadata；否则 → 跳过 metadata 填充，对应字段留空。

### 6.2 汇总数据

读取以下文件（均相对于 e2e 时间戳目录）：

| 文件 | 内容 |
|------|------|
| `logs/checkpoint/TCxx_checkpoint_log.json` | 每个 TC 的完整操作级结果，含三个子部分：<br> - `operations`: 操作步骤与状态<br> - `consoleMessages`: 浏览器控制台消息（错误/警告/未捕获异常）<br> - `networkRequests`: 浏览器网络请求（含 4xx/5xx） |
| `run_state.json` | TC 级状态摘要（含 `needs_manual_verification` 需人工复核 TC 列表 + `manual_verification_reason` 复核原因） |
| `manual-results.json` | 人工补充的测试结果（MANUAL_PASSED / MANUAL_FAILED / SKIPPED，可选） |
| `traps.json` | 自愈记录 |

读取完成后，构建完整的结果数据集（JSON 结构，供模板填充）。
如果以上任一文件缺失 → 按「边缘情况处理」对应场景执行，不得静默跳过或臆造数据。

### 6.3 缺陷分类

**主路径（AI 推理）**：对每个失败 TC，按以下步骤分析后分类：
1. 读取该 TC 的 checkpoint 日志（operations / consoleMessages / networkRequests）与截图。
2. 排查环境因素：操作失败前是否存在 4xx/5xx 请求或 console.error → 存在则标记为环境问题候选。
3. 比对时间线：断言失败与 console/network 错误是否时间线对齐 → 对齐则判定为功能缺陷（支持性证据）。
4. 对照其他 TC 同一操作的耗时基线，综合上下文归类（分类含义见下表）。

| 类型 | 标签 | 含义 |
|------|------|------|
| 功能缺陷 | `badge-func` | 功能不工作，返回错误，行为不符合预期 |
| 体验问题 | `badge-ux` | 功能可用但交互体验差（布局、响应速度、loading 缺失） |
| 文案问题 | `badge-copy` | 文本不对、未翻译、拼写错误 |
| 建议项 | `badge-sug` | 小改进建议，非阻断性 |

5. 将分类结果写入 `report/defects.json`（供 report-gen.cjs 渲染缺陷表）：`[{ "tcId": "TC02", "type": "功能缺陷", "description": "..." }]`，`type` 取 功能缺陷 / 体验问题 / 文案问题 / 建议项 之一。

**MANUAL_FAILED TC**：report-gen.cjs 会自动从 manual-results.json 合并其 `defectType` / `defectDescription`（人工验证时已采集，见 collect-manual Phase 8.3），来源标记 `source: 'manual'`——**禁止 AI 再写入 defects.json**（工厂陷阱 execution_manual_defect_duplicate：manual 缺陷只写 manual-results.json，defects.json 仅保留 source:auto 条目，双写会被自动合并逻辑重复计数）。若 defectType 为空（不应发生——collect-manual 约束 5 强制 MANUAL_FAILED 必有分类），AI 按 `note` 字段推断后回写 manual-results.json 对应条目的 defectType，而非写入 defects.json。

**降级路径（规则兜底）**：如果 AI 不可用，按以下规则**自上而下逐条匹配，命中即停**：

| 优先级 | 错误类型 | 分类 |
|:------:|---------|------|
| 1 | 4xx/5xx 网络请求出现在操作失败前 | 环境问题（后端异常，不纳入缺陷） |
| 2 | console.error 出现在操作失败前 | 环境问题（前端 JS 运行时错误，不纳入缺陷） |
| 3 | TimeoutError | 环境问题（不纳入缺陷） |
| 4 | LocatorError / 元素未找到 | 页面变更（不纳入缺陷，C 端未变） |
| 5 | console/network error 与断言失败时间线对齐 | 功能缺陷（支持性证据） |
| 6 | AssertionError | 功能缺陷 |
| 7 | 其他未匹配错误类型 | 未分类（标记为 `needs_review`，需人工判定） |

### 6.4 生成报告文件

**渲染（脚本固化）**：AI 只做语义活（缺陷分类，6.3），渲染全部交给脚本：

```bash
node "{本技能源码目录}/assets/scripts/report-gen.cjs" --e2eDir "{e2e_dir}" --defects "{e2e_dir}/report/defects.json"
```

> **路径卫生（Bash 注入防护）**：`{e2e_dir}` 来自项目路径（用户输入或磁盘发现），构造 Bash 命令前须剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 确认实际路径）；参数值一律用双引号包裹后传入（路径含空格时不加引号会被拆成多个 token）。

`report-gen.cjs` 职责（零依赖，渲染逻辑内建于脚本，样式从 `assets/template.html` 的样式块提取为单一事实来源；template.html 只含样式，无模板体）：
1. 读取所有 `logs/checkpoint/TCxx_checkpoint_log.json` + `run_state.json` + `traps.json` + `../config.json`
2. 汇总统计卡片（兼容两代 checkpoint 结构：新 `{checkpointId,operationIndex,...}` / 老 `{label,status,duration}`；NEEDS_MANUAL 单列"需人工复核"卡片，不计入通过/失败/跳过）
3. 渲染自包含 HTML（四组摘要看板、问题清单、建议项、TC 详情含前后对比图、控制台日志、网络请求、人工验证结果、证据存档（录像/trace 存在时，扫描 `logs/results/{tcId}/video.webm` / `trace.zip` 自动渲染）；自愈日志已移除，见下方说明）
4. 截图路径转换：checkpoint_log.json 中截图路径为相对 `logs/checkpoint/` 的相对路径；report-gen 通过 `toReportRel()` 再转相对 `report/`，即 `../logs/checkpoint/{relPath}`
5. 写入 `{e2e_dir}/report/final-report.html` + `{e2e_dir}/report/final-report.json`

**兜底方式**：如果脚本缺失或 Node.js 不可用，AI 依据 `assets/template.html` 样式用字符串拼接生成同构 HTML（遵守下方关键要求）。

**关键要求**：
- 截图以相对路径嵌入（确保报告可跨机器打开）
- 输出：`{e2e_dir}/report/final-report.html` + `{e2e_dir}/report/final-report.json`
- 报告 = 自包含单文件，可直接发给 PM

### 6.5 展示摘要

报告生成后，按「完成输出」节模板展示摘要，填齐所有 {占位符}；数字必须与 `final-report.json` 的 summary 字段一致。

### 6.6 报告后修复循环（P4）

报告生成后发现断言弱化/数据失效/脚本缺陷（PM 或 AI 复核发现），进入修复循环。**禁止仅改脚本后直接宣布"已修复"**——必须走完整闭环：

```
发现缺陷 → 诊断（读 checkpoint 日志 + MCP 实测确认）
→ 修复（改 scripts/data/TCxx.json 或 TCxx.spec.ts，记录 repair_history）
→ 清理旧日志：rm -f logs/checkpoint/TCxx_checkpoint_log.json logs/checkpoint/TCxx_ops.jsonl（P2 防残留假通过）
→ 重跑：NODE_PATH=... npx playwright test scripts/TCxx.spec.ts --config=playwright.config.ts
→ 校验日志与命令行结果一致（P2）
→ 更新 run_state.json：results[TCxx] + prd_vs_live_gaps（如有新差异）+ repair_history
→ 重生成报告：node "{本技能源码目录}/assets/scripts/report-gen.cjs" --e2eDir . --defects report/defects.json（与 Phase 6.4 命令同构，脚本路径必须带本技能源码目录前缀）
→ 复核统计口径：passed/failed/skipped 与 run_state 一致
→ 沉淀 trap（如为通用经验）到 traps.json
```

**关键纪律（与 run-tests Phase 5.3 一致）**：
- **禁止用"共 0 条/空状态"式弱化断言绕过**——修复目标是验证 PRD 预期，不是让测试通过
- 数据无法命中 PRD 预期（如精确时刻查询受数据精度限制）→ 按可验证部分断言 + 记 `prd_vs_live_gaps`，需 PM 确认
- 修复后重跑仍失败 ≥3 次 → 标记 FAILED 并报告 PM，不无限循环

---

## 完成输出

报告生成后，展示以下格式的摘要：

```
✅ 测试报告已生成

📊 自动化测试：执行 {executed} → 通过 {passed} / 问题 {failed} → 通过率 {executedRate}%（已执行口径）
📊 人工测试：验证 {manualExecuted} → 通过 {manualPassed} / 问题 {manualFailed} → 通过率 {manualRate ?? '—'}
📊 跳过（未执行）：{skipped} 条（{skippedTcIds}）
📊 需人工复核：{needsManual} 条（{needsManualTcIds}，原因：{manualVerificationReason}）
📊 全量统计：{total} 条用例 → 通过 {passed+manualPassed} / 问题 {failed+manualFailed} / 跳过 {skipped} → 通过率 {passRate}%（分母不含需人工复核项）

🔴 问题清单 ({issue_count} 条 — 执行结果不符合用例预期)
  {TCxx}（{类型}）：{description}

🟢 建议项 ({sug_count} 条 — 不影响验收，非问题)
  {TCxx}：{description}

📁 报告：$PRJ/$VER/e2e/{ts}/report/final-report.html
📁 数据：$PRJ/$VER/e2e/{ts}/report/final-report.json

▶️ 可选：说「复盘」自动复盘，将本次通用经验沉淀到用户层 traps.json（%USERPROFILE%\.claude\user-data\pmcraft-test\traps.json，升级不丢失）。（**NEXT-TEST 模板**，话术库，见 CLAUDE.md「话术模板库」节）
```

**填充规则**：所有 {占位符} 取自 `final-report.json`（summary / defects / testCases 字段）；`{passed+manualPassed}` = 自动化通过 + 人工通过之和，`{passRate}` 分母 = total − needsManual；统计数字与 JSON 不一致时以 JSON 为准，不得臆造。

> 概念统一（PM 2026-08-01 确认）：看板"问题" = 执行结果不符合用例预期的 TC（即功能缺陷），与问题清单一一对应；"建议项"非问题（不影响验收），独立小节。如无问题项，对应区块输出 `✅ 无问题。`。如果无人工验证结果（manualExecuted = 0），人工测试行通过率显示 `—`。

---

## 报告输出格式模板

### HTML 报告 (final-report.html)

自包含单文件，由 `report-gen.cjs` 内建渲染逻辑生成（样式从 `assets/template.html` 样式块提取），包含以下区块：
1. **执行摘要** — 五组看板：自动化测试（执行/通过/问题/通过率-已执行口径）、人工测试（验证/通过/问题/通过率）、跳过（未执行，明细+原因）、需人工复核（NEEDS_MANUAL，0 条时不渲染）、全量统计（用例总数/通过/问题/跳过/通过率-分母不含需人工复核）+ 口径语义注释（"问题"= 执行结果不符合用例预期，见问题清单）
2. **问题清单** — 每条失败 TC 一行（类型标签/TC/来源/描述），从 FAILED TC 自动推导；建议项独立小节（非问题）
3. **TC 详情** — 可展开，每 TC 显示所有步骤的前后对比图 + 错误信息 + 人工验证结果块。NEEDS_MANUAL 状态的 TC 标注 `⚠️ 需人工复核（{manual_verification_reason}）`，manualResult 显示占位（待 collect-manual 补充）
4. **控制台日志** — 每 TC 可折叠面板，错误/警告高亮，按时间线排列
5. **网络请求** — 每 TC 可折叠面板，4xx/5xx 红色高亮
6. **证据存档** — 录像/trace 链接

> 自愈日志已从 HTML 报告移除（PM 2026-08-01 确认）：修复过程是内部实现细节，PM 关注结果；数据保留在 JSON 报告 `healingLog` 字段与 `run_state.repair_history`，供 review-tests 复盘消费。

### JSON 报告 (final-report.json)

```json
{
  "metadata": { "generatedAt": "...", "targetUrl": "...", "version": "..." },
  "summary": { "total": 12, "passed": 8, "failed": 1, "repaired": 1, "skipped": 2, "manualPassed": 4, "needsManual": 1, "needsManualTcIds": ["TC-B-10"], "manualVerificationReason": "datepicker 填值 headless 不可靠", "passRate": 92.3 },
  "defects": [{ "type": "功能缺陷", "tcId": "TC02", "description": "...", "source": "auto" }],
  "testCases": [{ "tcId": "TC01", "status": "PASSED", "operations": [...], "manualResult": null, "consoleMessages": {...}, "networkRequests": {...} }],
  "healingLog": [{ "tcId": "TC03", "attempt": 1, "strategy": "GET_BY_ROLE", "success": true }]
}
```

---

## 禁止行为

1. **禁止覆盖历史报告** — 每次报告写入时间戳目录，不覆盖上次结果
2. **禁止空白报告** — AI 不可用时按规则分类降级，缺陷分类必须有降级路径，报告不能空白
3. **禁止以日志缺失推断通过/失败** — `checkpoint_log.json` 缺失时标记 `⚠️ 日志缺失（可能使用非 Bash 捷径执行）`，不以此推断结论
4. **禁止非自包含报告** — 截图使用相对路径（与 HTML 同目录基准），报告须可直接打开
5. **禁止跳过 JSON 事实源** — JSON 报告是事实来源，HTML 是渲染视图，二者不得脱节

## 约束

1. **绝对路径转换失败时回退** — 如果无法确定相对路径关系，保留原始绝对路径并在报告中标注 `⚠️ 截图路径未转换`
2. **只读消费测试产物** — 常规路径不修改 run-tests 产出的 run_state.json 与 checkpoint 日志；本技能仅新增 report/ 目录产物（defects.json / final-report.html / final-report.json）。**Phase 6.6 报告后修复循环除外**——PM 确认的修复动作可更新 run_state.json（results / prd_vs_live_gaps / repair_history）、清理对应 TC 的旧 checkpoint 日志（rm -f logs/checkpoint/TCxx_checkpoint_log.json 与 TCxx_ops.jsonl，P2 防残留假通过）、并修改 scripts/data/TCxx.json 或 TCxx.spec.ts，属修复闭环既定行为（与 run-tests Phase 5.3 修复纪律同口径）
3. **不臆造统计数据** — 报告与摘要中的全部数字必须来自 JSON 事实源（final-report.json），字段缺失时显示占位而非编造
4. **主路径优先** — AI 可用时一律走 6.3 主路径（AI 推理），不得跳过上下文分析直接套用降级规则

---

## 边缘情况处理

### 场景 1：没有任何 checkpoint 日志文件

如果 `logs/checkpoint/` 目录下没有任何 `*_checkpoint_log.json` 文件：

> ⚠️ 在 `{e2e_dir}/logs/checkpoint/` 下未找到任何 checkpoint 日志文件。
> 可能原因：
> 1. 测试脚本未正确集成 checkpoint reporter
> 2. 测试使用了非 Bash 捷径执行（MCP 直接操作浏览器不产生日志）
> 3. 日志写入路径错误
>
> 请确认是否继续生成报告？如果继续，报告将仅包含 run_state.json 中的 TC 级摘要，不含操作级详情。

### 场景 2：run_state.json 不存在但 checkpoint 日志存在

如果 `run_state.json` 不存在但有 checkpoint 日志：

> ⚠️ run_state.json 未找到，将从 checkpoint 日志文件反向推导 TC 状态。
> 推导规则：所有操作通过 → PASSED / 任一操作失败 → FAILED。
> 此推导可能不准确（无法区分"跳过"和"未执行"），建议下次通过 run-tests 正常执行。

### 场景 3：截图文件路径无效

如果 checkpoint 日志中引用的截图文件（`beforeScreenshotPath` / `afterScreenshotPath`）在磁盘上不存在：

> ⚠️ TC-{id} 步骤 {n} 的截图文件不存在：`{path}`
> 报告中该步骤的截图对比将显示为占位图。是否继续？或手动提供截图路径？

### 场景 4：traps.json 为空或不存在

静默处理 — 自愈日志已从报告移除（数据在 run_state.repair_history 供 review-tests 消费），此场景仅影响 JSON 报告的 healingLog 字段（为空数组）。

### 场景 5：HTML 模板文件缺失

如果 `assets/template.html` 不可读：

> ⚠️ HTML 报告模板 `assets/template.html` 不可读。
> 将改用内置最小模板渲染报告（仅含摘要卡片和 TC 状态表，不含详情展开）。
> 建议从技能仓库恢复模板文件后重新生成以获取完整报告。

### 场景 6：needs_manual_verification 列表存在但 results 无 NEEDS_MANUAL

`run_state.json` 的 `needs_manual_verification` 非空，但对应 TC 的 `results` 均为 PASSED（旧流程产物——NEEDS_MANUAL 纪律落地前执行的测试）：

> ℹ️ run_state 声明 {n} 条 TC 需人工复核，但 results 均标记 PASSED（旧流程数据）。
> 报告按现状渲染（这些 TC 计为通过），**不自动纠正**为 NEEDS_MANUAL——是否将 {tcIds} 改为 NEEDS_MANUAL 后重新生成报告？或保持现状？

- 保持现状 → 直接生成（needsManual 计数为 0，不渲染复核区块）
- 改后重生成 → 需 PM 确认修改 `results` 后重新执行渲染

---

## 示例

### 正例：完整的报告生成流程

**输入**：`generate-report`

**执行流程**：
1. Phase 6.1 — 自动发现最新 e2e 时间戳目录 `e2e/20260730_143000/`
2. Phase 6.2 — 读取 12 个 checkpoint 日志 + run_state.json + traps.json
3. 汇总：12 条 TC → 8 通过 / 1 失败 / 1 修复 / 2 跳过 → 通过率 75.0%
4. Phase 6.3 — AI 分析 TC02 失败：`expect().toBeVisible()` 失败 + 控制台无错误 → 分类为功能缺陷
5. Phase 6.4 — 渲染 HTML：填充模板、转换截图路径为相对路径、写入 `report/final-report.html`
6. Phase 6.5 — 展示摘要，包含 1 个功能缺陷详情

### 反例：缺陷分类时基于错误类型直接判断，未分析上下文 ❌

**错误做法**：看到 TC04 的错误类型是 `TimeoutError`，直接按降级规则分类为"环境问题"，不纳入缺陷。

**错误原因**：
1. 降级规则仅在没有 AI 能力时使用。如果 AI 可用，应先分析 checkpoint 日志中的上下文。
2. 同样的 `TimeoutError` 可能是：a) 服务器真的超时（环境问题） b) 一个慢查询导致 timeout（性能缺陷，应归入体验问题） c) 死循环导致 timeout（功能缺陷）。
3. 不分析上下文就直接分类会丢失真实的缺陷信号。

**正确做法**：先用 AI 分析时间线 — 该操作之前是快速还是慢速？其他 TC 的同一操作耗时多少？控制台有没有 JS 错误？网络请求的响应时间是多少？综合判断后再分类。

---

## 评估测试

### 正向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `generate-report` | 进入 Phase 6.1，查找 e2e 目录 |
| 2 | `查看报告`（run_state.json 存在） | 路由到 Phase 6，生成报告 |
| 3 | `测试报告` | 路由到 `generate-report` |
| 4 | `generate-report` 且 checkpoint 日志齐全 | 生成完整 HTML 报告 + JSON 数据 |
| 5 | PM 在 `pmcraft 测试完整流程` 流程中被路由到 `generate-report` | 自动执行 Phase 6 |

### 负向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `查看报告`（run_state.json 不存在） | 按边缘场景 1/2 处理：有 checkpoint 日志 → 反向推导状态；无任何日志 → 询问是否仅生成摘要报告 |
| 2 | PM 说 `生成脚本` | 路由到 `setup-tests`，不触发 `generate-report` |
| 3 | PM 说 `开始测试` | 路由到 `run-tests`，不触发 `generate-report` |
| 4 | PM 说 `帮我写封邮件` | 不触发 — 非测试相关 |
| 5 | 用户说 `分析这个 bug` | 不触发 — 这是 bug 分析，非报告生成 |

### 边缘查询（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `generate-report` 但 checkpoint 目录为空 | 触发边缘场景 1，询问是否仅用 run_state 生成摘要报告 |
| 2 | `generate-report` 但 run_state.json 不存在 | 触发边缘场景 2，从 checkpoint 日志反向推导状态 |
| 3 | `generate-report` 但截图文件全部缺失 | 触发边缘场景 3，报告中截图区域显示占位图 |
| 4 | `generate-report` 且 run_state 含 NEEDS_MANUAL TC | 摘要显示"需人工复核"区块，TC 详情标注原因，通过率分母剔除复核项 |
| 5 | `generate-report` 但 needs_manual_verification 列表存在而 results 全 PASSED | 触发边缘场景 6，提示旧数据不自动纠正，询问 PM 是否改状态重生成 |
