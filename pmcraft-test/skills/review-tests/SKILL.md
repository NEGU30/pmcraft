---
name: review-tests
description: >
  当测试完成后需要复盘经验、把通用教训沉淀到用户层时使用。
  基于 run-tests 的修复记录与当次 traps.json 提炼可复用教训，
  判定通用性（用户层 vs 项目级）后由 PM 确认追加到 traps.json，供后续项目复用。
  可由 generate-report 完成后自动衔接，也可单独使用。
type: skill
argument-hint: 无参数
tags:
  - 测试复盘
  - 经验沉淀
  - test
  - review
  - retrospective
  - knowledge
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
dependencies:
  - Node.js（LTS，trap 合法性与重复 scope 校验的 node -e 命令所需；缺失时跳过机械校验，按输出内容人工核对）
prompt: 复盘|沉淀经验|测试总结|经验总结|review-tests
---

# review-tests — 自动复盘与经验沉淀

## 路径约定

- **版本目录**：pmcraft 自动从 cwd 向上查找 `[Vv]?\d+\.\d+\.\d+` 版本目录
- **测试域根**：`{版本目录}/e2e/`（与 `brief/`、`prd/`、`testcase/` 并列）
- **本技能源码目录**：当前 SKILL.md 所在目录（`.../pmcraft-test/skills/review-tests/`）
- **用户层 traps**（跨项目通用累积数据，升级不覆盖）：`{用户数据根}/pmcraft-test/traps.json`
  （`{用户数据根}` = `%USERPROFILE%\.claude\user-data`，Bash 下 `$HOME/.claude/user-data`，路径一律写正斜杠；首次写入时自动创建目录）
- **项目层 traps**（项目特有）：`{版本目录}/e2e/traps.json`

## 概述

测试完成后，自动读取本次修复记录，用 AI 分析提取可复用的教训（pattern/grepPattern/fix/root_cause/scope），
判定通用性（跨项目 → 用户层 / 项目特有 → 项目级），按 scope 去重，由 PM 确认后追加到用户层 traps.json
（跨项目共享，升级不覆盖），让经验沉淀成为流程的自然组成部分（不再依赖 AI 自觉或 PM 手动要求）。

## 输入

| 参数 | 来源 |
|------|------|
| e2e 目录 | 时间戳目录（自动发现，有 run_state.json 优先） |
| 修复记录 | `run_state.json` → `repair_history` |
| 当次陷阱 | `{ts}/traps.json`（若存在） |
| 失败操作 | `logs/checkpoint/*_checkpoint_log.json` → failedOperations（补充信号） |

---

## Phase 7.1：确定 e2e 目录

1. 在 `$PRJ/$VER/e2e/` 下列出所有 `\d{8}_\d{6}` 格式的时间戳目录
2. 若列表为空 → 提示 "没有找到 e2e 产出物，请先说「跑测试」。" 并结束
3. 若存在含 `run_state.json` 的目录 → 选取其中最新者；否则 → 选取最新时间戳目录
4. 若为单独调用且无法自动发现 → 询问 "请提供 e2e 目录路径："

## Phase 7.2：读取复盘数据源

读取以下文件（均相对于 e2e 时间戳目录）：

| 数据源 | 路径 | 用途 |
|--------|------|------|
| 修复记录 | `run_state.json` → `repair_history`（tcId/issue/fix/status） | 主分析对象 |
| 当次陷阱 | `{ts}/traps.json`（已沉淀的 trap） | 去重基准之一 |
| 用户层陷阱 | `{用户层 traps 路径}` | 去重基准（跨项目通用累积） |
| 项目级陷阱 | `$PRJ/$VER/e2e/traps.json` | 去重基准（项目特有） |
| 失败操作 | `logs/checkpoint/*_checkpoint_log.json` → failedOperations | 补充分析信号 |

若无 `repair_history` 且无失败操作 → 提示"本次测试无修复记录，无需复盘"，结束。

## Phase 7.3：AI 分析提取教训

对每条修复记录（及补充的失败操作），提取结构化教训：

| 字段 | 说明 | 示例 |
|------|------|------|
| `pattern` | 问题模式（中文描述，可读） | `waitForLoadState('networkidle') 在 SPA 上永不完成 → 反复超时` |
| `grepPattern` | 机器可用的复发检查正则/关键词 | `networkidle` |
| `fix` | 修复方法（可执行） | `统一使用 waitForLoadState('domcontentloaded') + 目标元素 waitFor({ state: 'visible' })` |
| `root_cause` | 根因 | `SPA 动态页面持续有网络请求，networkidle 永不满足` |
| `scope` | kebab-case 唯一标识 | `spa_networkidle_timeout` |

**grepPattern 编写规则**：
- 生成期问题（脚本内容可 grep）→ 必须写正则/关键词，供 Phase 3.7 机械复发检查
- 执行期问题（无脚本内容可 grep，如文件放置、登录态）→ `grepPattern: ""` + `scope` 标记为 `execution_*`（此类由流程条款约束，不参与 grep 复发检查）

## Phase 7.4：通用性判定 + 去重

**通用性判定（AI）**：

| 涉及范围 | 层级 | 落点 |
|---------|------|------|
| 通用流程 / 测试框架（Playwright）/ 浏览器行为 / 前端框架（Element Plus 等） | 用户层（跨项目） | `{用户层 traps 路径}` |
| 项目特有数据 / 业务规则 / 账号角色 / 特定页面结构 | 项目级 | `$PRJ/$VER/e2e/traps.json` |

**去重**：与用户层 + 项目级 traps 按 `scope` 比较：
- scope 已存在 → **重复跳过**（记录）
- scope 不存在 → **待追加**

输出判定表：
```
| 教训 | 通用性 | scope | 去重结果（新增/重复/项目级） |
|------|--------|-------|---------------------------|
| networkidle 超时 | 用户层 | spa_networkidle_timeout | ⚪ 重复（已存在） |
| ... | | | |
```

**判定表填充规则**：`教训` = pattern 简写（一行可读描述）；`通用性` ∈ {用户层, 项目级}（按 Phase 7.4 层级表判定）；`scope` = Phase 7.3 定义的 kebab-case 唯一标识；`去重结果` ∈ {🟢 新增 / 🟡 新增（项目级）/ ⚪ 重复（已存在）}，与 Phase 7.5 摘要符号一致。

## Phase 7.5：PM 确认（追加门禁）

展示待追加摘要：
```
📋 复盘分析结果（{N} 条教训）
🟢 新增用户层 {a} 条：{pattern 预览}
🟡 新增项目级 {b} 条：{pattern 预览}
⚪ 重复跳过 {c} 条（scope 已存在）

❓ 是否确认追加到用户层 traps.json？（确认 / 调整 / 跳过）
```

**摘要填充规则**：{N} = 判定表教训总数；{a} = 去重结果为 🟢 的条数；{b} = 去重结果为 🟡 的条数；{c} = 去重结果为 ⚪ 的条数（a + b + c = N）；{pattern 预览} = 对应条目的 pattern 字段，多条用「、」分隔。
- **确认** → Phase 7.6 落盘
- **调整** → 修改对应条目后重新展示（AI 按 PM 意见修正）
- **跳过** → 不写入，结束（教训仍保留在当次 traps.json 供本项目使用）

> ⚠️ 未获 PM 确认**禁止**写入用户层 traps.json（防止项目特有经验误沉淀为通用经验）。

## Phase 7.6：落盘 + 校验

1. **用户层**（跨项目通用累积）：追加到 `{用户层 traps 路径}`（即 `%USERPROFILE%\.claude\user-data\pmcraft-test\traps.json`，跨项目共享，升级不覆盖）
   - 写入前先 `mkdir -p` 创建 `{用户数据根}/pmcraft-test/` 目录
   - 文件不存在 → 用空数组 `[]` 初始化后追加
   - 文件损坏（非合法 JSON）→ 备份为 `.corrupted-{yyyyMMdd-HHmmss}.bak`，用空数组 `[]` 继续（**禁止覆盖损坏文件**，须先备份；已累积经验可能丢失，请排查）
2. **项目级**：追加到 `$PRJ/$VER/e2e/traps.json`
3. **校验**（两个文件都校验；用户层路径动态解析，单引号写法避免 Windows 转义问题）：
   ```bash
   node -e 'const p=(process.env.USERPROFILE||process.env.HOME).split("\\").join("/")+"/.claude/user-data/pmcraft-test/traps.json"; const t=require(p); console.log("合法 JSON, 条目数:", t.length); const scopes=t.map(x=>x.scope); const dup=scopes.filter((s,i)=>scopes.indexOf(s)!==i); if(dup.length){ console.log("⚠️ 重复 scope:", dup); process.exit(1) }'
   ```
4. **输出复盘摘要**（**必须显示用户层文件绝对路径**，供 PM 核验写入位置正确）：
   ```
   ✅ 复盘完成
   📦 新增用户层 {a} 条（跨项目通用，升级不丢失）
   📦 新增项目级 {b} 条（本项目特有）
   ⚪ 重复跳过 {c} 条
   📁 用户层：C:/Users/{用户名}/.claude/user-data/pmcraft-test/traps.json（共 {total} 条）
   📁 项目层：$PRJ/$VER/e2e/traps.json（共 {total} 条）
   ▶️ 下次任何项目 setup-tests 将自动读取这些经验。
   ```
   **填充规则**：{a}/{b}/{c} 与 Phase 7.5 摘要一致；{total} = 落盘并校验后该文件累计条目数（两文件分别统计）。

---

### Phase 7.7（可选）：技能文档修正

若复盘教训涉及技能文档本身的错误（如模板代码错误、规则矛盾、选择器表缺失、自相矛盾的约束），询问 PM：

> 📋 本次复盘发现 {N} 条技能文档待修正（非 trap 可覆盖的流程/规则/模板问题）。
> 是否同步修正对应 SKILL.md？（确认 / 跳过）
> 涉及：{文件: 问题描述}...

- **确认** → 编辑对应 SKILL.md，同步到源仓库
- **跳过** → 不修改，教训仅存在于 traps.json（下次排查时仍会看到）

> 目的：traps.json 只能记录"下次生成脚本时注意 X"的模式，但无法修正技能文档本身写错的示例代码或自相矛盾的规则。Phase 7.7 补上这个闭环。

---

## 完成输出

全部执行完毕后输出（Phase 7.6 已含摘要，此处为兜底）：

```
✅ 复盘完成，经验已沉淀（或跳过）
📊 本次教训：{N} 条 → 用户层 {a} / 项目级 {b} / 重复 {c}
```

---

## 禁止行为

1. **未获 PM 确认禁止写入用户层** — 通用性判定可能误判，PM 是最终把关
2. **禁止重复追加** — 同 scope 不重复追加（追加前校验，落盘后二次校验）
3. **禁止修改 traps.json 之外的文件** — 不含 SKILL.md/CLAUDE.md（流程改进另行处理）
4. **禁止缺失 grepPattern** — 生成期问题必须给可执行正则；执行期问题显式 `""` 并标 `execution_*` scope
5. **禁止跳过落盘校验** — 追加到用户层后必须 JSON 校验（含 scope 去重）；写入位置在 `%USERPROFILE%\.claude\user-data\` 下，升级不触碰
6. **禁止原样复制修复记录作为教训条目** — 必须提炼为 pattern/grepPattern/fix/root_cause/scope 五元组；无法提炼的修复记录显式标注跳过原因，不得凑数

## 边缘情况处理

### 场景 1：无修复记录
`repair_history` 为空且无失败操作 → 提示"本次测试无修复记录，无需复盘"，结束。

### 场景 2：全部教训重复
判定表全部为"重复"→ 展示后直接结束，不进入 PM 确认（无新增项）。

### 场景 3：PM 调整某条教训
AI 按 PM 意见修正条目（如改 scope / 改通用性 / 删除）→ 重新展示摘要 → 确认后落盘。

### 场景 4：用户层 traps.json 损坏（非 JSON）
> ⚠️ 用户层 traps.json 无法解析（路径：`{用户层 traps 路径}`）。
> 备份为 `.corrupted-{yyyyMMdd-HHmmss}.bak`，用空数组 `[]` 继续（已累积经验可能丢失，请排查）。
> **禁止覆盖损坏文件，必须先备份再继续**。

### 场景 5：用户层 traps.json 不存在（首次运行）
`mkdir -p` 创建 `{用户数据根}/pmcraft-test/` 目录，以空数组 `[]` 初始化后追加，继续正常流程。

### 场景 6：落盘后校验发现重复 scope
Phase 7.6 校验脚本输出 `⚠️ 重复 scope: {列表}` 且命令非零退出 → 回退本次追加（从文件中移除重复条目），重新校验通过后再输出摘要。

---

## 示例

### 正例：完整的复盘流程

**PM 输入**：`review-tests`

**执行流程**：
1. Phase 7.1 — 自动发现最新 e2e 时间戳目录 `e2e/20260730_171500/`
2. Phase 7.2 — 读取 `run_state.json` → `repair_history` 含 3 条修复记录；读取当次 traps.json（2 条已有沉淀）
3. Phase 7.3 — AI 提取教训：① `spa_networkidle_timeout`（生成期问题，grepPattern: `networkidle`）② `execution_file_placement`（执行期问题，grepPattern: `""`，scope 标 `execution_*`）③ 某项目特有数据规则
4. Phase 7.4 — 通用性判定：①② 用户层，③ 项目级；与用户层 + 项目级 traps 按 scope 去重 → ① 已存在，② 新增用户层，③ 新增项目级
5. Phase 7.5 — 展示摘要（1 条新增用户层 / 1 条新增项目级 / 1 条重复）→ PM 确认"确认"
6. Phase 7.6 — 追加到 `{用户层 traps 路径}` → `node -e` JSON 校验通过（无重复 scope）→ 输出复盘摘要（含用户层绝对路径）

**最终输出**：
✅ 复盘完成
📦 新增用户层 1 条（跨项目通用，升级不丢失）
📦 新增项目级 1 条（本项目特有）
⚪ 重复跳过 1 条
📁 用户层：C:/Users/{用户名}/.claude/user-data/pmcraft-test/traps.json（共 12 条）
📁 项目层：$PRJ/$VER/e2e/traps.json（共 5 条）
▶️ 下次任何项目 setup-tests 将自动读取这些经验。

### 反例：未获 PM 确认直接写入用户层 ❌

**错误做法**：AI 判定教训"networkidle 超时"为用户层后，不等 PM 确认，直接追加写入 `{用户层 traps 路径}`。

**错误原因**：
1. 违反禁止行为 1 — "未获 PM 确认禁止写入用户层"。通用性判定由 AI 做出，可能误判（如把项目特有数据规则误判为通用经验）。
2. 污染影响面大 — 用户层 traps.json 被所有项目读取，一条错误沉淀会污染其他项目的脚本生成。
3. 无法追溯 — 未经过 PM 把关的经验没有评审记录，后续问题排查时无法判断该条教训是否可靠。

**正确做法**：先展示判定表和待追加摘要 → 等 PM 明确回复"确认"（或调整后确认）→ 才执行 Phase 7.6 落盘。PM 选择"跳过"则不写入任何文件。

---

## 评估测试

### 正向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `review-tests` | 进入 Phase 7.1，查找 e2e 目录 |
| 2 | `复盘` / `沉淀经验` / `经验总结` | 路由到 `review-tests` |
| 3 | generate-report 完成后自动衔接提示 | 提示 `review-tests` 可选执行 |
| 4 | 修复记录存在 | Phase 7.2-7.6 全流程执行 |
| 5 | 修复记录含生成期问题 | Phase 7.3 提取 grepPattern，供 setup-tests Phase 3.7 复发检查 |

### 负向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | PM 说 `开始测试` | 路由到 `run-tests`，不触发 `review-tests` |
| 2 | PM 说 `查看报告` | 路由到 `generate-report`，不触发 `review-tests` |
| 3 | PM 说 `生成脚本` | 路由到 `setup-tests`，不触发 `review-tests` |
| 4 | PM 说 `帮我写 PRD` | 不触发 — PRD 编写，非复盘 |
| 5 | PM 说 `分析这个 bug 的代码` | 不触发 — 代码分析，非测试经验复盘 |

### 边缘查询（3 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `review-tests` 但无 e2e 产出物 | 提示"没有找到 e2e 产出物，请先说「跑测试」。" |
| 2 | `review-tests` 但无修复记录 | 提示"本次测试无修复记录，无需复盘"并结束 |
| 3 | `review-tests` 且全部教训重复 | 展示判定表后直接结束，不进入 PM 确认（无新增项） |
