---
name: collect-manual
description: >
  当 run-tests 执行完成后，需要人工补充被跳过（SKIPPED）测试用例的验证结果时使用。
  列出所有跳过的 TC，逐条询问 PM 人工测试结果，写入 manual-results.json，
  供 generate-report 渲染到最终报告中。
  由 pmcraft 路由大脑自动串联调用，也可单独使用（支持追加/更新已有结果）。
type: skill
argument-hint: 无参数
tags:
  - 人工测试
  - 补充结果
  - test
  - manual
  - verification
allowed-tools: [Read, Write, Bash, Glob, AskUserQuestion]
dependencies:
  - Node.js（LTS，Phase 8.4 写盘后校验的 node -e 命令所需；缺失时跳过机械校验，按输出内容人工核对条目数）
prompt: 补充人工结果|人工测试|手动验证|人工验证|collect-manual
---

# collect-manual — 人工测试结果补充

## 路径约定

- **版本目录**：pmcraft 自动从 cwd 向上查找 `[Vv]?\d+\.\d+\.\d+` 版本目录
- **测试域根**：`{版本目录}/e2e/`（与 `brief/`、`prd/`、`testcase/` 并列）
- **本技能源码目录**：当前 SKILL.md 所在目录（`.../pmcraft-test/skills/collect-manual/`）

## 概述

自动化测试后，部分 TC 因阻塞预检被标记 SKIPPED（多角色账号缺失、需开发协助、外观断言需人工目测等），
collect-manual 收集 PM 对这些 TC 的人工测试结果，写入 `manual-results.json`，由 generate-report 渲染进最终报告。

## 输入

| 参数 | 来源 |
|------|------|
| e2e 目录 | 时间戳目录（自动发现，有 run_state.json 优先） |
| 运行状态 | `run_state.json`（提取 results 中 SKIPPED / NEEDS_MANUAL 的 TC + `skipped` 数组，按 tcId 去重） |
| 跳过原因 | `blocking-check-confirmed.md`（若存在；缺失则标注"原因未记录"） |
| 已有结果 | `manual-results.json`（若存在，增量合并） |

## Phase 8.1：确定 e2e 目录

1. 在 `$PRJ/$VER/e2e/` 下列出所有 `\d{8}_\d{6}` 格式的时间戳目录
2. 取最新的（有 `run_state.json` 的优先）
3. 无匹配 → 提示 "没有找到 e2e 产出物，请先说「跑测试」。"
4. 如单独调用且无法自动发现 → 询问 "请提供 e2e 目录路径："

## Phase 8.2：列出跳过的 TC

1. 读取 `run_state.json` → `results`
2. 筛选跳过的 TC：`results[tcId] === 'SKIPPED'` 或 `results[tcId] === 'NEEDS_MANUAL'` 的 TC，加上 `run_state.skipped` 数组（setup-tests Phase 3.8 记录；元素为字符串或 `{tcId, reason}` 对象）中的 TC，按 tcId 去重合并
3. 读取 `blocking-check-confirmed.md`（若存在）→ 提取每条 TC 的跳过原因；缺失 → 标注"原因未记录"
   NEEDS_MANUAL TC 的原因 → 取 `run_state.manual_verification_reason`（缺失 → "原因未记录"）
4. 读取 `manual-results.json`（若存在）→ 展示已有结果，标记"已补充"
5. 展示清单：

```
📋 待人工验证的测试用例（跳过 + 需人工复核，共 {N} 条）

| TC | 跳过原因 | 状态 |
|----|---------|------|
| TC-P-12 | 多角色账号缺失（需审核员账号） | ⬜ 待补充 |
| TC-UI-L-15 | 外观断言需人工目测（1366分辨率截断检查） | ⬜ 待补充 |
| CD-S-25 | 需开发协助（测试数据环境） | ⬜ 待补充 |
| TC-B-10 | 需人工复核：datepicker 填值 headless 不可靠 | ⬜ 待补充（NEEDS_MANUAL） |
| TC-P-13 | 多角色账号缺失 | ✅ 已补充（MANUAL_PASSED） |

需要逐条补充人工测试结果吗？（继续 / 跳过全部 / 选择部分 TC）
```

## Phase 8.3：逐条收集人工结果

**交互机制（MUST）**：
- 默认逐条询问：对每条未补充 TC 完成全部必填交互后再进入下一条
- 数量 > 5 → 必须提供 8.3.1 批量模式选项；批量格式必须含全部必填字段
- 若使用多题合并提问（如 AskUserQuestion 一次多题），每题必须完整包含该 TC 的全部必填字段（截图询问、验证人、失败时缺陷类型+简述），禁止压缩丢字段

**□ 强制清单（SHALL，逐条执行）**：
□ 对每条 MANUAL_PASSED / MANUAL_FAILED 的 TC，必须询问"有截图吗？"（提供文件路径，或显式输入"无"）
□ 首次收集时记录验证人（executor，昵称+工号）；不提供则显式确认使用"未署名"
□ 每条人工结果 TC 的 manualResults 记录必须含 evidence 字段（截图文件名 或 显式"无截图"）

对每条未补充的 SKIPPED TC 逐条询问（或批量模式，见 8.3.1）：

```
🔍 TC-P-12: 审批流验证
   跳过原因：多角色账号缺失（需审核员账号）

   人工测试结果：
   ① 通过（MANUAL_PASSED）— 功能正常
   ② 失败（MANUAL_FAILED）— 发现缺陷
   ③ 保持跳过（SKIPPED）— 仍无法验证

   请选择：{response}
```

**如果 PM 选择 ① 通过**：
```
✅ TC-P-12 → MANUAL_PASSED

请补充验证说明（做了什么、看到了什么、如何判断通过）：
> {note}

有截图吗？（提供文件路径，或输入"无"）：
> {path}
```

**如果 PM 选择 ② 失败**：
```
❌ TC-P-12 → MANUAL_FAILED

请补充验证说明：
> {note}

缺陷类型：
① 功能缺陷 — 功能不工作、返回错误、行为不符合预期
② 体验问题 — 可用但交互体验差（布局、响应速度、loading 缺失）
③ 文案问题 — 文本不对、未翻译、拼写错误
④ 建议项 — 小改进建议，非阻断性

请选择：{response}

缺陷简述（一句话）：> {description}

有截图吗？> {path}
```

**如果 PM 选择 ③ 保持跳过**：
```
⏭️ TC-P-12 → 保持跳过

备注（可选）：
> {note}
```
> 若该 TC 原状态为 **NEEDS_MANUAL**（需人工复核）→ 保持 NEEDS_MANUAL，不写人工 SKIPPED 覆盖（约束 8）；提示"仍为需人工复核状态，报告将持续标注"。SKIPPED 原状态的 TC 则正常记录为 SKIPPED。

**验证人**：首次询问时记录，后续 TC 默认沿用（可修改）：
```
验证人昵称、工号（用于报告署名）：> {executor}
```

### 8.3.1 批量模式

如果待补充 SKIPPED TC 数量 > 5，提供批量模式选项：

```
检测到 {N} 条待补充 TC。是否切换到批量模式？
批量模式下，一次性列出所有 TC 的结果，格式：
  TCxx → 通过/失败/跳过 | 说明 | 缺陷类型(仅失败) | 截图路径(可输入'无')

① 逐条模式（推荐，交互更细致）
② 批量模式（更快，适合已知结果的场景）
```

## Phase 8.4：写盘

1. 确保 `{e2e_dir}/logs/manual-evidence/` 目录存在（`mkdir -p`）
2. 如果有截图 → 复制到 `logs/manual-evidence/TCxx_{原始文件名}`（保留扩展名）；若目标文件名已存在 → 追加 `_{HHmmss}` 时间戳后缀避免覆盖。`evidence` 字段只存最终文件名（相对 `logs/manual-evidence/`）
3. 按以下模板构造 `manualResults` 对象（每条 TC 一个条目，字段规则见模板注释）：

```json
{
  "manualResults": {
    "{tcId}": {
      "status": "{MANUAL_PASSED | MANUAL_FAILED | SKIPPED | NEEDS_MANUAL}",
      "executor": "{验证人昵称, 工号 | 未署名}",
      "resultTime": "{YYYY-MM-DDTHH:mm:ss 本地时间}",
      "note": "{验证说明；保持跳过时可选}",
      "evidence": "{截图文件名（相对 logs/manual-evidence/） | 无截图}",
      "defectType": "{功能缺陷 | 体验问题 | 文案问题 | 建议项}",
      "defectDescription": "{一句话缺陷简述}"
    }
  }
}
```

填充规则：
- `{tcId}` = run_state.json 中的原始 TC ID（如 `TC-P-12`），禁止改名
- `status` 取值限四种；NEEDS_MANUAL 原状态的 TC 保持跳过 → 写 `NEEDS_MANUAL`（禁止写人工 SKIPPED 覆盖，约束 8）
- `evidence` 只存文件名（相对 `logs/manual-evidence/`）；无截图必须显式写 `"无截图"`，禁止缺失该字段（约束 6）
- `defectType` / `defectDescription` 仅在 `status = MANUAL_FAILED` 时写入；通过/跳过条目不包含
4. 若 `manual-results.json` 已存在 → 读取合并（新结果覆盖旧结果，**保留未改动条目**）
5. 写入 `{e2e_dir}/manual-results.json`，写盘后校验：

```bash
node -e "const m=require(process.argv[1]); console.log('manualResults entries:', Object.keys(m.manualResults).length)" "{e2e_dir}/manual-results.json"
```

> **路径卫生（Bash 注入防护）**：`{e2e_dir}` 来自项目路径（用户输入），构造 Bash 命令前须剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 确认实际路径）；路径一律用双引号包裹传入（JSON 路径经 argv 传递，不嵌入 -e 代码串——Windows 反斜杠路径若内嵌 JS 字符串字面量会被转义解析破坏，且单引号可逃逸代码串）。

- 输出条目数 ≥ 预期 → ✅ 步骤完成
- 条目数不对 → 回退重写（同一轮写盘最多重试 **3 次**，超限 → 展示实际/预期条目差异给 PM，人工介入后继续；防 AI 反复尝试相同修复进入死循环，口径同 setup-tests Phase 3.7 / run-tests 约束 3）

**evidence 完整性校验（追加）**：

```bash
node -e "const m=require(process.argv[1]); const miss=Object.entries(m.manualResults).filter(([k,v])=>['MANUAL_PASSED','MANUAL_FAILED'].includes(v.status) && !('evidence' in v)); console.log('缺 evidence 的 TC:', miss.length ? miss.map(([k])=>k).join(',') : '无'); if(miss.length) process.exit(1)" "{e2e_dir}/manual-results.json"
```

- 输出"缺 evidence 的 TC: 无" → ✅ 通过
- 非空 → **阻塞**，回退补询截图后再写盘

## Phase 8.5：输出摘要

```
✅ 人工结果已保存

📊 人工验证摘要：
  - 通过（MANUAL_PASSED）：{n} 条
  - 失败（MANUAL_FAILED）：{n} 条
  - 仍跳过（SKIPPED）：{n} 条
  - 未补充：{n} 条

📁 结果文件：{e2e_dir}/manual-results.json
📁 截图目录：{e2e_dir}/logs/manual-evidence/

▶️ 下一步：说「查看报告」生成包含人工验证结果的完整报告。（**NEXT-TEST 模板**，话术库，见 CLAUDE.md「话术模板库」节）
```

---

## 禁止行为

1. **禁止压缩丢字段** — 每题必须完整包含该 TC 全部必填字段（截图询问、验证人、失败时缺陷类型+简述），禁止多题合并时丢字段
2. **禁止人工结果覆盖自动化结果** — 自动化结果已由 checkpoint 日志证明时，不互相覆盖（可在 generate-report 缺陷表注释补充，不修改 TC 状态）
3. **禁止按线上行为判 MANUAL_PASSED** — 人工验证发现 PRD 预期与线上不符 → 必须 MANUAL_FAILED（缺陷分类选"功能缺陷"）+ 记 `prd_vs_live_gaps`（与 run-tests Phase 5.3 纪律一致）
4. **禁止缺失 evidence 字段** — 无截图也显式记录 `evidence: "无截图"`，禁止缺失该字段（Phase 8.4 机械校验）
5. **禁止覆盖 NEEDS_MANUAL 为 SKIPPED** — 需人工复核状态的 TC 保持 NEEDS_MANUAL，不写入人工 SKIPPED 覆盖

## 约束

1. **仅覆盖 SKIPPED / NEEDS_MANUAL TC** — 自动化已通过/失败的 TC 不接受人工结果覆盖（防止数据污染）；NEEDS_MANUAL（需人工复核）与 SKIPPED 同等可被人工结果覆盖（报告状态经 statusOf 优先级 1 最终化）
2. **截图路径规范化** — 用户提供的任意路径截图统一复制到 `{e2e_dir}/logs/manual-evidence/`，报告以相对路径引用
3. **支持增量更新** — 已存在的 manual-results.json 不整文件覆盖，仅更新本次补充的条目
4. **executor 必填** — 验证人标识 = 昵称、工号（如 `昵称, 工号`）。不提供则使用默认值 "未署名"
5. **MANUAL_FAILED 必须有缺陷分类** — 选择失败时必须提供 defectType，否则降级为 SKIPPED
6. **截图询问强制** — 每条 MANUAL_PASSED / MANUAL_FAILED 的 TC 必须询问"有截图吗？"。无截图也显式记录 `evidence: "无截图"`，禁止缺失 evidence 字段（Phase 8.4 机械校验）
7. **⚡ 人工验证发现 PRD 差异 → 判失败（MUST）** — 人工验证时若发现 PRD 预期与线上行为不符（如 PRD 要求禁用/校验/保留，线上未实现），必须选择 **MANUAL_FAILED**（缺陷分类选"功能缺陷"）+ 将差异条目追加到 `run_state.json` 的 `prd_vs_live_gaps`（报告直接展示）；禁止按线上行为判 MANUAL_PASSED（与 run-tests Phase 5.3"断言跟随线上行为 ≠ 通过"纪律一致）
8. **复核仍跳过 → 保持 NEEDS_MANUAL** — 对 NEEDS_MANUAL 的 TC 选择"保持跳过（SKIPPED）"时，其状态保持 NEEDS_MANUAL，报告持续标注"需人工复核"（不因跳过而消失，见 generate-report 摘要）

---

## 边缘情况处理

### 场景 1：没有 SKIPPED TC

Phase 8.2 合并后无跳过 TC（`results` 中无 SKIPPED / NEEDS_MANUAL 且 `run_state.skipped` 数组为空）→ 提示 "✅ 本次测试无跳过的 TC，无需人工补充。" 结束。

### 场景 2：manual-results.json 已存在（追加模式）

读取已有结果 → 跳过已补充的 TC → 只展示未补充的 TC。PM 可选择"全部重来"覆盖。

### 场景 3：run_state.json 不存在

提示 "未找到 run_state.json，请先说「跑测试」。" 结束。

### 场景 4：PM 提供的截图路径无效

> ⚠️ 截图文件 `{path}` 不存在或无法读取。请确认路径后重试。或输入"无"跳过截图。

### 场景 5：所有 TC 保持 SKIPPED

PM 对所有 TC 选择 SKIPPED → 仍写入 manual-results.json（状态为 SKIPPED），但提示 "所有 TC 仍为跳过状态，报告中不会显示人工验证结果。"

**NEEDS_MANUAL TC 的"保持跳过"不同**（约束 8）：若其中含 NEEDS_MANUAL 状态的 TC 且 PM 对其选择"保持跳过"，该 TC 状态**保持 NEEDS_MANUAL**（不写入人工 SKIPPED 覆盖），提示 "TC-{id} 仍为需人工复核状态，报告将持续标注，直到 PM 人工确认通过/失败。"

### 场景 6：人工验证发现 PRD 预期与线上行为不符

人工验证某 SKIPPED TC 时，若 PM 发现 PRD 预期与线上行为不符（如 PRD 要求清空/校验/禁用，线上未实现）：

> ⚠️ 该 TC 的 PRD 预期与线上行为不一致：
> - PRD 预期：{prdBehavior}
> - 线上实测：{liveBehavior}
> 按约束 7，此差异是缺陷信号，应选择"失败（MANUAL_FAILED）"并分类为功能缺陷。

执行：
1. 引导 PM 选择 **MANUAL_FAILED**（缺陷类型选"功能缺陷"），禁止按线上行为判 MANUAL_PASSED
2. 将差异条目追加到 `run_state.json` 的 `prd_vs_live_gaps`（`{ "tcId", "prdBehavior", "liveBehavior" }`），报告直接展示
3. 仅当 PM 明确确认"按线上行为验收"时，可改为 MANUAL_PASSED 并在 `prd_vs_live_gaps[].status` 记录 `pm_confirmed_accept`

### 场景 7：批量模式下某条结果格式不完整

PM 在 8.3.1 批量模式提交的某条记录缺少必填字段（如失败条缺缺陷类型、缺验证说明）：

> ⚠️ 第 {n} 条格式不完整，缺少字段：{缺陷类型 | 验证说明 | 截图路径}。请按批量格式（TCxx → 通过/失败/跳过 | 说明 | 缺陷类型(仅失败) | 截图路径(可输入'无')）重新提交该条。

其余格式正确的条目正常写入，不受影响（不整批回退）。

---

## 示例

### 正例：完整的人工结果收集

**PM 输入**：`collect-manual`

**执行流程**：
1. Phase 8.1 — 发现 `e2e/20260730_171522/`，run_state.json 存在
2. Phase 8.2 — 列出 6 条 SKIPPED TC，其中 2 条已有结果（manual-results.json 已存在）
3. PM 选择逐条补充剩余 4 条
4. TC-P-12：PM 选 ① 通过，提供说明和截图 → 截图复制到 logs/manual-evidence/
5. TC-UI-L-15：PM 选 ② 失败，选"体验问题"，描述截断问题，提供截图
6. CD-S-25：PM 选 ③ 保持跳过，备注"开发下周提供数据"
7. Phase 8.4 — 合并写入 manual-results.json，校验条目数 +4
8. Phase 8.5 — 输出摘要

**写盘示例**（manual-results.json 片段，字段符合 Phase 8.4 模板）：

```json
{
  "manualResults": {
    "TC-P-12": { "status": "MANUAL_PASSED", "executor": "昵称, 23456", "resultTime": "2026-07-30T18:02:11", "note": "使用审核员账号完成审批流验证，审批后列表状态更新正确", "evidence": "TC-P-12_审批通过.png" },
    "TC-UI-L-15": { "status": "MANUAL_FAILED", "executor": "昵称, 23456", "resultTime": "2026-07-30T18:04:33", "note": "1366 分辨率下列表内容右端截断", "evidence": "TC-UI-L-15_截断.png", "defectType": "体验问题", "defectDescription": "1366 分辨率下列表内容右端截断" }
  }
}
```

### 反例：覆盖自动化的 PASSED TC ❌

**错误做法**：PM 想为 TC-F-1（自动化 PASSED）补充人工意见，collect-manual 允许修改其状态。

**错误原因**：违反约束 1。自动化测试和人工测试的结果来源不同，不应互相覆盖。TC-F-1 的自动化结果已由 checkpoint 日志证明。如需补充意见，应在 generate-report 的缺陷表中以注释形式添加，而非修改 TC 状态。

---

## 评估测试

### 正向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `collect-manual` | 进入 Phase 8.1，查找 e2e 目录 |
| 2 | `补充人工结果` | 路由到 `collect-manual` |
| 3 | `collect-manual` 且 run_state.json 含 SKIPPED TC | 列出 SKIPPED TC，等待 PM 输入 |
| 4 | `人工测试` / `手动验证` | 路由到 `collect-manual` |
| 5 | PM 在 `pmcraft 测试完整流程` 流程中被路由到 `collect-manual` | 自动执行 Phase 8.1-8.5（含跳过原因、已有结果展示） |

### 负向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | PM 说 `生成脚本` | 路由到 `setup-tests` |
| 2 | PM 说 `开始测试` | 路由到 `run-tests` |
| 3 | `collect-manual` 但无 SKIPPED TC | 提示"无跳过的 TC"并结束 |
| 4 | PM 说 `查看报告` | 路由到 `generate-report`，不触发 `collect-manual` |
| 5 | PM 说 `分析这个 bug 的代码` | 不触发 — 代码分析，非人工结果补充 |

### 边缘查询（7 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `collect-manual` 但 run_state.json 不存在 | 提示"请先说「跑测试」" |
| 2 | PM 提供不存在的截图路径 | 提示路径无效，请求重新输入 |
| 3 | `collect-manual` 且所有 SKIPPED TC 已补充完毕 | 展示"全部已补充"清单并结束，不重复询问（增量合并模式） |
| 4 | 人工验证中发现 PRD 预期与线上行为不符 | 触发边缘场景 6，引导选择 MANUAL_FAILED（功能缺陷）+ 记录 prd_vs_live_gaps，禁止按线上行为判通过 |
| 5 | 复核清单含 NEEDS_MANUAL TC 且 PM 选择"保持跳过" | 保持 NEEDS_MANUAL（不写人工 SKIPPED 覆盖，约束 8），提示"报告将持续标注" |
| 6 | 复核清单含 NEEDS_MANUAL TC 且 PM 选择通过/失败 | 正常记录 MANUAL_PASSED / MANUAL_FAILED，报告状态经 statusOf 优先级 1 最终化 |
| 7 | 批量模式下某条结果缺必填字段（如失败条缺缺陷类型） | 提示该条缺少的字段并要求重新提交该条，其余条目正常写入 |
