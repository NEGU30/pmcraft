---
name: initialize-structure
description: 在功能版本目录下创建 prototype/working/、prototype/working/components/ 和 prototype/reference/ 目录结构，支持从全局基准继承设计资产。当 PM 首次进入版本目录、说"初始化"（表述含"项目/升级/覆盖/pmcraft"时排除，走"启动pmcraft/升级pmcraft"路由）/"创建目录"时触发，或由 CLAUDE.md 项目路径检测自动调用。
type: skill
tags:
  - 目录初始化
  - 结构创建
  - init
  - structure
  - prototype
allowed-tools: [Read, Write, Bash, Glob, AskUserQuestion]
dependencies:
  - Node.js（LTS，scripts/initialize-structure.js 运行所需）
argument-hint: '[V版本路径]'
prompt: 初始化（表述含"项目/升级/覆盖/pmcraft"时排除，走"启动pmcraft/升级pmcraft"路由）|创建目录|initialize-structure
---

<!-- 机械操作（目录创建/基准继承/规范前递/非标准迁移）全部由 scripts/initialize-structure.js 完成。
     LLM 只负责：确定版本路径 → 运行脚本 → 交互决策 → 转述结果。脚本输出 JSON 格式是契约，勿改。 -->

# 目录初始化 (initialize-structure)

## 概述

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/initialize-structure/`），脚本路径一律由此锚定解析，不依赖 cwd。

在指定的版本目录下创建原型制作所需的目录结构：`prototype/working/`（工作区，含 `components/` 子目录）和 `prototype/reference/`（设计参考）。幂等操作，已存在的目录不覆盖。

**机械操作全部由 `scripts/initialize-structure.js` 完成**：
- 版本目录路径校验（存在性/末端格式）
- 存量结构识别（标准/非标准位置）
- 非标准位置迁移（`assets/prototype/` 等 → 根下 `prototype/`）
- 全局基准继承（`pmcraft/baseline/` 四件套）
- 设计规范前递（`pmcraft/specs/` 静默复制）
- 目录创建（状态 a/b/c/d 幂等处理）

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `--version-dir` | 目录路径 | 是 | 版本目录（版本号格式 1.0.0 / V1.0.0） | `C:/项目/手机卡领用/V1.0.0` |
| `--answers` | 字符串 | 否 | 交互决策（逗号分隔），见"交互决策点" | `inherit_baseline,no_migrate` |
| `--dry-run` | 标记 | 否 | 仅模拟，不写磁盘 | — |

## 触发方式

```
initialize-structure [V版本路径]
```

PM 说"初始化"、"创建目录"时触发。

## 工作流程

### 第一步：确定 V 版本路径

1. **如果** PM 提供了 V 版本路径 → 使用指定路径（PM 显式指定始终优先），跳过后续自识别和检测步骤。
2. **否则（PM 未指定路径），当前目录自识别**：检查当前工作目录名是否匹配 `[Vv]?\d+\.\d+\.\d+`（V 前缀可选且不区分大小写）。如果匹配 → 当前目录即版本目录，其父目录为功能顶级文件夹。直接采用，跳过后续检测和询问步骤。告知 PM："当前目录 {目录名} 即为版本目录，在此初始化。"
3. **否则** → 检测当前目录下的版本目录（匹配 `[Vv]?\d+\.\d+\.\d+` 格式，V 前缀可选），按检测结果分支：
   - **如果检测到一个或多个版本目录** → 列出让 PM 选择：
     > "检测到以下版本目录：1.0.0、1.1.0。在哪个版本下初始化？输入版本号或完整路径。"
   - **如果未检测到任何版本目录** → 提示：
     > "未检测到版本目录。请先创建版本目录（如 1.0.0），或输入完整路径。"

### 第二步：运行初始化脚本

运行（`--version-dir` 的值替换为第一步确定的版本路径，保留引号）：
```bash
node "{本技能源码目录}/scripts/initialize-structure.js" \
  --version-dir="{第一步确定的版本路径}"
```

> **参数安全（Bash 注入防护）**：`--version-dir` 版本路径来自 PM 输入（如"initialize-structure ./项目/V1.0.0"，用户输入），构造 Bash 命令前必须剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 修改表述）；路径值一律用双引号包裹后传入。含非法字符时以剔除后的路径提交并在结果展示中注明，不中断流程。

解析输出 JSON：
- `status: "ok"` → 按第三步确认模板展示
- `status: "interaction"` → 见"交互决策点"（收集决策后带 `--answers` 重调）
- `status: "error"` → 按错误处理展示

### 第三步：确认结果

按脚本返回的 `dirs` 字段展示创建的目录结构，并标注是新创建还是已存在：

```
已初始化 {version_dir}/prototype/
├── working/               ← {新创建 / 已存在}
│   └── components/        ← {新创建 / 已存在}
└── reference/             ← {新创建 / 已存在}

共创建 {N} 个目录。
```
- `{version_dir}`：脚本返回的实际版本目录路径
- `{N}`：脚本返回的 `created_count`

若 `baseline_inherited: true` → 追加标注"设计系统从全局基准继承"。
若 `specs_inherited: true` → 追加标注"设计规范从全局 specs 继承"。

## 交互决策点

脚本返回 `{"status":"interaction","data":{"ask":...,...}}`，LLM **调用 `AskUserQuestion` 工具**（如可用）询问 PM；**备选（工具不可用时）**：按下方「LLM 询问」列文案逐条纯文本询问。收集后带 `--answers` 重调脚本：

| data.ask | 触发条件 | LLM 询问 | 传回参数 |
|:---|:---|:---|:---|
| `version_dir_missing` | 版本目录不存在 | "路径 {路径} 不存在，需要先创建该目录吗？" | `--answers=create_dir` |
| `confirm_nonversion` | 路径末端非版本格式 | "路径末端不太像版本目录，确定继续？" | `--answers=confirm_nonversion` |
| `nonstandard_migrate` | 检测到非标准位置 prototype/ | "检测到现有 prototype/ 位于非标准路径 {路径}。建议迁移到 prototype/ 后继续。需要我帮你迁移吗？" | `--answers=migrate` 或 `no_migrate` |
| `baseline_inherit` | 全局基准四件套完整（含 2.1a 缺资产场景） | "检测到全局基准设计系统（pmcraft/baseline/）。从全局基准复制到当前版本即可直接使用，无需重新抽取设计。" | `--answers=inherit_baseline` 或 `no_baseline` |

> 注意：若 PM 在 `baseline_inherit` 选了"不用"，LLM 需在重调时带 `--answers=no_baseline`，脚本会记录拒绝状态，后续 2.1a 不再重复询问。

## 输出

| 产出 | 路径 | 用途 |
|------|------|------|
| working/ | `{V版本路径}/prototype/working/` | 原型工作区，所有技能产物写入此处（优先从全局基准 `pmcraft/baseline/` 继承） |
| working/components/ | `{V版本路径}/prototype/working/components/` | 可复用的组件模板 |
| reference/ | `{V版本路径}/prototype/reference/` | 设计参考文件，extract-design 产物写入此处 |

## 禁止行为

1. **禁止越权创建版本目录** — 只创建 prototype/ 下的子目录，不创建版本目录本身（由 PM 或 save-doc 创建）
2. **禁止覆盖已有内容** — 幂等操作：已存在的目录/文件一律跳过，不覆盖、不清空、不重建
3. **禁止修改 .claude/ 与版本目录外文件** — 只操作 prototype/ 目录
4. **禁止静默迁移** — 非标准位置的 prototype/ 迁移必须经 PM 确认（`--answers=migrate`），不静默在旧位置使用或创建重复目录
5. **禁止跳过基准继承询问** — 全局基准（pmcraft/baseline/）四件套完整时须经 PM 确认是否继承，不得直接复制或直接跳过

## 错误处理

| 场景 | LLM 展示 |
|:---|:---|
| `error: 缺少 --version-dir` | "请指定版本目录路径。" |
| `error: 版本目录不存在` | "路径不存在。请确认路径或先创建目录。" |
| 脚本执行异常（node 不可用 / 抛异常 / 输出非 JSON） | 向 PM 报告失败原因，不创建任何目录、不伪造 JSON 结果 | "初始化失败：{原因}。" |

## 成功示例

### 示例 1：指定路径（含 V 前缀）

**PM 输入：**
> initialize-structure ./手机卡领用/V1.0.0

**助手动作：**
1. 确认路径 `./手机卡领用/V1.0.0`
2. 运行脚本 → 创建目录 → 展示结果

**助手输出（严格按第三步模板渲染）：**

```
已初始化 C:/项目/手机卡领用/V1.0.0/prototype/
├── working/               ← 新创建
│   └── components/        ← 新创建
└── reference/             ← 新创建

共创建 3 个目录。
```

### 示例 2：当前目录自识别

**场景：** 当前工作目录为 `./手机卡领用/1.0.0/`

**助手动作：**
1. 检测到当前目录名 `1.0.0` 匹配版本格式
2. 告知 PM："当前目录 1.0.0 即为版本目录，在此初始化。"
3. 运行脚本 `--version-dir=./手机卡领用/1.0.0` → 创建目录 → 展示结果

### 示例 3：全局基准继承

**场景：** `pmcraft/baseline/` 四件套完整

**助手动作：**
1. 运行脚本 → 返回 `interaction`（`baseline_inherit`）
2. 询问 PM → PM 选"继承使用"
3. 带 `--answers=inherit_baseline` 重调 → 复制四件套 + 创建目录
4. 展示结果并标注"设计系统从全局基准继承"

## 错误示例

**错误示例：不询问版本直接创建**
> "已在当前目录下创建 prototype/working/。"

**问题**：没有确认目标版本目录，可能在错误位置创建目录。

**正确做法**：先确定版本路径（优先自识别当前目录），再创建。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 | 回复模板 |
|:---|:---|:---|:---|
| 当前目录即版本目录 | 当前工作目录名匹配 `[Vv]?\d+\.\d+\.\d+` | 自动采用，跳过询问 | "当前目录 {目录名} 即为版本目录，在此初始化。" |
| 目录已存在且完整 | `prototype/working/`、`working/components/`、`reference/` 三个目录均存在 | 跳过创建，输出幂等确认 | "目录已就绪，无需重复初始化。\n共创建 0 个目录。" |
| 目录存在但不完整 | `prototype/working/` 存在但缺 `components/` 或 `reference/` | 补建缺失目录，报告补建数量 | "目录已就绪（补建了 {N} 个缺失目录）。" |
| `prototype/` 存在但 `working/` 不存在 | save-doc 已创建 prototype/ 或旧版本遗留 | 在现有 prototype/ 下创建 working/ 子目录，不动已有文件 | （见第三步确认模板） |
| `prototype/` 位于非标准路径 | `assets/prototype/`、`static/prototype/` 等子目录 | 脚本返回 `nonstandard_migrate`，询问 PM 是否迁移 | "检测到 prototype/ 位于非标准路径 {路径}，建议迁移到根下。需要我帮你迁移吗？(Y/N)" |
| 全局基准有完整四件套 | `pmcraft/baseline/` 存在 `source/` + `framework/` + `DESIGN.md` + `design-system.css` | 脚本返回 `baseline_inherit`，询问 PM 是否继承 | "检测到全局基准 pmcraft/baseline/ 已有完整设计系统。复制到当前版本 {V目标} 即可直接使用。(Y/N)" |
| 全局基准不完整 | `pmcraft/baseline/` 存在但缺部分四件套 | 正常创建空目录，不提示继承；缺省项后续由 set-style 或 extract-design 生成 | （静默跳过） |
| 全局 specs 非空 | `pmcraft/specs/` 存在且至少一个 .md 文件 | 静默复制到 `prototype/specs/`，不询问 PM | "检测到全局设计规范，已复制到当前版本 prototype/specs/。" |
| 全局 specs 为空 | `pmcraft/specs/` 不存在或无 .md 文件 | 静默跳过，不影响流程 | （静默跳过） |
| 非标准位置迁移中途失败 | 复制失败（权限不足/磁盘空间不足） | 脚本报错，报告失败原因 | "迁移失败：{原因}。prototype/ 将在标准位置另建。" |
| 末端路径非版本格式 | PM 指定的路径末端不匹配 `[Vv]?\d+\.\d+\.\d+` | 脚本返回 `confirm_nonversion`，提示但不阻断 | "路径末端不太像版本目录（预期如 1.0.0、V1.0.0 或 v1.0.0）。确定继续？(Y/N)" |
| 目标路径不存在 | 版本目录不存在 | 脚本返回 `version_dir_missing`，询问是否创建 | "路径不存在，需要先创建该目录吗？(Y/N)" |
| 无版本目录 | 未检测到版本目录 | 提示创建版本目录 | "未检测到版本目录。请先创建版本目录（如 1.0.0）。" |
| 多个版本目录 | 检测到多个版本 | 列出让 PM 选择 | "检测到以下版本目录：{列表}。在哪个版本下初始化？" |
| 当前目录名匹配但 PM 拒绝 | 自识别后 PM 表示"不是这个目录" | 回退到手动询问模式 | "好的，请指定目标版本目录路径。" |
| 版本路径含 shell 元字符（`'`、`"`、`$`、`;`、`&`、`|` 等） | PM 指定的 `--version-dir` 路径含非法字符 | 剔除元字符后以剔除版路径提交，不中断流程，并在结果展示中注明 | "（转述操作结果，并注明已剔除非法字符）" |

## 快速参考

| 场景 | 操作 |
|:---|:---|
| 指定版本初始化（含 V） | `initialize-structure ./项目/V1.0.0` |
| 指定版本初始化（无 V） | `initialize-structure ./项目/1.0.0` |
| 交互式初始化 | `initialize-structure`（自动检测或询问） |
| 重新初始化 | 再次运行，已存在目录不覆盖 |

## 评价测试用例

### 正向触发（6条）
1. `initialize-structure ./手机卡领用/V1.0.0`（指定路径，含 V 前缀）— 预期：创建目录，展示结果
2. `initialize-structure ./手机卡领用/1.0.0`（指定路径，无 V 前缀）— 预期：创建目录，展示结果
3. `initialize-structure`（当前目录名匹配版本格式，自识别）— 预期：自动采用，无需询问
4. `initialize-structure`（交互式，检测到多个版本目录）— 预期：列出版本目录让 PM 选择
5. 同一路径重复执行两次 — 预期：第二次输出"共创建 0 个目录"
6. 目标路径下有 save-doc 创建的空 `prototype/`（无 `working/`）— 预期：状态 d，补建 working/

### 负向触发（5条）
1. `initialize-structure`（未检测到任何版本目录）— 预期：提示"请先创建版本目录"
2. PM 指定末端非版本格式路径 → PM 拒绝 — 预期：退出，不创建
3. 目标路径不存在 → PM 拒绝创建目录 — 预期：退出
4. `initialize-structure ./不存在/1.0.0`（父目录不存在）— 预期：询问是否创建路径，拒绝则退出
5. 检测到全局基准有完整四件套 → PM 拒绝继承 — 预期：正常创建空目录，标注"未继承"

### 边界查询（4条）
1. 当前目录名匹配版本格式 → 自识别生效 — 预期：不询问 PM，直接进入创建
2. 非标准位置 `assets/prototype/` → PM 确认迁移 → 父目录 `assets/` 为空 — 预期：移动文件 + 删除空父目录
3. 非标准位置 `assets/prototype/` → PM 确认迁移 → 父目录 `assets/` 还有其他内容 — 预期：移动文件 + 保留父目录
4. `prototype/working/` 存在但缺 `reference/`（不完整）— 预期：补建缺失的 reference/，报告"补建了 1 个缺失目录"
