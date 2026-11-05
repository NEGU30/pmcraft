---
name: log-decisions
description: 当需求澄清、评审、规划过程中产生关键决策时，自动捕获并结构化记录决策条目。支持创建、追加、状态更新。作为基础设施技能供其他技能调用。
type: skill
tags:
  - 决策记录
  - 决策日志
  - decision
  - traceability
  - infrastructure
allowed-tools: [Read, Write, Edit, Glob, Bash, Skill]
dependencies:
  - Node.js（LTS，scripts/append-decisions.js 运行所需；缺失时脚本不可用，提示检查 Node.js 环境）
argument-hint: "<版本目录路径> action=create|append|view|add"
prompt: 决策记录|log-decisions
---

# 决策记录管理 (log-decisions)

## 概述

`log-decisions` 是一个基础设施技能，负责决策记录的创建、追加、状态更新和查询。定位与 `pmcraft-req:save-doc` 同级，由以下来源通过 `Skill` 工具内部调用，也支持 PM 手动交互触发：

| 来源 | 触发模式 | 典型场景 |
|:---|:---|:---|
| `write-brief` | `create`（首次创建） | 需求澄清阶段的规则决策（如 D001-D008） |
| `review-brief` | `append` | 伪需求判断决策（如 D009） |
| `revise-from-meeting` | `append`（常带 `state_updates`） | 会议评审决策，推翻/延期旧决策；遗留问题 → 待确认条目 |
| `revise-prd` | `append` | 原型同步评估（需要同步/无法判定 → 待确认条目） |
| `append-prd` | `append` | 未纳入本次修订的建议（→ 待确认条目） |
| `plan-iteration` | `append`（常带 `state_updates`） | 版本规划决策，功能排期/延期 |
| PM 手动 | `add` / `view` | 日常手动新增、查看 |

> `append` 模式的机械写入由 `scripts/append-decisions.js` 完成（见下文「action=append」），`create` 模式复用 `pmcraft-req:save-doc`。

### 核心能力
- **创建决策记录**：首次创建决策记录文件（通过 pmcraft-req:save-doc 保存 E1）
- **追加决策条目**：读取现有决策记录，原地追加新条目，E 编号递增
- **状态更新**：推翻/延期已有决策条目时，同步更新正文和状态索引
- **手动查看与编辑**：PM 可手动查看决策记录或交互式新增

## Guard-Chat 守卫检查（第 0 步）

> 本小节为守卫开关检查，**不阻塞**主流程：执行完直接进入下一节。**子代理上下文**（被 spawn 执行、无法与用户交互，如 doc-reviewer/design-reviewer）整节静默跳过——不询问、不标记、不检测。

1. 运行 `node "{插件根}/_shared/scripts/guard-chat.js" status`，`{插件根}` = 从当前 SKILL.md 目录向上找第一个含 `_shared/scripts/guard-chat.js` 的祖先目录（source 环境=市场根，cache 环境=插件版本目录）。
2. 解析单行 JSON（契约：`{"status":"ok","data":{"enabled":bool,"prompted":bool,"dir":"…"}}`）：
   - `prompted=false` → 按话术库 GUARD-ASK（`enabled=false`）或 GUARD-ON（`enabled=true`）提示一次，然后运行 `node "{插件根}/_shared/scripts/guard-chat.js" mark-prompted`。用户紧随询问回复肯定意图（如「开启」），或任意轮次说「开启Guard-Chat」（路由表已注册）时，运行 `guard-chat.js enable`。
   - `prompted=true` → 跳过，不重复提示。
   - 话术库不可达（项目未跑 init-project、无大脑注入）→ 用兜底一句：「本会话可开启 Guard-Chat 守卫：开启后，你输入中可能影响判断的表述（如预设立场、权威宣称、逻辑谬误）会当场标注提醒；落盘文档中的对话填充语（如“好问题”、“希望对你有帮助”）会自动清除。说「开启Guard-Chat」开启（回复「开启」也可以），本会话只问一次。」（兜底非权威副本，有话术库时必须用话术库）
3. 脚本不可用（node 缺失/脚本缺失/JSON 解析失败）→ 静默跳过，继续主流程。
4. 本技能对话期间（仅 `enabled=true` 时）：① 每条用户消息经 `guard-chat.js detect`（stdin）检测，命中时单行简短标记，不打断流程；② 文档落盘前（save-doc 保存、直接写入报告文件）经 `guard-chat.js purify`（stdin）净化。规则见路由大脑「Guard-Chat 守卫行为」节。对话回复文风遵循 agent 定义的文风底线（无需脚本）。

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| action | `create` / `append` / `view` / `add` | 是 | 操作类型 | `create` |
| version_dir | 目录路径 | 是 | 功能的版本目录 | `./账号系统/1.0.0` |
| decisions_file | JSON 文件路径 | `create`/`append` 时必选 | 待写入的决策条目临时 JSON 文件 | `./账号系统/pmcraft/temp/decisions.json` |
| source | 字符串 | 是 | 来源技能名 | `write-brief` |
| state_updates_file | JSON 文件路径 | `append` 时可选 | 需更新状态的已有条目（如推翻标记） | `./账号系统/pmcraft/temp/state_updates.json` |
| brief_path | 文件路径 | `create` 时必选 | 关联简报的相对路径 | `./账号系统/1.0.0/brief/账号系统_1.0.0_需求简报_E1.md` |
| func_name | 字符串 | 是 | 功能名称 | `电视比价` |
| scene_type | 字符串 | 是 | 场景类型：全新功能 / 存量新增功能 / 功能优化 | `全新功能` |
| author | 字符串 | 是 | 负责人 | `王五<1003>` |

## 调用方式

### 被调用模式（其他技能内部触发）

#### action=create（write-brief 首次创建）

调用方在对话中准备：
1. 将决策列表写入临时 JSON 文件（decisions_file），格式见下方
2. 调用 `Skill` 工具，技能名称为 `pmcraft-req:log-decisions`，传入所有必选参数

```
log-decisions action=create version_dir=<路径> decisions_file=<JSON路径> source=write-brief brief_path=<简报路径> func_name=<功能名> scene_type=<场景类型> author=<负责人>
```

#### action=append（review-brief / revise-from-meeting / plan-iteration 追加）

调用方将新决策条目和状态更新分别写入两个临时 JSON 文件：

```
log-decisions action=append version_dir=<路径> decisions_file=<JSON路径> state_updates_file=<JSON路径> source=<来源> author=<负责人>
```

### 手动模式（PM 直接触发）

- **查看**：`log-decisions action=view version_dir=<版本目录路径>` — 读取并展示当前版本所有决策
- **新增**：`log-decisions action=add version_dir=<版本目录路径>` — 交互式引导 PM 新增一条决策

## 决策条目 JSON 格式

### decisions_file 格式

```json
[
  {
    "id": "D001",
    "title": "方案选择：全自动抓取 vs 手动备选",
    "source": "需求澄清",
    "status": "已确认",
    "background": "比价数据需要从电商平台实时获取，但抓取成功率和数据源稳定性不确定。",
    "options": [
      "全自动抓取——失败时提示用户稍后重试",
      "自动为主、手动兜底——抓取失败时用户可手动输入价格",
      "纯手动输入——不做自动抓取"
    ],
    "decision": "B",
    "reason": "全自动有断流风险，直接阻断用户流程不可接受。纯手动效率太低。B 方案兼顾效率与容错。",
    "cost": "手动输入数据一致性弱于自动抓取；后续需要运维资源监控抓取健康度。",
    "assumptions": [
      {"text": "抓取源接口月可用率 >95%", "source": "AI 推断"},
      {"text": "用户愿意在失败时手动输入", "source": "PM 确认"}
    ],
    "links": "规则 R03, R07, 故事 #3",
    "trigger_condition": null,
    "superseded_by": null
  }
]
```

### state_updates_file 格式

```json
[
  {
    "id": "D003",
    "new_status": "已推翻",
    "superseded_by": "D006",
    "superseded_date": "2026-04-18",
    "superseded_reason": "技术评审确认精度 99% 不可行，降至 95%"
  }
]
```

### 决策条目正文块模板

「3. 决策条目」章节内每条决策的 Markdown 正文块。**create 模式 LLM 手写正文与 append 模式 `scripts/append-decisions.js` 生成格式必须一致**；字段缺失时对应小节整体省略（`options` 缺失时「**选项**」小节省略）：

```markdown
### D001 · {一句话标题}

| | |
|:---|:---|
| **日期** | {YYYY-MM-DD} |
| **来源** | {来源技能/场景} |
| **状态** | {✅ 已确认 / ❓ 待确认 / ⏳ 条件触发 / ❌ 已推翻 / ⏸ 已延期} |

**背景**
{为什么需要做这个决定}

**选项**
- A. {选项 A}
- B. {选项 B}

**决定**：{选中的方案}

**理由**
{为什么选这个}

**代价**
{代价或风险}

**前提假设**
- {假设 1} *({AI 推断 / PM 确认})*

**关联**：{规则/故事/决策编号}

**触发条件**：{仅状态为"条件触发"时填写}
**推翻记录**：{仅状态为"已推翻"时填写，格式见模板，如 `- 被 D006 推翻`}
```

> append 模式该块由脚本自动生成，LLM 不手写；create 模式按此块逐条写入。

## 状态索引表格式

「## 4. 状态索引」章节为 Markdown 表格，供 AI 快速扫描决策全景。**固定 6 列**（与 `../../_shared/templates/decision_log_template.md` 及 `scripts/append-decisions.js` 写入格式一致——LLM 手写时必须同构，否则 append 脚本按 6 列表头正则定位会失败）：

```markdown
## 4. 状态索引

| 编号 | 标题 | 状态 | 关联项 | 触发条件 | 被推翻于 |
|:---|:---|:---|:---|:---|:---|
| D001 | 方案选择：全自动抓取 vs 手动备选 | ✅ | R03, R07, 故事 #3 | — | — |
| D002 | 审批流程集成时机 | ⏳ | 规则 R12 | 审批接口确认 | — |
| D003 | 数据精度要求 | ❌ | D006 | — | D006 |
```

**填充规则**：
- **编号**：D 编号，可点击跳转到正文对应 `### {编号}` 锚点。
- **标题**：与决策条目的 `title` 字段一致。
- **状态**：当前有效状态裸符号（✅ 已确认 / ⏳ 条件触发 / ❓ 待确认 / ❌ 已推翻 / ⏸ 已延期）。
- **关联项**：与决策条目的 `links` 字段一致，无则填 `—`。
- **触发条件**：与 `trigger_condition` 字段一致，无则填 `—`。
- **被推翻于**：与 `superseded_by` 字段一致，无则填 `—`。

## 决策速览表格式

「## 5. 决策速览」章节为 Markdown 表格，供快速回顾最近决策（AI 与 PM 共用）。**最新决策在最前（D 编号降序）**，由 `scripts/append-decisions.js` 每次 append 自动维护，与正文保持同步：

```markdown
## 5. 决策速览

| 编号 | 标题 | 结论 | 影响 | 状态 |
|:---|:---|:---|:---|:---|
| D003 | 数据精度要求 | 95% 精度方案 | 精度 99% 不可行 | ❌ |
| D001 | 方案选择：全自动抓取 vs 手动备选 | B（自动为主、手动兜底） | 需监控抓取健康度 | ✅ |
```

**填充规则**：
- **编号**：D 编号锚点，与正文 `### {编号}` 对应。
- **标题**：取 `title` 字段，去换行、超 40 字截断加"…"（完整标题在正文）。
- **结论**：取 `decision` 字段；**单字母（A/B/C）时展开为「字母（选项原文）」**（如 `B（自动为主、手动兜底）`），否则原样；超 30 字截断加"…"；**为空或缺失时填"—"**。
- **影响**：取 `cost` 字段，空则填"—"，超 40 字截断加"…"。
- **状态**：**裸符号**（✅/⏳/❓/❌/⏸），与状态索引一致——**禁止写成"✅ 已确认"带文字格式**，否则会污染「1. 基本信息」的元信息统计（脚本按 `✅ 已确认` 等带文字正则计数）。
- **排序**：D 编号降序（最新在前）；状态推翻/延期时仅改状态列符号，不改变行序。
- **存量迁移**：已有决策记录缺「## 5. 决策速览」节时，append 脚本自动在文末创建该节，并按状态索引回填（结论/影响为"—"，注释行指引到「3. 决策条目」）。

## 核心执行逻辑

### action=create（创建）

1. 读取 `decisions_file` JSON，提取所有决策条目。
2. 读取 `../../_shared/templates/decision_log_template.md` 模板。**如果读取失败** → 按本技能内嵌结构自行组织：标题 + 元信息（功能名/版本号/场景类型/负责人/关联简报/日期）+ 「3. 决策条目」逐条正文 + 「4. 状态索引」表格 + 变更记录，并在文件中标注"模板缺失，按内嵌结构生成"。
3. 填充元信息（功能名、版本号、场景类型、负责人、关联简报、日期等）。
4. 按「决策条目正文块模板」逐条写入决策正文（见上文小节，字段缺失时对应小节省略）。
5. 生成状态索引表。
6. 生成决策速览表（每行：编号|标题|结论|影响|状态；结论单字母时展开为「字母（选项原文）」，超 30/40 字截断，状态用裸符号，最新决策在最前）。
7. 写入变更记录（E1）。
8. 将完整内容写入临时 Markdown 文件，位置统一为**项目根 `pmcraft/temp/`**（若不存在则先创建；命名 `{功能名}_决策记录_{yyyy-MM-dd}.draft.md`）。**禁止写入系统 Temp 或 cwd**——save-doc 复制后临时文件即被删除，写入项目内临时区确保中途失败时产物可追踪。
9. 调用 `pmcraft-req:save-doc` 技能（文档类型 `决策记录`），传入临时文件路径。
10. 返回保存结果给调用方，按以下模板展示：

```markdown
## ✅ 决策记录已创建 — {功能名} v{版本号}

**文件**：{文件名}（E{编号}） | **决策条目**：{N} 条 | **关联简报**：{简报文件名}

- D001 {标题} — {状态}
- D002 {标题} — {状态}
- ...
```

填充规则：`{功能名}`、`{版本号}`、`{简报文件名}` 取自调用方传入参数；`{文件名}`、`{编号}` 取自 save-doc 返回结果；`{N}` 为本条决策条目总数；条目行逐一列出本次写入的决策，`{状态}` 取该条目 `status` 字段。若 save-doc 返回失败 → 展示其错误信息，不输出本模板。

### action=append（追加）

**机械写入由 `scripts/append-decisions.js` 完成**（Node 原生 UTF-8，无编码断裂），LLM 只负责前置准备与结果展示。脚本输出 JSON 格式是契约，勿改。

#### 前置准备（LLM 执行）

1. **定位现有文件**：Glob 扫描 `<version_dir>/decision/` 下 `*_决策记录_E*.md`，取最大 E 编号文件（脚本也会做，LLM 用于展示上下文）。
2. **读取并解析**：提取最大 D 编号、状态索引表当前内容，确认新条目与已有条目无逻辑冲突。
3. **读取 decisions_file**：确认 JSON 数组格式正确（id 可选——不传或与既有编号冲突时，脚本自动分配下一个可用 D 编号）。
4. **处理状态更新**（可选）：若需推翻/延期旧条目，准备 `state_updates_file` JSON 数组（字段：`id`、`new_status`、`superseded_by`、`superseded_date`、`superseded_reason`）。脚本会同步更新正文状态行、追加推翻记录、更新状态索引表。
5. **新决策正文内容组装（LLM 负责内容质量）**：新条目的 `title`、`background`、`options`、`decision`、`reason`、`cost`、`assumptions`、`links`、`trigger_condition` 字段由 LLM 从调用方（write-brief / review-brief / revise-from-meeting / revise-prd / append-prd / plan-iteration）的上下文组装，脚本按模板格式化写入。

#### 调用脚本（机械执行）

> **参数安全（Bash 注入防护）**：`--author` 来自用户信息（用户输入），`--version-dir` / `--decisions-file` / `--state-updates-file` 为项目内路径——拼入命令前先剔除 `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符，全部参数值一律用双引号包裹后传入（口径同 save-doc 的 `--summary`/`--author`）。

```bash
node "{本技能源码目录}/scripts/append-decisions.js" \
  --version-dir="<版本目录>" \
  --decisions-file="<新决策条目 JSON 路径>" \
  [--state-updates-file="<状态更新 JSON 路径>"] \
  [--author="<负责人>"] \
  [--dry-run]
```

**脚本职责**（自动化，消除 LLM 手工编辑大文件的失误）：
- 定位现有决策记录（最大 E），解析最大 D 编号
- 为新条目分配连续 D 编号（不传 id 或冲突时自动分配下一个可用编号）
- 按模板生成决策正文块（`### Dxxx · 标题` + 元信息表 + 背景/选项/决定/理由/代价/前提假设/关联/触发条件/推翻记录）
- 处理状态更新（正文状态行替换、推翻记录追加、状态索引表同步、决策速览表状态列同步）
- 在「## 4. 状态索引」前插入新正文块
- 更新状态索引表（追加新行）、变更记录（E 递增）、元信息（最后更新/决策条目统计）
- 更新决策速览表（新行倒序插入表头分隔行后，最新在前；状态更新同步状态列符号）
- 存量文件缺「## 5. 决策速览」时自动迁移创建该节，并按状态索引回填（结论/影响为"—"）
- **幂等保护**：目标新 E 文件已存在 → 拒绝执行，防止重复追加
- 写新 E 文件 → 删除旧 E 文件 → 重建 `_index.md`

**脚本输出**：单行 JSON，仅两种固定形态，不得额外扩展字段：

成功形态：

```json
{"status":"ok","data":{"old_file":"{旧文件名}","new_file":"{新文件名}","old_edition":"{旧E编号}","new_edition":"{新E编号}","added_ids":["D004"],"updated_ids":["D003"],"index_updated":true,"files_needing_ai_summary":["1.0.0/decision/…"]}}
```

失败形态：

```json
{"status":"error","data":{"message":"{错误原因}"}}
```

**处理分支**：如果 `status` 为 `error` → 向调用方展示 `data.message`，停止后续步骤，不写入任何文件；否则 → 进入「结果展示」节。

#### 结果展示（LLM 执行）

解析脚本 JSON，按以下模板向调用方展示：

```markdown
## ✅ 决策记录已更新 — {功能名} v{版本号}

**新文件**：{新文件名}（E{新编号}） | **追加条目**：{added_ids 列表} | **状态更新**：{updated_ids 列表}
```

填充规则：`{功能名}`、`{版本号}` 取自调用方传入参数；`{新文件名}`、`{新编号}` 取自 `new_file`、`new_edition` 字段；`{added_ids 列表}` 直接列出本次追加的 D 编号；`{updated_ids 列表}` 列出本次状态更新的 D 编号，其中含 `(未找到，跳过)` 标记的条目需提示调用方人工确认。

### action=view（手动查看）

1. Glob 扫描 `<version_dir>/decision/` 下的决策记录文件。
2. 取最大 E 编号文件 Read。
3. 向用户展示决策概览，格式如下：

```markdown
## 📋 决策记录概览 — {功能名} v{版本号}

**文件**：{文件名} | **最后更新**：{日期} | **决策条目**：{N} 条

### 状态索引

| 编号 | 标题 | 状态 | 关联 |
|:---|:---|:---|:---|
| D001 | {标题} | 已确认 | {关联} |
| D002 | {标题} | 条件触发 | {关联} |
| ... | ... | ... | ... |

---

输入决策编号（如 `D003`）查看完整条目详情，或输入 `q` 退出。
```

4. 当用户输入具体 D 编号时，从正文中提取该决策块的完整内容（从 `### {编号}` 到下一个 `### ` 或 `## 4.` 之间），以原文格式展示。
5. 当用户输入 `q` 时结束查看。

### action=add（手动新增）

1. 读取现有决策记录（取最大 E 编号）。
2. 交互式引导 PM 逐项输入，按以下话术模板：

```
AI：📝 新增决策条目 — 请逐项填写以下信息（输入 `q` 随时取消）：

1/6 决策标题（一句话概括本次决定）：
> [用户输入]

2/6 背景（1-3 句话说明为什么需要做这个决定）：
> [用户输入]

3/6 选项列表（列出候选方案，每行一个，以 A/B/C 开头）：
> [用户输入]

4/6 最终决定（选择哪个选项，或描述综合方案）：
> [用户输入]

5/6 决策理由（为什么选择这个决定，考虑了什么权衡）：
> [用户输入]

6/6 代价/风险（这个决定的已知代价或引入的风险，没有则填"无"）：
> [用户输入]
```

每步输入后校验：
- 标题为空 → 提示"标题不能为空，请重新输入"，最多重试 3 次；3 次后若仍为空则终止新增，提示"输入超时，已取消新增。"
- 决定为空 → 提示"决定不能为空，请重新输入"，同上重试逻辑。
- 其他字段可为空（写入时保留空值）。
- 输入 `q` → 终止新增，提示"已取消新增，决策记录未变更。"

3. 为新增条目分配 D 编号（可留空，由脚本自动分配下一个可用编号）。
4. 组装为决策条目 JSON，追加写入（**调用 `scripts/append-decisions.js`**，同 action=append 脚本化流程，见上文）。
5. 展示新增结果：
   > ✅ 已追加决策条目 D{N}：{标题}，保存为 {新文件名}。

## 命名规范

| 项目 | 格式 |
|:---|:---|
| 文件名 | `<功能名>_<版本号>_决策记录_E<编号>.md` |
| 保存目录 | `<顶级文件夹>/<版本号>/decision/` |
| 示例 | `电视比价_1.0.0_决策记录_E1.md` |

## 正误示例

### 正确示例

```
# 其他技能调用创建
log-decisions action=create version_dir=./账号系统/1.0.0 decisions_file=./账号系统/pmcraft/temp/dec.json source=write-brief brief_path=./账号系统/1.0.0/brief/账号系统_1.0.0_需求简报_E1.md func_name=账号系统 scene_type=全新功能 author=王五<1003>

# 其他技能调用追加
log-decisions action=append version_dir=./账号系统/1.0.0 decisions_file=./账号系统/pmcraft/temp/new_dec.json state_updates_file=./账号系统/pmcraft/temp/updates.json source=revise-from-meeting author=王五<1003>

# PM 手动查看
log-decisions action=view version_dir=./账号系统/1.0.0

# PM 手动新增
log-decisions action=add version_dir=./账号系统/1.0.0
```

### 错误示例

**错误**: PM 试图手动创建决策记录
```
log-decisions action=create version_dir=./账号系统/1.0.0
```
- 问题：`action=create` 仅限 `write-brief` 自动创建时使用，PM 手动 create 不被允许。PM 可用的交互模式是 `action=view` 查看和 `action=add` 新增。
- 正确做法：使用需求简报生成技能自动创建，或用决策记录技能向已有记录中追加。

**错误**: 直接传 JSON 字符串而非文件路径
```
log-decisions action=create decisions="[{\"id\":\"D001\",...}]" ...
```
- 问题：决策条目通过临时 JSON 文件传递，不直接在命令行传 JSON。
- 正确做法：先用 Write 写入临时 JSON 文件，再传入文件路径。

**错误**: 决策速览表状态列写成带文字格式
```
| D003 | 数据精度要求 | 95% 精度方案 | 精度 99% 不可行 | ✅ 已确认 |
```
- 问题：状态列写成「✅ 已确认」带文字，会污染「1. 基本信息」的元信息统计（脚本按 `✅ 已确认` 等带文字正则计数）。
- 正确做法：状态列只写裸符号（✅/⏳/❓/❌/⏸），如 `| D003 | 数据精度要求 | 95% 精度方案 | 精度 99% 不可行 | ❌ |`。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 |
| :--- | :--- | :--- |
| create 时 decision/ 目录不存在 | 首次创建 | 通过 pmcraft-req:save-doc 初始化目录，正常保存 |
| append 时无现有决策记录 | write-brief 未执行或已删除 | 提示「未找到决策记录文件」，建议先执行 write-brief |
| append 时 JSON 文件 JSON 解析失败 | 文件损坏或格式错误 | 报错并展示期望格式，不执行任何写入 |
| 状态更新引用了不存在的 D 编号 | state_updates 中包含无效 ID | 跳过无效条目，记录警告，继续处理其他条目 |
| 决策条目超过 50 条 | 长期迭代导致文件过长 | 正常追加，不截断。状态索引表保持完整 |
| PM 手动新增时输入了空标题 | 交互式输入为空 | 要求重新输入，最多重试 3 次；3 次后仍为空则终止新增，提示"输入超时，已取消新增，决策记录未变更" |
| 标题/代价含换行或多空白 | 决策条目字段带换行符 | 速览表单元格空白折叠为单个空格后按 30/40 字截断加"…"（脚本 cell() 归一化） |
| 决策条目 decision 为空或缺失 | 追加条目未提供最终决定 | 速览表结论列填"—"，不中断写入；正文正常记录，完整决定见「3. 决策条目」 |

## 常见错误

1. **试图手动 create** — 创建决策记录只能由 write-brief 内部调用触发，PM 手动只能 `action=add`。
2. **JSON 格式错误** — decisions_file 必须严格遵循定义的 JSON Schema，非法字段会被忽略。
3. **忽略 state_updates** — 追加时如需要推翻旧决策，必须同时传入 state_updates_file，否则旧决策保持原状态。

## 禁止行为

1. **禁止手动 create** — 创建决策记录只能由 `write-brief` 内部调用触发，PM 手动只能使用 `action=add` 追加或交互式新增。**例外：修订链路技能（revise-prd / revise-from-meeting / append-prd）在 `decision/` 无存量记录时允许先 `action=create` 兜底**（append-decisions.js 在无存量文件时拒绝 append，无此兜底则修订场景的首次决策记录会卡流程；兜底 create 的 `source` 取调用技能名，`brief_path` / `func_name` / `scene_type` 缺省时按版本目录上下文推断）
2. **禁止跳过 JSON Schema 校验** — decisions_file 必须严格遵循定义的 JSON Schema，必须校验所有必选字段（id、title、source、status、decision、reason）存在且非空；包含未定义字段的条目将被忽略并警告，不得静默写入
3. **禁止忽略 state_updates** — 追加时如需要推翻旧决策，必须同时传入 state_updates_file，否则旧决策保持原状态
4. **禁止跳过状态索引/决策速览同步** — 每次写入操作后，状态索引表与决策速览表必须与正文决策条目保持完全一致；决策速览状态列必须用裸符号（禁止"✅ 已确认"带文字格式，避免污染元信息统计）
5. **禁止在无现有记录时执行 append** — 追加前必须检测决策记录文件是否存在，不存在时提示先执行 `write-brief`
6. **禁止在 add 交互模式中接受空标题或空决定** — 核心字段为空时提示重新输入，最多重试 3 次；3 次后终止新增，不得以空值写入决策记录

## 注意事项
- `log-decisions` 是基础设施技能，不直接面向 PM 的日常操作。大多数情况下它由其他技能静默调用。
- E 编号递增依赖 pmcraft-req:save-doc 的扫描逻辑——追加时读当前最大 E 编号，写入时递增。
- 状态索引表是 AI 消费的关键入口——每次写入操作后必须保持其与正文完全一致。决策速览表是快速回顾入口（最新在前），由脚本自动维护。
- 被其他技能调用时，调用方负责准备决策条目的内容质量和完整性。本技能仅负责格式化和持久化。

## 参考模板
- 决策记录模板：`../../_shared/templates/decision_log_template.md`

## 评价测试用例

### 正向触发（7条）
1. `log-decisions action=create version_dir=./账号系统/1.0.0 decisions_file=./账号系统/pmcraft/temp/dec.json source=write-brief brief_path=./账号系统/1.0.0/brief/账号系统_1.0.0_需求简报_E1.md func_name=账号系统 scene_type=全新功能 author=王五<1003>` — 预期：创建决策记录文件，调用 pmcraft-req:save-doc 保存 E1
2. `log-decisions action=append version_dir=./账号系统/1.0.0 decisions_file=./账号系统/pmcraft/temp/new.json state_updates_file=./账号系统/pmcraft/temp/updates.json source=revise-from-meeting author=王五<1003>` — 预期：追加新条目 + 更新旧条目状态，E 编号递增，决策速览表同步新增行（最新在前）且状态列随状态更新变化
3. `log-decisions action=view version_dir=./账号系统/1.0.0`（手动查看） — 预期：展示状态索引表 + 决策概览
4. `log-decisions action=add version_dir=./账号系统/1.0.0`（手动新增） — 预期：交互式引导逐项输入，完成后追加
5. `log-decisions action=append` 同时推翻 D003 和追加 D006 — 预期：D003 正文更新为「已推翻」+ 推翻记录，D006 作为新条目插入，状态索引同步，决策速览表 D003 状态列变 ❌、D006 新行在表头分隔行后第一位
6. `log-decisions action=append`（新条目 decision 为单字母 + options、cost 超长） — 预期：决策速览表结论列展开为「字母（选项原文）」、影响列超 40 字截断加"…"、状态列裸符号；元信息「决策条目」统计与正文一致（未被速览表污染）
7. `log-decisions action=append`（source=revise-prd 原型同步评估，待确认条目） — 预期：追加条目 D 编号接续、状态索引新增 ❓ 待确认行、决策速览表新增行（❓），与普通 append 行为一致

### 负向触发（5条）
1. `log-decisions`（无任何参数） — 预期：提示需要指定 action 和必需参数
2. `log-decisions action=create`（缺少 version_dir 等必选参数） — 预期：提示缺少必选参数
3. `log-decisions action=append version_dir=./不存在/1.0.0`（无现有决策记录） — 预期：提示「未找到决策记录文件」
4. `log-decisions action=create version_dir=./账号系统/1.0.0`（手动 create 被禁止） — 预期：提示「action=create 不是有效的交互模式」
5. `log-decisions action=append decisions="[{...}]"` （直接传 JSON 字符串） — 预期：拒绝，提示通过临时 JSON 文件传递

### 边界查询（7条）
1. decisions_file 中包含一个缺失 `title` 字段的条目 + 两个正常条目 — 预期：校验失败条目被跳过并警告，正常条目继续写入
2. state_updates 中引用了不存在的 D999 — 预期：跳过该条，记录警告，继续处理其他有效条目
3. 连续 append 10 次后决策条目总数超过 50 条 — 预期：正常追加不截断，状态索引表保持完整
4. 存量决策记录缺「## 5. 决策速览」节时执行 append — 预期：脚本自动创建速览节并按状态索引回填（D 降序、结论/影响为"—"），随后插入新行
5. 条目 `cost` 为空或缺失 — 预期：决策速览表影响列填"—"；`decision` 超 30 字 — 预期：结论列截断加"…"
6. 新条目 `title`/`cost` 含换行符或多空白 — 预期：速览表对应单元格空白折叠为单空格、去换行后按 40 字截断加"…"，表格行结构不破坏
7. 新条目 `decision` 为空或缺失 — 预期：速览表结论列填"—"，其余列正常写入，写入不中断
