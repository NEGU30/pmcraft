---
name: init-project
description: 一键在项目中注册 pmcraft 路由大脑，创建版本目录和 pmcraft/ 骨架。当新项目首次使用 pmcraft、或需要初始化项目时说"启动pmcraft"、"初始化项目"、"pmcraft init"时触发；当插件升级、需要把最新模板同步到老项目时说"升级pmcraft"、"更新pmcraft"时触发。
type: skill
tags:
  - 初始化
  - 升级
  - pmcraft
  - 项目脚手架
  - infrastructure
  - bootstrap
  - project-setup
allowed-tools: [Read, Write, Bash, Glob, AskUserQuestion]
dependencies:
  - Node.js（LTS，init-project.js 运行所需；缺失时按「Plan B」手动初始化）
  - pmcraft 共享库（_shared/scripts/lib，脚本启动时从自身位置向上查找；cache 环境需 setup.cmd Sync-SharedLibrary 分发，缺失时脚本直接报错并提示运行 setup.cmd → 按「Plan B」手动初始化）
argument-hint: '[版本号]'
prompt: 启动pmcraft|初始化项目|init-pmcraft|pmcraft init|升级pmcraft|更新pmcraft|pmcraft升级|覆盖初始化
---

<!-- 脚本实现见本技能 scripts/init-project.js（Node.js 版）。脚本输出 JSON 格式是契约，勿改。 -->

# 项目初始化 (init-project)

## 概述

机械操作（目录创建、文件复制、标题替换、差异比对、备份覆盖）全部由本技能 `scripts/init-project.js` 完成（模板 assets/ 动态定位）。LLM 只负责：运行脚本 → 解析 JSON 输出 → 必要时交互（多版本选择 / 升级四选一）→ 转述结果。

**双模式**：
- **普通模式**（`init`）——幂等初始化：已存在的文件全部跳过，只补充缺失的
- **升级模式**（`--upgrade`）——同步插件最新模板：差异检测 → 确认 → 备份并覆盖

**一句话**：说"启动pmcraft"，脚本自动完成。说"升级pmcraft"，备份并同步最新模板。

## 输入

| 输入 | 说明 | 必填 |
|---|---|---|
| 项目根路径 | 用户指明的项目目录；未指明时取当前会话工作目录。通过 `--root=` 传给脚本，脚本不依赖 cwd | 是 |
| 版本号 | 用户输入（如 `V1.0.0`）；未指定默认 `1.0.0`。**必须符合 `X.Y.Z` 格式**（`V` 前缀可有可无，脚本统一去除）；LLM 先校验格式，不合法则不传给脚本 | 否 |
| 升级动作 | 升级模式下用户四选一：① 备份后全部覆盖 ② 仅覆盖 agents ③ 仅备份 ④ 取消 | 仅升级模式 |

## 主流程

0. **定位脚本**：脚本路径 = `{技能目录}/scripts/init-project.js`（技能目录 = 本 SKILL.md 所在目录，即插件 `skills/init-project/`）。若脚本不可用（node 缺失 / 命令报错 / 返回非 JSON）→ **直接进入 Plan B**，不尝试补跑。

1. 确定项目根（用户指明的目录；未指明则取当前会话工作目录），运行 `node {技能目录}/scripts/init-project.js check --root={项目根}`，解析输出（**必须传 `--root`**，脚本不依赖 cwd）：
   - **路径卫生（必须）**：`--root` 来自用户输入（外部输入），拼入 Bash 命令前须先拒绝含 shell 元字符（`;` `&` `|` `$` `` ` `` 或换行）的路径并请用户重新提供；命令中的路径一律用双引号包裹（如 `--root="C:/项目/账号系统"`），禁止裸插值。也可改用 `Glob` 工具先校验路径存在再构造命令。
   - `status: "ready"`（data: project/version/root）→ 已就绪，转述一行摘要即可（如用户只要求初始化）
   - `status: "need_init"`（data: root/missing）→ **自动运行** `node {技能目录}/scripts/init-project.js init --root={项目根}`（域意图即授权，不询问），转述 `init_ok` 摘要——**转述必须包含重启会话提醒**（固定文案见输出模板，防止漏掉）
   - `status: "multi"`（data: candidates，完整路径数组，元素为版本目录路径）→ **调用 `AskUserQuestion` 工具**（如可用）让用户选版本目录（选项显示目录名）；**备选（工具不可用时）**：纯文本编号列出候选目录让用户选，然后运行 `node {技能目录}/scripts/init-project.js init --version={所选版本} --root={所选版本目录的上级目录（项目根）}`（版本号取所选目录名去 `V` 前缀；两者必须同时传——缺 root 脚本报错、缺 version 脚本回退 multi 询问；脚本对误传版本目录路径为 root 有防御性规整），转述摘要
   - `status: "silent"` → 非 pmcraft 项目，不打扰，直接提示"未检测到可初始化的 pmcraft 项目"
   - `status: "error"` → 转述错误

2. 版本号规则：未指定时默认 `1.0.0`。用户指定版本号时，**先校验格式**（正则 `^[Vv]?\d+\.\d+\.\d+$`，与脚本 VERSION_RE 一致）：合法 → 传给脚本（`V` 前缀由脚本统一去除）；不合法（如 `V2.0`、`最新版`）→ 不传给脚本，告知用户格式要求并回退默认 `1.0.0`。

## 升级模式（`--upgrade`）

1. 确定项目根（与主流程同规则），运行 `cd {项目根} && node {技能目录}/scripts/init-project.js --upgrade --action=diff`（**升级模式不支持 `--root`，脚本以 cwd 为检测起点，必须显式 `cd` 到项目根；`cd` 中的项目根同样来自用户输入，路径卫生与校验同主流程第 1 步「路径卫生」规则（或用 `Glob` 先校验路径存在再构造命令）**），解析差异清单：
   - `status: "all_same"` → 输出"模板文件与插件已一致，无需升级"
   - `status: "diff"`（data.diffs: [{file, state}]) → 列出清单（区分 CLAUDE.md / agents）
   - `status: "multi"`（多版本目录）→ 见「边缘情况处理」表——升级模式不支持多版本目录项目（脚本无 `--version`/`--root` 可消歧，任何 cwd 位置都会重新命中 multi）
2. **调用 `AskUserQuestion` 工具**（如可用）让用户四选一；**备选（工具不可用时）**：纯文本编号列出 ①-④ 让用户选：
   - **① 备份后全部覆盖**（推荐）——CLAUDE.md + 有差异的 agents 全部用模板覆盖
   - **② 仅覆盖 agents，保留 CLAUDE.md**——CLAUDE.md 被用户本地定制过时选此项
   - **③ 仅备份，不覆盖**——只留档，不动项目文件
   - **④ 取消**——不执行任何写入
3. 运行 `cd {项目根} && node {技能目录}/scripts/init-project.js --upgrade --action=backup-overwrite|agents-only|backup-only`（对应①②③；④直接结束），转述 `upgrade_ok`（含 `backup_dir`）摘要，包含回滚方式（将备份目录文件复制回项目根与 .claude/agents/ 即可还原）。**转述必须包含重启会话提醒**（固定文案见输出模板，防止漏掉）。

禁止行为（备份失败终止、不删多余 agent 文件、不碰 lessons.md/baseline/specs/版本目录）由脚本强制，LLM 无需判断。

> ⚠️ 升级模式的 `--upgrade` 是唯一以 `--` 开头的 mode，运行命令时须放在参数第一位（`cd {项目根} && node ... --upgrade --action=diff`）。

## 输出模板

所有交互完成后，按以下格式转述结果（逐行替换 `{占位符}`，禁止保留未填充占位符）：

```markdown
✅ {初始化|升级}完成：{项目名}（{版本号}）
- 项目根：{root 路径}
- 创建/覆盖：{CLAUDE.md、9 个 agents、版本目录等清单}
- 升级备份：{backup_dir 路径，仅升级模式输出；普通模式删除此行}
- 回滚方式（仅升级模式）：将备份目录中文件复制回项目根与 .claude/agents/ 即可还原
- 下一步：{建议动作，如"说『写需求』开始需求工程"}
- ⚠️ 请重启 Claude Code 会话（完全退出后重新打开），使项目级 .claude/agents/ 下的 9 个 agents（含 doc-reviewer / design-reviewer）生效；重启前审查类技能将降级执行
```

**升级模式变体**（`upgrade_ok` 只输出 backup_dir）：删除 `（{版本号}）` 与 `{创建/覆盖}` 两行；`{项目名}` 取当前目录名（上下文推导，非脚本输出）；转述内容只有 backup_dir + 回滚方式 + 重启提醒。

**摘要原则（二分规则）**：
1. **契约字段**（status/root/project/version/backup_dir/diffs/missing/candidates）——必须严格来自脚本 JSON 输出，缺哪个就不写哪个。
2. **固定常量**——普通模式的 `{创建/覆盖}` 行允许描述脚本的确定性产物（CLAUDE.md、9 个 agents、版本目录、pmcraft/ 骨架（含 baseline/、specs/、temp/）——脚本固定创建，行为确定）；**禁止**出现契约字段与固定常量之外的任何路径或数字（如"创建了 3 个新文件"、"备份了 9 个 agents"——后者为脚本未输出的备份明细）。

## Plan B（脚本不可达时）

若 `init-project.js` 不可用（如插件缓存场景），按以下步骤手动降级：

1. 用 Glob 搜索候选 `CLAUDE.md` 文件（Glob 只匹配文件名、不匹配内容），逐个读取检查是否含 `pmcraft-brain` 标记，含标记者即为 pmcraft 模板根目录（可能是插件 `assets/`，也可能是老项目根）。
2. 将模板根目录 `agents/`（若不存在则用 `.claude/agents/`）下 9 个 agent 文件复制到目标项目 `.claude/agents/`。
3. 读取模板根目录 `CLAUDE.md`（路由大脑模板），复制到目标项目根，替换标题为项目名；同时把 `{插件根}` 占位符替换为插件根绝对路径（向上找第一个含 `_shared/scripts/stop-services.js` 的祖先目录）。
4. 如目标项目已有 CLAUDE.md（升级场景）→ 先备份到 `pmcraft/backup/` 再覆盖；普通模式 → 若已存在则跳过。
5. 创建 `pmcraft/` 骨架目录（`baseline/`、`specs/`、`temp/`）与 `pmcraft/lessons.md`（缺失时才写）——`temp/` 为过程性审查产物/临时文件区。
6. 复制完成后，告知用户重启会话使 agents 生效（与输出模板相同文案）。
7. 如果 Glob 未找到任何候选 `CLAUDE.md`，或读取后均不含 `pmcraft-brain` 标记 → 告知用户"未找到 pmcraft 模板源，无法初始化"。

## 禁止行为

1. **禁止越权创建下级目录** — 不创建 `brief/`、`prd/`、`prototype/` 等版本目录下的产出目录，由下游技能按需创建。例外：`pmcraft/temp/` 属 pmcraft 骨架（与 baseline/、specs/ 同级，脚本固定创建），不在此条限制内
2. **禁止覆盖已有产物** — 普通模式幂等：已存在文件全部跳过，绝不覆盖；升级模式只覆盖 10 个模板文件（CLAUDE.md + 9 个 agents），且须经用户四选一确认
3. **禁止在备份失败后继续覆盖** — 升级模式备份门禁：备份失败立即终止，不执行任何覆盖
4. **禁止触碰 `pmcraft/` 其余内容及版本目录** — 升级覆盖面严格限定模板文件，不涉及 lessons.md/baseline/specs/temp/版本目录
5. **禁止把非法版本号传给脚本** — 格式与校验规则见主流程第 2 步「版本号规则」（与脚本 VERSION_RE 一致），不合法回退默认 `1.0.0` 并告知
6. **禁止静默选择版本目录** — `multi` 状态必须让用户选择（优先用 AskUserQuestion，不可用时纯文本编号列出候选），绝不静默选第一个
7. **禁止转述脚本未输出的信息** — 摘要只输出契约字段（status/root/project/version/backup_dir 等）与固定常量，不输出额外路径或数字（如"创建了 3 个新文件"）

## 约束

1. **项目名从目录名推断** — 不做额外确认

## 边缘情况处理

| 场景 | 处理 |
|---|---|
| `check` 返回 `silent`（非 pmcraft 项目） | 不打扰，提示"未检测到可初始化的 pmcraft 项目"，不执行 `init` |
| `check`/`init` 返回 `multi`（多版本目录） | 让用户选择版本目录（优先用 AskUserQuestion，不可用时纯文本编号列出候选），绝不静默选第一个 |
| `--root` 指向不存在或不可写的路径 | 不存在：`check` 返回 `need_init`（视为新项目，`init` 会创建完整目录树）；不可写（`init` 阶段目录创建失败）→ 脚本返回 `error`（如"初始化失败"），转述错误并提示检查路径 |
| 用户指定非法版本号（如 `V2.0`、`最新版`） | 不传给脚本；告知格式要求（`X.Y.Z`）并回退默认 `1.0.0` |
| 升级 `diff` 返回 `all_same` | 输出"模板文件与插件已一致，无需升级"，不执行覆盖 |
| 升级模式返回 `multi`（多版本目录） | 升级模式**不支持**多版本目录项目：`doUpgrade` 无 `--version`/`--root` 参数，从项目内任何位置运行都会检测到多个版本目录并返回 `multi`（无法消歧、无法推进）。直接告知用户该限制，并建议：将多余版本目录暂移出项目根（仅保留目标版本目录）后重试升级，或取消 |
| 脚本不可达（node 缺失/报错） | 降级 Plan B（见上文）：Glob 找候选 CLAUDE.md → 读取验证 `pmcraft-brain` 标记 → 手动初始化 |
| 用户请求模糊（未指明项目且上下文看不出目标） | 先以当前工作目录为项目根运行 `check --root` 探明状态，再按状态分支，不臆断 |

## 示例

### 正例：普通模式初始化 ✅

**输入**：`启动pmcraft`

**执行**：运行 `check --root={项目根}` → `status: "need_init"` → 自动运行 `init --root={项目根}` → 解析 JSON（project/version/root）→ 输出：

```markdown
✅ 初始化完成：账号系统（1.0.0）
- 项目根：c:/dev/账号系统
- 创建/覆盖：CLAUDE.md、9 个 agents、版本目录 1.0.0/
- 下一步：说「写需求」开始需求工程
- ⚠️ 请重启 Claude Code 会话（完全退出后重新打开），使项目级 .claude/agents/ 下的 9 个 agents（含 doc-reviewer / design-reviewer）生效；重启前审查类技能将降级执行
```

> "创建/覆盖"行描述的是脚本**固定常量**产物（CLAUDE.md、9 个 agents、版本目录、pmcraft/ 骨架——脚本确定性创建），属于摘要原则第 2 类，允许转述；不是 JSON 输出字段。

### 反例：转述脚本未输出的信息 ❌

**输入**：`升级pmcraft` → 脚本返回 `upgrade_ok`（backup_dir: `pmcraft/backup/20260818-094713`，格式 `YYYYMMDD-HHMMSS`，同日多轮追加 `_2`、`_3` 后缀）

**错误转述**：
> "✅ 升级完成：账号系统（1.0.0）。备份了 CLAUDE.md 和 9 个 agents 到 backup 目录，创建了 3 个新文件。"

**错误原因**：三处违规——① "备份了 9 个 agents"是脚本未输出的备份明细（备份实为 CLAUDE.md + 9 个 agent 共 10 个文件，但 `upgrade_ok` 不输出明细）；② "创建了 3 个新文件"是凭空推测的数字；③ "（1.0.0）"——升级模式没有版本号概念，`upgrade_ok` 未输出 version 字段。违反摘要原则：契约字段必须来自 JSON，禁止输出契约字段与固定常量之外的路径或数字。

**正确转述**（`{项目名}` 取当前目录名，其余仅转述 backup_dir；重启提醒按输出模板固定文案）：
> "✅ 升级完成：账号系统。备份目录：pmcraft/backup/20260818-094713。回滚：将备份目录文件复制回项目根与 .claude/agents/ 即可。⚠️ 请重启 Claude Code 会话（完全退出后重新打开），使项目级 .claude/agents/ 下的 9 个 agents（含 doc-reviewer / design-reviewer）生效；重启前审查类技能将降级执行。"

## 评价测试用例

> 注：脚本级行为（目录创建、文件复制、差异比对、备份覆盖）由 `scripts/init-project.js` 输出契约覆盖，回归验证用临时目录演练。以下用例仅评估 LLM 的「脚本输出解析 → 路由决策」行为。

### 正向触发（7 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `启动pmcraft` | 运行 `check --root={项目根}`，按 `status` 分支执行（ready/need_init/multi/silent） |
| 2 | `初始化项目` | 同 1，进入主流程 |
| 3 | `pmcraft init` | 同 1，进入主流程 |
| 4 | `升级pmcraft` | 在项目根运行 `--upgrade --action=diff`，按 diff/all_same 分支 |
| 5 | `更新pmcraft`（含 `--upgrade` 参数） | 进入升级模式四选一流程 |
| 6 | `初始化完成`（need_init → init_ok） | 转述包含重启会话提醒 |
| 7 | `把 c:/dev/xx 初始化了`（指明非当前目录） | `check --root=c:/dev/xx` 指向该目录，按状态分支 |

### 负向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `跑测试`（无初始化意图） | 不触发，路由到其他技能 |
| 2 | `写 PRD`（无初始化意图） | 不触发，路由到 req 域 |
| 3 | `解释这段代码` | 不触发，提示非技能场景 |
| 4 | 普通模式重复执行 | 幂等——已存在产物不覆盖（脚本契约保证） |
| 5 | 升级模式 `status: all_same` | 不执行覆盖，输出"模板文件与插件已一致，无需升级" |

### 边界查询（6 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `status: multi`（多版本目录） | 让用户选择（优先用 AskUserQuestion，不可用时纯文本编号列出候选），绝不静默选第一个 |
| 2 | `--upgrade` 且备份失败 | 立即终止，不执行任何覆盖（脚本门禁） |
| 3 | 脚本不可达（node 缺失/报错） | 降级 Plan B：Glob 找候选 CLAUDE.md → 读取验证 `pmcraft-brain` 标记 → 手动初始化 |
| 4 | 升级模式调用时 cwd 不在项目根 | 违反指引（升级须在项目根运行）；LLM 应先 `cd` 到项目根再运行 |
| 5 | `check` 返回 `silent`（非 pmcraft 项目） | 提示"未检测到可初始化的 pmcraft 项目"，不执行 `init` |
| 6 | 用户指定非法版本号（如 `初始化到 2.0`） | 校验失败 → 提示格式要求（`X.Y.Z`），回退默认 `1.0.0` 并告知 |
