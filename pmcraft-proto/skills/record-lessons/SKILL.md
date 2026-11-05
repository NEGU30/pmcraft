---
name: record-lessons
description: 管理 pmcraft/lessons.md 中的易错点规则。增删改查 lesson 条目、去重检查、同类修正检测。当 PM 说"记下这条"、"查看 lesson"、"删掉 lesson"、"清空 lesson"时触发。
type: skill
tags:
  - 经验记录
  - lessons
  - lesson
  - learning
  - quality
  - prototype
allowed-tools: [Read, Write, Glob, Bash]
dependencies:
  - Node.js（LTS，scripts/record-lessons.js 运行所需；缺失时转述"操作失败"并提示检查 Node.js 环境）
argument-hint: <操作> [内容]
prompt: 记下这条|查看 lesson|删掉 lesson|清空 lesson|record-lessons
---

<!-- 机械操作（lessons.md 增删改查/编号重排/精确去重）全部由 scripts/record-lessons.js 完成。
     LLM 只负责：确定路径 → 运行脚本 → 语义去重判断 → 交互决策 → 转述结果。脚本输出 JSON 格式是契约，勿改。 -->

# 经验记录 (record-lessons)

## 概述

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/record-lessons/`），脚本路径一律由此锚定解析，不依赖 cwd。

管理 `pmcraft/lessons.md` 中的易错点规则。lessons.md 是智能体级别的跨会话持久化设计经验库，位于 `pmcraft/` 项目配置根目录下——记录"这个项目上按钮应该用直角""这里不能用 emoji 做图标"等反复出现的修正模式。build-prototype 在生成/修改时第一步自动读取并应用。

**定位**：record-lessons 只管 lessons.md 的增删改查和同类检测，不插手 build-prototype 的生成逻辑。build-prototype 只读 lessons.md，record-lessons 只写，边界清晰。

**机械操作由 `scripts/record-lessons.js` 完成**：add/list/delete/edit/clear、编号重排（删除后自动从 1 连续）、精确匹配去重（规范化后相同判定重复）。
**保留 AI 判断**：语义去重（措辞不同但规则等价）——脚本发现"疑似相似"条目时返回候选，LLM 判断。

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `--file` | 文件路径 | 是 | lessons.md 路径 | `C:/项目/账号系统/pmcraft/lessons.md` |
| 操作 | `add` / `list` / `delete` / `edit` / `clear` | 是 | 对 lessons.md 执行的动作 | `add` |
| 内容 | 字符串 | 否 | add/edit 时的规则描述；delete 时为编号 | `"按钮默认使用 6px 圆角"` |
| `--answer` | 字符串 | 否 | 交互确认（clear 时 `confirm`，add 疑似重复时 `confirm_add`） | `confirm` |

## 调用方式

> **参数安全（Bash 注入防护）**：规则描述/新描述来自 PM 用户输入（如"记下这条：xxx"），构造 Bash 命令前必须剔除 `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 修改表述），全部参数值用双引号包裹后传入。含非法字符时以剔除后的内容提交并在结果展示中注明，不中断流程。

```bash
node "{本技能源码目录}/scripts/record-lessons.js" --file="C:/项目/账号系统/pmcraft/lessons.md" add "规则描述"
node "{本技能源码目录}/scripts/record-lessons.js" --file="..." list
node "{本技能源码目录}/scripts/record-lessons.js" --file="..." delete 3
node "{本技能源码目录}/scripts/record-lessons.js" --file="..." edit 2 "新描述"
node "{本技能源码目录}/scripts/record-lessons.js" --file="..." clear [--answer=confirm]
```

## 工作流程

### 第一步：确定项目路径

从 CLAUDE.md 上下文获取功能顶级文件夹和版本号。如果无法确定，询问 PM。如果确定的项目目录下没有 `pmcraft/` 目录 → 提示 PM 项目未初始化，建议说「启动pmcraft」初始化。

lessons.md 路径：`pmcraft/lessons.md`（智能体级别，项目内跨版本共享）——`{功能顶级文件夹}/pmcraft/lessons.md`

### 第二步：按操作执行

#### add — 追加规则

1. 运行脚本 `add "规则描述"`。
2. 脚本返回：
   - `ok` → 已添加，转述"已添加到 lesson：{规则描述}"
   - `error: "该规则已存在"` → 提示 PM："该规则已存在（第 {N} 条：{已有描述}），无需重复添加。"
   - `interaction: similar_exists` → 脚本检测到语义疑似重复（规范去重未命中但高度相似），LLM 判断是否等价：
     - 等价 → 提示 PM："该规则与第 {N} 条（{已有描述}）相似，是否仍然添加？"（PM 确认则带 `--answer=confirm_add` 重调）
     - 不等价 → 直接带 `--answer=confirm_add` 重调添加

#### list — 查看全部

1. 运行脚本 `list`。
2. `ok` 且 `count: 0` → "当前没有已记录的 lesson。"
3. 否则按编号展示全部规则。

#### delete — 删除指定条目

1. 运行脚本 `delete <编号>`。
2. `ok` → "已删除第 {N} 条：{描述}"
3. `error`（编号不存在）→ "第 {N} 条不存在，当前共 {M} 条规则。"

#### edit — 编辑指定条目

1. 运行脚本 `edit <编号> "新描述"`。
2. `ok` → "已更新第 {N} 条：{旧描述} → {新描述}"
3. `error` → 同 delete 兜底处理。

#### clear — 清空全部

1. 运行脚本 `clear`。
2. `interaction: clear_confirm` → "lessons.md 当前有 {N} 条规则，确认全部清空？(Y/N)"，PM 确认则带 `--answer=confirm` 重调；拒绝则"已取消。"
3. `ok` → "已清空全部 {N} 条 lesson 规则。"
4. 文件不存在或为空 → 脚本报错，转述"当前没有已记录的 lesson，无需清空。"

#### check — 同类修正检测（LLM 执行，脚本不参与）

check 模式由**主对话**在修改场景中感知到反复出现的同类修正模式时主动调用（**非 build-prototype 自动触发**——build-prototype 不调用本技能，见「成功示例 2」），传入本次修改的简要描述。**此模式全由 LLM 在 session 内存维护计数器**：

1. 读取 `pmcraft/lessons.md`：如果已有规则已经覆盖了本次修改 → 静默返回（已记录过，无需再问）。
2. 在当前 session 内维护一个同类修正计数器（按 `{元素}+{属性}+{方向}` 三元组归类）。每次 check 调用时，将本次修改的模式与计数器中的已有记录比对：
   - 如果没有同类记录 → 记录本次模式，静默返回（第 1 次，不追问）。
   - 如果已有同类记录（第 2 次）→ 提示 PM："检测到 2 次相同的修正模式（{描述}），是否记入 lessons.md？"
   - PM 确认 → 调用脚本 `add` 写入，并重置该模式的计数器。
   - PM 拒绝 → 重置该模式的计数器，标注"已跳过，不会再问。"
3. 计数器仅在当前 session 有效，新会话从零开始。

**同类判断标准**（本技能定义）：
- 修改目标元素同类（匹配到 HTML 标签级别：如均为 `<button>`、均为 `<table>`。同一标签的不同 variant——如"主按钮"与"次按钮"——视为同类元素；`<button>` 与 `<a class="btn">` 视为同类）
- 修改属性同类（如均为圆角、均为颜色、均为间距、均为字体等。`border-radius` 与 `border` 是不同属性；`color` 与 `background-color` 是不同属性）
- 修改方向同类（如均为"加圆角"、均为"去掉圆角"、均为"替换颜色"等。方向指变更趋势，非目标值）
- 三项均满足视为同类。一项不满足则非同类。

## 输出

### 输出总则

1. 所有答复必须严格使用下方对应操作的模板原文，仅替换 `{占位符}`，不附加额外解释或修饰语。
2. 占位符数据来源契约：`{规则描述}`/`{描述}`/`{旧描述}`/`{新描述}` 等必须取自脚本 JSON 返回字段，`{N}`/`{M}` 为条目编号与总数——禁止编造或改写。
3. 脚本返回 `error`/`interaction` 状态时，按对应操作分支与边缘情况表中的固定话术回复。

### add 输出模板

```
已添加到 lesson：{规则描述}
```

### delete 输出模板

```
已删除第 {N} 条：{描述}
```

### edit 输出模板

```
已更新第 {N} 条：{旧描述} → {新描述}
```

### clear 输出模板

```
已清空全部 {N} 条 lesson 规则。
```

### check 输出模板（触发阈值时）

```
检测到 2 次相同的修正模式（{描述}），是否记入 lessons.md？
```

### list 输出模板

```
当前 lessons.md 共 {N} 条规则：

1. {规则描述}
2. {规则描述}
...
```

## 与上下游的衔接

| 来源 | 调用时机 | 传入内容 |
|------|---------|---------|
| CLAUDE.md 路由 | PM 说"记下这条"/"查看 lesson"/"删掉 lesson"/"清空 lesson" | 操作 + 内容 |
| 主对话（可选衔接） | 主对话在修改中感知到反复同类修正模式时主动调用（非 build-prototype 自动触发） | check 模式 + 修改摘要 |

| 下游 | 读取内容 | 说明 |
|------|---------|------|
| build-prototype（第一步） | `pmcraft/lessons.md` | 生成/修改前自动读取，应用所有规则 |

## 禁止行为

1. **禁止自动写入 lesson** — 即使 check 模式检测到同类修正达到阈值，也必须经 PM 确认后才写入
2. **禁止重复添加相同规则** — add/edit 前必须与已有规则比对（脚本精确去重 + LLM 语义去重双层）
3. **禁止跨层侵入** — build-prototype 只读 lessons.md，record-lessons 只写，不修改 build-prototype 的消费逻辑
4. **禁止破坏编号约定** — list/delete/edit 编号均从 1 开始，与文件行号解耦（空行不计入编号）
5. **禁止写入非标准格式** — lessons.md 每行一条 `- {规则描述}`，空行忽略不计
6. **禁止绕过脚本直接修改 lessons.md** — 所有写操作（增/删/改/清空/编号重排）必须通过 `scripts/record-lessons.js` 完成，不得直接 Read/Write 文件本体（check 模式的读取检查除外）

## 约束

1. **跨会话持久化** — lessons.md 存储在 `pmcraft/` 下，不随 E 版本存档复制。写入后永久有效，build-prototype 在新会话中自动读取。
2. **脚本输出是契约** — `scripts/record-lessons.js` 返回的 JSON 结构（`ok`/`error`/`interaction` 状态及字段）不得修改，LLM 只读取字段、按契约分支处理并转述，不得绕过脚本另起读写逻辑。

## 成功示例

### 示例 1：PM 直接添加

**PM：**
> 记下这条：所有主按钮默认使用 6px 圆角

**流程：**
1. CLAUDE.md 路由层检测到"记下这条"→ 运行脚本 `add "所有主按钮默认使用 6px 圆角"`
2. 脚本返回 ok → 追加写入
3. 按输出模板答复："已添加到 lesson：所有主按钮默认使用 6px 圆角"

### 示例 2：同类修正自动检测 → 确认后记录

**场景：** build-prototype edit 完成——PM 连续第 2 次要求改按钮圆角

**流程：**
1. build-prototype edit 完成后（**主对话可选衔接，非 build-prototype 自动调用**——build-prototype 不触发本技能，主对话在修改中感知到反复出现的同类修正模式时主动调用）→ 调 `record-lessons check "P1 提交按钮圆角从 4px 改为 6px"`（LLM 执行）
2. 读取 lessons.md → 无相关规则
3. 检查 session 计数器 → 上次 check 已记录了"按钮+圆角+加大"模式（第 1 次）
4. 判定为同类修正第 2 次 → 提示 PM
5. PM 确认 → 运行脚本 `add "提交按钮圆角统一使用 6px"` → "已添加到 lesson：提交按钮圆角统一使用 6px"

### 示例 3：PM 查看并删除

**PM：**
> 查看 lesson

**流程：**
1. 运行脚本 `list` → 展示 3 条规则
2. PM："删掉第 2 条"
3. 运行脚本 `delete 2` → "已删除第 2 条：卡片禁止嵌套"

## 错误示例

**错误 1**：去重检查失效，重复添加相同规则
```
add "按钮用 6px 圆角"（lessons.md 已有"按钮默认 6px 圆角"）
```
问题：措辞不同但规则等价，脚本精确去重未命中时 LLM 未做语义判断。正确：脚本返回 `similar_exists` 后 LLM 判断等价，提示 PM"该规则与第 1 条（按钮默认 6px 圆角）相似，是否仍然添加？"，PM 确认后再带 `--answer=confirm_add` 重调添加。

**错误 2**：check 达到阈值后未经 PM 确认即自动写入
```
检测到 2 次按钮圆角修正 → 直接写入 lessons.md
```
问题：违反禁止行为 1——lesson 写入必须经 PM 确认。正确：提示 PM 确认后再写入。

**错误 3**：delete 后未重新编号
```
删除第 2 条后保留编号 1、3、4 的断层
```
问题：编号断层导致后续操作混乱。正确：脚本删除后自动从 1 重新编号。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 | 回复模板 |
| :--- | :--- | :--- | :--- |
| lessons.md 不存在 | 任何操作时文件未创建 | 脚本视同空文件；add 时自动创建 | "（静默创建）" |
| lessons.md 为空 | 文件存在但无内容 | 视同无规则 | "当前没有已记录的 lesson。" |
| 删除不存在的编号 | PM 指定了超出范围的编号 | 脚本报错，提示范围不匹配 | "第 {N} 条不存在，当前共 {M} 条规则。" |
| add 相似但措辞不同 | 新规则与已有规则语义高度相似 | 脚本返回 `similar_exists`，LLM 判断是否等价：等价 → 告知 PM 判断依据并询问确认；不等价 → 直接重调添加（`--answer=confirm_add`） | "该规则与第 {N} 条（{已有描述}）相似，是否仍然添加？(Y/N)" |
| check 达到阈值但 PM 拒绝 | PM 说"不需要" | 跳过，同 session 不再追问同类模式 | "已跳过，不会再问。" |
| check 检测不到同类模式 | 单次孤立修改 | 静默返回 | "（静默返回）" |
| lessons.md 已有规则覆盖了本次修改 | check 时发现已记录 | 静默返回 | "（静默返回）" |
| PM 说"记下这条"但无具体内容 | 只说了"记下这条" | 追问具体内容 | "要记下什么规则？例如：记下这条：按钮默认使用 6px 圆角" |
| record-lessons 无操作参数 | 未提供 add/list/delete/edit/clear 任一操作 | 询问要执行的操作 | "要执行什么操作？add / list / delete / edit / clear" |
| 规则描述含 shell 元字符（引号、`$`、`;`、`&`、`|` 等） | add/edit 时参数含非法字符 | 剔除元字符后以剔除版提交，不中断流程，并在结果展示中注明 | "（转述操作结果，并注明已剔除非法字符）" |
| clear 时 PM 取消 | PM 在确认环节拒绝 | 退出不执行任何操作 | "已取消。" |
| 同类修正计数器因跨调用丢失 | record-lessons 作为独立 Agent 调用，session 计数器未在调用间传递 | 计数器归零，同类检测退化为"每次都是第 1 次"——不影响 lessons.md 已有规则的静默跳过，但会漏检跨调用的同类修正模式 | "（静默——计数器重置，不影响正确性但影响检测灵敏度）" |
| 脚本执行失败 | node 缺失 / 脚本路径错误 / 输出非 JSON | 转述"操作失败：{原因}"，不伪造结果、不绕过脚本直写 lessons.md，提示检查 Node.js 环境后重试 | "操作失败：{原因}。请确认 Node.js 环境后重试。" |

## 评价测试用例

### 正向触发（5 条）

1. `record-lessons add "按钮默认使用 6px 圆角"` — 预期：追加到 lessons.md，回复已添加
2. `record-lessons list`（lessons.md 有 3 条规则）— 预期：展示 1/2/3 编号列表
3. `record-lessons delete 2`（lessons.md 有 3 条规则）— 预期：删除第 2 条，重新编号
4. `record-lessons edit 1 "按钮默认使用 8px 圆角"` — 预期：替换第 1 条内容
5. `record-lessons clear` → PM 确认 — 预期：清空文件

### 负向触发（5 条）

1. `record-lessons delete 5`（lessons.md 只有 3 条）— 预期："第 5 条不存在，当前共 3 条规则。"
2. `record-lessons add "按钮使用 6px 圆角"`（lessons.md 已有"按钮默认用 6px 圆角"）— 预期：脚本返回 `similar_exists`，LLM 判断后提示重复
3. `record-lessons clear`（lessons.md 为空）— 预期："当前没有已记录的 lesson，无需清空。"
4. `record-lessons`（无参数）— 预期：追问要执行什么操作
5. `record-lessons edit 5 "新描述"`（lessons.md 只有 3 条）— 预期："第 5 条不存在，当前共 3 条规则。"

### 边界查询（3 条）

1. lessons.md 不存在时 `list` — 预期："当前没有已记录的 lesson。"
2. lessons.md 不存在时 `add` — 预期：自动创建文件并写入
3. `check` 检测到第 2 次同类修正但 PM 拒绝记录 — 预期："已跳过，不会再问。"（同 session 不再追问同类模式）
