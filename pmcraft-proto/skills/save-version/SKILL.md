---
name: save-version
description: 版本存档。将 prototype/working/ 中的原型产物复制到 prototype/E{编号}/ 目录并生成 CHANGELOG.md。支持 --main 标记将版本提升为主分支。当 PM 说"保存原型"、"存档"、"交付"时触发。
type: skill
tags:
  - 版本存档
  - 快照
  - version
  - save
  - deliver
  - prototype
allowed-tools: [Read, Write, Glob, Bash, AskUserQuestion]
dependencies:
  - Node.js（LTS，scripts/save-version.js 运行所需；缺失时检查 node 与脚本路径后重试，仍失败则告知 PM 存档中止）
  - pmcraft-req 插件（_index.md 索引更新复用其 scripts/save-doc.js 的 IndexOnly 模式；随 setup.cmd 全套安装，缺失时脚本报错并提示重跑 setup.cmd）
argument-hint: '[--main] [E编号]'
prompt: 保存原型|保存版本|存档|交付|save-version
---

<!-- 机械操作（E编号检测/文件复制/CHANGELOG累积/main同步/索引更新）全部由 scripts/save-version.js 完成。
     LLM 只负责：运行脚本 → 解析 JSON → 交互决策 → 转述结果。脚本输出 JSON 格式是契约，勿改。 -->

# 版本存档 (save-version)

## 概述

将 prototype/working/ 目录中的当前原型产物（页面、设计系统、页面清单）复制到 prototype/E{编号}/ 存档目录（如 E1、E2、E3），同时生成或更新变更记录。存档位置固定在当前版本的 prototype/ 下。

支持 `--main` 标记：当指定 `--main` 时，存档完成后额外将产物同步到 `prototype/main/` 目录，作为主分支的快照（部署和分享时优先使用 main/ 而非 E 目录）。

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/save-version/`），脚本路径一律由此锚定解析，不依赖 cwd。

**机械操作全部由 `scripts/save-version.js` 完成**：
- E 编号检测（最大+1、断层检测）
- working/ 必须文件检查
- 按排除规则复制（spec.md / preview.html* / feedback.md / .dead/ / mock/.server.pid）
- CHANGELOG 累积追加（保留全部历史）
- main/ 同步（清空覆盖）
- _index.md 索引更新（复用 save-doc.js 的 IndexOnly 模式）

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `--version-dir` | 目录路径 | 是 | 版本目录（含 prototype/ 的目录） | `C:/项目/账号系统/1.0.0` |
| `--e-number` | 字符串 | 否 | 版本编号，不传则自动建议下一个 | `E2` |
| `--main` | 标记 | 否 | 存档后同步到 prototype/main/ | — |
| `--changelog-new` | 字符串 | 否 | CHANGELOG 新增条目（逗号分隔多个） | `新增登录页,新增注册页` |
| `--changelog-changed` | 字符串 | 否 | CHANGELOG 修改条目 | `优化配色` |
| `--changelog-fixed` | 字符串 | 否 | CHANGELOG 修复条目 | `修复按钮错位` |
| `--author` | 字符串 | 否 | 负责人（写入索引） | `张三` |
| `--answers` | 字符串 | 否 | 交互决策（逗号分隔），见"交互决策点" | `e_ok,no_main` |
| `--dry-run` | 标记 | 否 | 仅模拟，不写磁盘 | — |

## 触发方式

```
save-version [--main] [E编号]
```

PM 说"保存原型"、"存档"、"交付"时自动触发。如 PM 提供了 E 编号（如"保存 E2"）则直接使用；否则自动检测现有目录并建议下一个。

## 工作流程

### 第一步：解析参数

1. 解析 PM 是否指定了 `--main` 或 E 编号，记录结果。
2. 确定 `--version-dir`：如果 PM 提供了路径，直接采用；否则从当前工作目录向上遍历，找到含 `prototype/` 的版本目录。如果遍历未找到，则询问 PM 提供版本目录路径。
3. 收集 CHANGELOG 内容：`--changelog-new` / `--changelog-changed` / `--changelog-fixed`（PM 未指定变更内容时，新增条目用"原型存档"）。
   - **参数安全（Bash 注入防护）**：PM 提供的变更描述属于用户输入，构造 Bash 命令前必须剔除 `"` `\`` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 修改表述），全部参数值用双引号包裹后传入。含非法字符时以剔除后的内容提交并在结果展示中注明，不中断流程。

### 第二步：运行存档脚本

运行：
```bash
node "{本技能源码目录}/scripts/save-version.js" \
  --version-dir="C:/项目/账号系统/1.0.0" \
  [--e-number=E2] [--main] \
  [--changelog-new="..."] [--changelog-changed="..."] [--changelog-fixed="..."] \
  [--author="张三"]
```

解析输出 JSON，按 `status` 字段分流：
- 如果 `status: "ok"` → 按输出模板展示结果。
- 如果 `status: "interaction"` → 见第三步（交互决策）。
- 如果 `status: "error"` → 按"错误处理"表展示对应提示。
- 如果脚本无法启动（node 缺失、脚本路径错误等）→ 检查 `node` 命令与脚本路径，修复后重试；仍失败则告知 PM 存档中止。

### 第三步：交互决策（脚本返回 interaction 时）

脚本返回 `{"status":"interaction","data":{"ask":"archive_confirm",...}}`，data 中**可能包含多个待决策项**（每个可选）。LLM **调用 `AskUserQuestion` 工具**（如可用）逐项询问 PM；**备选（工具不可用时）**：按下方「LLM 询问」列文案逐条纯文本询问。收集全部决策后**一次重调脚本**（携带 `--e-number` / `--main` / `--answers`）：

| data 字段 | 含义 | LLM 询问 | 传回参数 |
|:---|:---|:---|:---|
| `e_confirm` | 自动建议 E 编号确认 | "建议保存为 E{n}，确认或输入其他编号？" | `--e-number=E{n}` 或用户输入值 |
| `gap` | 检测到编号断层 | "检测到编号断层（E{n} 目录不存在）。是填补 E{n} 还是从 E{n+1} 继续？" | `--answers=fill_<n>` 或 `--answers=continue_<n>` |
| `overwrite` | 目标 E 目录已存在 | "目标目录 E{n} 已存在，是否覆盖？" | `--answers=overwrite`（拒绝则中止存档） |
| `missing` | working/ 缺必须文件 | "以下文件缺失：{列表}。确定继续保存？" | `--answers=continue_missing`（拒绝则中止） |
| `main_sync` | 是否同步 main/ | "要标记为主分支吗？标记后部署和分享会默认使用这个版本。" | `--answers=sync_main` 或 `--answers=no_main` |

**重调时携带全部已确定参数**（--version-dir / --e-number / --main / --changelog-* / --answers），脚本完成存档。

### 第四步：结果展示

按输出模板展示。若 PRD 存在（`data.prd_status !== "none"`），按第五步（出口衔接）逻辑引导 PM 衔接 req 域。

### 第五步：出口衔接（话术库 NEXT-PROTO）

存档完成后，按原型流水线下一环输出（不新开会话，域内推进）：

> "原型已保存到 prototype/E{编号}/。下一步：
> ① UX 审查（review-ux，针对最新 E{N}，说「审查原型」）
> ② 设为主分支并部署（save-version --main → deploy-prototype，说「保存并设为主分支」）
> 直接说对应关键词即可。"（**NEXT-PROTO 模板**，话术库，见 CLAUDE.md「话术模板库」节）

**PRD 已存在时按"是否成为交付基线"分流**（断点 7，条件断）——依据脚本返回的 `main_synced` / `main_exists` / `prd_status` 判定：

| 条件 | 出口 |
|------|------|
| `prd_status === "none"`（PRD 缺失） | **NEXT-PROTO 常规出口（UX 审查 + 主分支部署）+ 追加回切提示**（断点 #4，见下）——UX 审查是本流水线一环（CLAUDE.md 流水线：save-version → review-ux 针对 E{N}），不应被回切提示跳过；回切 PRD 建议在 UX 审查完成之后 |
| PRD 存在 且（`main_synced === true` **或** `main_exists === false`） | 追加一致性同步提示（本次存档**已成为交付基线**——升 main 或尚无 main，check-consistency 的对比对象与当前快照一致） |
| PRD 存在 且 `main_synced === false` 且 `main_exists === true` | 仅常规出口，**不**推荐一致性检查（纯 E 快照存档，main 基线未变，check-consistency 对比的是旧 main，提示会误导） |

追加一致性同步提示（话术可依据 `prd_status` 微调：`ahead` 表示 PRD 较新、`behind` 表示原型较新）：

> "检测到 PRD 已存在。原型新版本可能使 PRD 失真，建议执行 check-consistency 校验一致性（说「一致性检查」）。"

**PRD 缺失时追加回切提示**（断点 #4，默认必切，但在 NEXT-PROTO 常规出口之后——先 UX 审查再回切）：

> "原型已完成，但 PRD 缺失。UX 审查完成后可回切生成 PRD（读取简报+原型，说「生成 PRD」）——默认必切，建议新开会话执行，上下文更干净。若需直通开发，请与开发确认接受无 PRD 的简化交接。"（**NEXT-PRD-BACK 模板**，话术库，见 CLAUDE.md「话术模板库」节）

## 输出模板

存档完成后必须按以下格式回复。**不得修改模板结构**，仅替换 `{占位符}`：

```
已保存到 prototype/E{编号}/
共 {文件总数} 个文件。
版本记录已更新。
```

`--main` 模式或 PM 选择标记主分支时，追加一行：

```
已同步到 prototype/main/（主分支快照）。
```

索引更新成功时追加 `📊 _index.md 已更新。`；失败时追加 `⚠️ 索引更新失败：{原因}。下次 save-doc 时会自动补建。`

占位符填充规则：
- `{编号}`：脚本返回的 `e_number` 去掉 `E` 前缀后的数字（如 `e_number=E2` → `{编号}=2`）
- `{文件总数}`：脚本返回的 `file_count`

**CHANGELOG 条目模板**（脚本自动生成，追加或新建）：

```markdown
## E{编号}（{YYYY-MM-DD}）

### 新增
- {新增页面或功能}

### 修改
- {修改内容}

### 修复
- {修复问题}
```

## 交互决策点（速查）

| 场景 | 脚本返回 | LLM 动作 | 重调参数 |
|:---|:---|:---|:---|
| 自动建议编号 | `data.e_confirm` | 确认或改编号 | `--e-number=...` |
| 编号断层 | `data.gap` | 填补/跳过 | `--answers=fill_2` / `continue_5` |
| 目录已存在 | `data.overwrite` | 覆盖确认 | `--answers=overwrite` |
| 缺必须文件 | `data.missing` | 继续/取消 | `--answers=continue_missing` |
| 是否同步 main | `data.main_sync` | 标记/暂不 | `--answers=sync_main` / `no_main` |

## 禁止行为

1. **禁止询问保存路径** — 存档位置固定在 `prototype/E{编号}/`，不再询问
2. **禁止不输出 CHANGELOG** — 每次存档必须有变更记录，不能只存文件不留记录
3. **禁止使用非 E 编号格式** — 统一 `E+数字`（大写 E），e1、V1 等一律纠正后保存
4. **禁止修改原文件** — 从 prototype/working/ 复制，不移动不删除 working/ 中的文件
5. **禁止自行生成页面代码** — 只从 prototype/working/ 复制快照，不代行 build-prototype 的职责
6. **禁止直接跳号** — 编号必须连续；断层时须向 PM 确认"填补断层还是从下一编号继续"，不自动跳号也不自动补号
7. **禁止重复保存同一版本号** — 目标 E 目录已存在时，必须询问覆盖确认
8. **禁止非模板格式回复** — 存档完成后必须严格按"输出模板"格式回复，下游自动化解析依赖固定格式
9. **禁止只往 E 目录打零散 patch** — 已归档 E 目录的 Bug 修复必须整体覆盖重存整个 E 目录（含 CHANGELOG 更新）
10. **禁止 E 存档失败后仍同步 main/** — `--main` 仅在 E 目录存档成功后执行

## 错误处理

| 脚本返回 | LLM 展示 |
|:---|:---|
| `error: "还没有原型文件"` | "还没有原型文件，请先生成原型再保存。" |
| `error: "working/ 下没有可存档的交付文件"` | "working/ 下没有可存档的交付文件，请先生成原型再保存。" |
| `error: "E 编号格式错误"` | "E 编号格式应为 E1、E2、E3 等。请重新输入。" |
| `error: 版本目录不存在` | "版本目录不存在，请确认路径。" |

## 成功示例

### 示例 1：指定 E 编号（正常流程）

**PM 输入：**
> save-version E2

**助手动作：**
1. `--e-number=E2` 运行脚本。
2. 无待决策项，脚本直接存档成功（`status: ok`）。

**助手回复（按输出模板）：**
> "已保存到 prototype/E2/
> 共 8 个文件。
> 版本记录已更新。"

### 示例 2：未指定 E 编号（自动建议 + 交互确认）

**PM 输入：**
> save-version

**助手动作：**
1. 运行脚本 → 返回 `interaction`（`e_confirm` 建议 E2，无 main 标记时还有 `main_sync`）。
2. 询问 PM："建议保存为 E2，确认或输入其他编号？" → PM 确认。
3. 询问 PM："要标记为主分支吗？" → PM 选"暂不标记"。
4. 携带 `--e-number=E2 --answers=no_main` 重调 → 存档成功。

**助手回复：**
> "建议保存为 E2，确认或输入其他编号？"
> （PM 确认后）
> "已保存到 prototype/E2/
> 共 8 个文件。
> 版本记录已更新。"

### 示例 3：使用 --main 标记

**PM 输入：**
> save-version --main E3

**助手动作：**
1. `--e-number=E3 --main` 运行脚本。
2. 存档 E3 + 同步 main/ + 更新索引。

**助手回复（按输出模板）：**
> "已保存到 prototype/E3/
> 共 8 个文件。
> 版本记录已更新。
> 📊 _index.md 已更新。
> 已同步到 prototype/main/（主分支快照）。"

### 示例 4：缺少文件但 PM 确认继续

**PM 输入：**
> save-version E3

**助手动作：**
1. 脚本返回 `interaction`（`missing` 缺 page-inventory.md）。
2. 询问 PM → PM 同意继续。
3. 携带 `--e-number=E3 --answers=continue_missing` 重调 → 存档成功。

**助手回复（按输出模板）：**
> "页面清单 page-inventory.md 缺失，确定继续保存？(Y/N)"
> （PM 确认后）
> "已保存到 prototype/E3/
> 共 7 个文件。
> 版本记录已更新。"

## 错误示例

**错误示例 1：询问保存路径**
> "保存到哪个路径？"
>
> **问题**：save-version 的保存位置固定在 prototype/ 下，无需询问。违反禁止行为 1。
>
> **正确做法**：直接保存到 prototype/E{编号}/，不询问路径。

**错误示例 2：保存时不生成 CHANGELOG**
> "文件已复制。"
>
> **问题**：版本之间无法追溯变更内容。违反禁止行为 2。
>
> **正确做法**：每次存档都生成或更新 CHANGELOG.md（脚本自动完成）。

**错误示例 3：直接从原型模板生成文件而非从 prototype/working/ 复制**
> （助手自己创建 index.html 写入版本目录）
>
> **问题**：save-version 只负责快照，页面内容由 build-prototype 在 prototype/working/ 中维护。违反禁止行为 5。
>
> **正确做法**：只从 prototype/working/ 复制，不自行生成页面代码。

**错误示例 4：使用错误编号格式**
> "好的，保存到 e1 版本。"
>
> **问题**：格式不统一，后续版本管理混乱。违反禁止行为 3。
>
> **正确做法**：纠正格式为 E1，确保所有版本统一大写 E + 数字。

**错误示例 5：跳号保存**
> "已有 E1、E2，您说的是 E4，直接保存。"
>
> **问题**：跳过 E3 造成版本断层。违反禁止行为 6。
>
> **正确做法**：提示 PM "当前最新版本为 E2，建议保存为 E3"，不跳号。

**错误示例 6：自定义回复格式（违反输出模板）**
> "完成！已将文件保存到 E2，共 8 个文件。版本记录已更新。"
>
> **问题**：回复内容虽然传递了信息，但格式不符合输出模板。违反禁止行为 8。下游自动化解析依赖固定格式。
>
> **正确做法**：严格按"已保存到 prototype/E{编号}/"三行格式回复。

**错误示例 7：--main 在 E 目录存档失败时仍执行同步**
> E 目录写入失败，但仍将旧 main/ 覆盖。
>
> **问题**：违反禁止行为 10（--main 仅在 E 存档成功后执行），main/ 同步依赖于 E 存档成功。
>
> **正确做法**：E 存档失败时，main/ 同步不执行，并告知 PM。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 |
|:---|:---|:---|
| prototype/working/ 不存在 | 调 save-version 但未生成原型 | 提示"还没有原型文件，请先生成原型再保存"，退出 |
| 保存目录已存在 | 同一 E 编号重复保存 | 脚本返回 `overwrite` 交互，询问覆盖确认 |
| PM 不记得当前 E | PM 说"随便"、"你定" | 脚本自动检测已有 E 目录，建议下一个（`e_confirm`） |
| working/ 缺必须文件 | 某个必须文件不存在 | 脚本返回 `missing` 交互，询问是否继续 |
| E 编号格式错误 | 输入 e1、V1、版本2 等 | 脚本报错，提示重新输入 |
| 保存失败 | 磁盘空间不足/权限拒绝 | 脚本报错，展示具体原因 |
| 脚本无法启动 | node 缺失/脚本路径错误 | 检查 node 命令与脚本路径，修复后重试；仍失败则告知 PM 存档中止 |
| PM 取消保存 | PM 选择不覆盖或中途取消 | 退出不执行任何写操作 |
| working/ 中 framework/ 存在 | 存量项目含框架壳目录 | 自动纳入存档列表，不额外提示（脚本静默处理） |
| working/ 中 spec.md / preview.html / feedback.md 存在 | 工作参考文件 | 脚本按排除规则跳过 |
| working/ 中 .dead/ 存在 | 废弃文件归档目录 | 脚本按排除规则跳过 |
| 存档后发现 Bug 并修复了 working/ | PM 要求同步修复到已存档 E 目录 | 整体覆盖重存整个 E 目录（含 CHANGELOG 更新），不得只复制单个文件 |
| E 编号断层 | 中间 E 目录被手动删除 | 脚本返回 `gap` 交互，向 PM 确认填补/跳过 |
| working/ 仅有排除文件 | 无交付文件 | 脚本报错"working/ 下没有可存档的交付文件" |
| --main 时 main/ 已存在 | 前一次 --main 存档已创建 main/ | 脚本清空 main/ 后完整覆盖写入，不询问 |
| 索引更新失败 | save-doc.js IndexOnly 调用失败 | 不阻塞存档流程，回复追加失败提示 |

## 评估测试用例

### 正向触发（5条）

1. `save-version E2`（prototype/working/ 中文件齐全）→ 预期：脚本存档到 E2，更新 CHANGELOG，按输出模板回复
2. `save-version`（已有 E1）→ 预期：脚本建议 E2，LLM 询问 PM 确认后存档
3. `save-version`（无任何 E 目录）→ 预期：脚本建议 E1（无交互，直接存档）
4. 保存时检测到上一版本 CHANGELOG（E1 存在）→ 预期：追加新记录，保留全部历史
5. PM 确认存档后正常保存 → 预期：保存到 prototype/E{编号}/

### 负向触发（5条）

1. `save-version`（prototype/working/ 不存在）→ 预期：脚本报错"还没有原型文件"
2. PM 说"随便"（不确认 E 编号）→ 预期：脚本建议下一个，LLM 确认后存档
3. 保存目录已存在且 PM 选择不覆盖 → 预期：退出，不执行写操作
4. `save-version`（prototype/working/ 中缺少 pages/ 目录）→ 预期：脚本返回 `missing`，询问"以下文件缺失：pages/，确定继续保存？"
5. PM 输入的 E 编号格式错误（如"e1"）→ 预期：脚本报错"E 编号格式错误"

### 边界查询（5条）

1. 保存目录已存在且 PM 选择覆盖 → 预期：覆盖保存，更新 CHANGELOG
2. 首次保存时无上一版本 CHANGELOG → 预期：新建 CHANGELOG，写入首条记录
3. prototype/working/ 中有 framework/ 目录（存量场景）→ 预期：一并复制到 E 目录，无额外提示
4. （新增）存档后回复不按模板格式 → 预期：Grader 检测到格式偏离，标记为违规
5. （新增）node 缺失导致脚本无法启动 → 预期：检查 node 与脚本路径，修复后重试；仍失败则告知 PM 存档中止

## 快速参考

| 场景 | 操作 |
|:---|:---|
| 指定 E 编号保存 | `save-version E2` |
| 自动建议 E 编号 | `save-version` |
| 保存并提升为主分支 | `save-version --main E3` |
| 取消保存 | 在覆盖确认时选 N |
| 格式纠正 | 输入 e1、V1 等非标准格式时自动纠正 |
| 回复格式 | 按"输出模板"三行格式，不得自定义 |
