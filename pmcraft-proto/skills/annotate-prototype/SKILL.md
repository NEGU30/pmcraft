---
name: annotate-prototype
description: 为原型页面生成/刷新"标注层"——规则（spec R 编号）、状态（页面状态矩阵）、交互流程（跳转链路）、PRD 用例溯源四类标注，程序员可直接在原型上看到交互流程和规则，无需手动点击对齐 PRD。当 PM 说"加标注"、"加个标注"、"标注一下"、"更新标注"、"更新一下标注"、"标注模式"、"补充标注"、"重新标注"、"改一下标注"、"改标注"、"标注改一下"、"标注更新一下"、"开始标注"、"开始做标注"时触发，或由 build-prototype 第八步A / extend-html 收尾 / save-doc PRD 保存后自动衔接。
type: skill
tags:
  - 原型标注
  - 标注层
  - 规则标注
  - PRD溯源
  - annotation
  - prototype
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
argument-hint: '[build|refresh] [页面|all]'
prompt: 加标注|加个标注|标注一下|更新标注|更新一下标注|标注模式|补充标注|重新标注|改一下标注|改标注|标注改一下|标注更新一下|开始标注|开始做标注|annotate-prototype
---

# 原型标注层生成 (annotate-prototype)

## 概述

为 `prototype/working/pages/*.html` 生成标注层资产，让程序员直接在原型上看到交互流程和业务规则，无需手动点击对齐 PRD。四类标注：

| 类型 | 数据源 | 说明 |
| :--- | :--- | :--- |
| 规则标注（rule） | spec.md「核心业务规则」 | R 编号规则锚定到对应元素，气泡显示规则原文 |
| 状态标注（state） | spec.md「页面状态矩阵」（缺失降级 page-inventory） | 触发条件 / UI 表现 / 用户操作 |
| 流程标注（flow） | page-inventory.md 跳转表 + 链路图（extend-html 逐页条目格式降级为每页「跳转」字段） | 本页交互步骤 + 出口跳转 |
| PRD 溯源（prd 字段） | prd/ 最新 E{N} | 规则 → 用例N / 章节的语义匹配，refresh 时填充 |

**运行时机制**：标注 DOM 全部由 `annotations-runtime.js` 运行时注入（默认隐藏、右下角「规则和状态标注」「流程标注」两个开关控制，各自独立开合、可同时开启），静态 HTML 零痕迹 → check-quality 现有检查零误报。

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/annotate-prototype/`）。本文件中共享标注资产路径（`{本技能源码目录}/../../_shared/annotations/annotations.css`、`annotations-runtime.js`）一律以本技能源码目录为基准解析，不依赖 cwd。

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| 模式 | 字符串 | 否 | build（首次生成）/ refresh（PRD 定稿后更新） | `build`、`refresh` |
| 目标页面 | 字符串 | 否 | all / 页面名 | `all`、`login` |

**调用方式**：`annotate-prototype [build|refresh] [all|页面名]`。build 模式读取 spec.md + page-inventory.md，首次**全量**生成；refresh 模式在此基础上读取 PRD 补溯源，**增量刷新、全量兜底**——目标页 = 调用方指定 ∪ 基线（`prototype/.last-check.json`，详见第十步）比对变化页（mtime 秒 + size 双键）∪ 文档级变化时的全部页（spec.md / page-inventory.md 任一与基线不符，见第二步附加）；基线缺失/损坏/回退（E 快照恢复 working 等）→ 自动全量，行为与现状一致；页面删除时清理其 `annotations/{page}.js`。

所有路径基于 `prototype/working/`；项目路径从 CLAUDE.md 上下文获取，如无法确定则询问 PM。

## 工作流程

### 第一步：检查前置条件

1. `prototype/working/pages/` 下无 `.html` 文件 → 提示"原型尚未生成，请先执行 build-prototype"，退出
2. `prototype/working/spec.md` 或 `prototype/working/page-inventory.md` 缺失 → 提示"缺少 spec.md / page-inventory.md，标注生成需要这两个数据源"，退出
3. 页面为 `.tsx/.vue`（React/Vue 技术栈）→ 提示"标注层 v1 仅支持 HTML 模式。React/Vue 组件建议在 HTML 模式原型中查看标注效果"，退出
4. 模式参数非法（非 `build` / `refresh`）→ 提示"模式参数仅支持 build / refresh"，退出
5. 指定页面名在 `pages/` 下不存在 → 提示可用页面清单（`pages/` 下实际 `.html` 文件名），退出
6. 全部满足 → 进入下一步

### 第二步：读取源文件

1. 读 `prototype/working/spec.md`：提取「核心业务规则」列表（`- **R{n} 规则名**：规则描述` 或 `- R{n} ...` 格式；无编号则按出现顺序补 R1..Rn）和「页面状态矩阵」表（| 状态 | 触发条件 | UI 表现 | 用户操作 |，模板未强制、可能缺失）；**spec.md 超 300 行时用 Grep 只读「核心业务规则」+「页面状态矩阵」两节，不全量 Read**；如果 spec 无「核心业务规则」段落 → rule 标注集合为空，提示 PM"spec 未定义核心业务规则，仅生成状态/流程标注"，继续执行不退出。**注意：补编号只落标注 label，不回写 spec.md**——check-quality 维度7 规则覆盖检查只比对 spec 中已带 R 编号的规则（无编号时按空集处理，不产生误报）
2. 读 `prototype/working/page-inventory.md`：**只读页面清单、结构化跳转表、跳转链路图（ASCII）**；提取每个页面的「元素」「状态」「跳转」字段（文件超长用 Grep 定位对应节）
3. 读目标页实际 DOM：**build 模式读全部 `pages/*.html`；refresh 模式只读目标页**（基线比对变化页 ∪ 调用方指定页 ∪ 文档级变化时的全部页，见第二步附加；文档级变化时页面未变的页不整页 Read，锚点从旧数据配对复用）。Grep/Read 提取页面内 `id="..."` 清单作为可选锚集合。**锚点必须来自页面实际 DOM，禁止编造锚点**
4. 多端场景（`-pc.html` / `-h5.html` 后缀）：每个端版本独立生成标注（锚点按各自页面 DOM）

### 第二步附加：文档级变化门（refresh 模式）

PM 可能直接修改 `spec.md`（状态矩阵等）或 `page-inventory.md`（跳转表/链路图）而不重跑 build——此时页面 HTML 不变、`prdE` 不变，仅靠页面比对与 prdE 门（第六步）会漏判：标注层 state/flow 数据过期且无人发现（check-quality 维度 7 只兜 R 规则覆盖，兜不到状态与流程）。refresh 在确定目标页前先过本门：

1. 比对基线 `specMd` / `pageInventoryMd` 与 `prototype/working/spec.md` / `page-inventory.md` 当前 stat（mtime 秒 + size 双键，内联 `stat -c "%Y %s"`，与页面比对同法）
2. **任一不同 → 文档级变化**：全部页面进入目标集合，rule/state/flow 按当前文档重新生成；**页面基线比对无变化的页不整页 Read**——锚点从旧 `annotations/{page}.js` 按 label/title 语义配对复用（同第六步 prdE 门配对机制；flow 为页内单项天然配对，steps 逐条按 text 配对），配不上的 item 级降级 `page` + `anchorNote`、步骤级省略 anchor，第九步汇报列出（不静默）；页面有变的页正常读 DOM
3. 两份文档均与基线一致 → 目标集合 = 页面比对变化页 ∪ 调用方指定页（现状，本门零影响）
4. 基线缺失/损坏 → 全量路径，本门无需比对（无基线可比）
5. `prdE` 门（第六步）独立生效，与本门正交：文档级变化 + PRD 未变 → 溯源字段沿用旧数据不重读 PRD；两者同变 → 各自路径叠加

### 第三步：规则映射（rule 标注）

**规则内容源优先级**（refresh 模式：**PRD 优先、spec 兜底**；build 模式：spec 为主）：

1. **refresh 模式规则清单提取**——优先从 PRD 最新 E{N} 提取：
   - **4.2 共同规则**（`- **R{n} 规则名**：描述` / `- R{n} ...` / 未编号条目）
   - **各用例的「用例规则」字段**条目
   - **扩展流程中的行为性规则**（`- 2a. 条件：动作` 格式中描述明确行为的条目，如「重新取号」「拒绝授权」）
   - spec.md 降级为兜底：PRD 缺该规则时用 spec 原文（避免 PRD 修订后 spec 未同步导致新规则漏标）
2. **编号策略**：spec 已有编号的规则沿用 specRef（R1-R9 体系，**spec 为编号权威**）；**PRD 独有规则自动补编号**（继续 R 序列，如 R10「重新取号」、R11「拒绝授权」）并标注来源（"PRD E{N} 新增，spec 待同步"）；PRD 未编号共同规则（如"自动登录"）同样补编号
3. 映射到页面元素：

| 规则特征 | 锚点选择 |
| :--- | :--- |
| 规则有明确作用元素（如"协议强制"→协议勾选框） | 锚该元素 `#id` |
| 规则涉多个元素 | 锚第一个操作对象 |
| 规则为全局性（如埋点、并发互斥） | 锚 `page` |
| 页面无对应元素（映射失败） | 锚最接近元素 + 填 `anchorNote` 说明，**不得编造锚点** |

4. 生成 rule 项：`label=R{n}`、`specRef=R{n}`、`title`（规则名）、`text`（规则原文，PRD 优先）、`anchor`、`states`（适用状态，从状态矩阵/页面状态推断，可空）、`prd`（第六步填）
5. **编号体系对齐**：spec（如 R1,R2,R3,R5-R9 无 R4）与 PRD 4.2（可能无 R1/R2 定义）编号不对称时——以 spec 编号为权威，PRD 独有规则补编号，汇报"编号体系差异清单"提示后续版本对齐

### 第四步：状态标注（state 标注）

1. spec.md 有「页面状态矩阵」表 → 逐行生成 state 项：`label=S{n}`（n 按出现顺序）、`title`（状态名）、`text`（"触发条件：…；UI 表现：…；用户操作：…"）、`anchor`（UI 表现对应的元素）
2. **矩阵缺失降级** → 从 page-inventory.md 每页「状态」字段提取（`stateSource: "page-inventory"` 标记 + 提示 PM"spec 无状态矩阵，已从 page-inventory 提取"）
3. **数据契约**：state 项同时被状态演示入口消费（build-prototype 第八步B / 本技能第十步A 从 state 项派生 `demo/{page}.js` 的 `PM_DEMO_DATA`，复制 label/title/text/anchor 不重解析）——状态项数据变更时勿只改演示数据，应改标注源后由重派生同步

### 第五步：流程标注（flow 标注）

1. 读 page-inventory.md 结构化跳转表 + 跳转链路图（**格式容错**：extend-html 等场景的 page-inventory 为逐页条目格式（元素/状态/跳转/备注），无独立跳转表与链路图 → 不报错，跳转信息从每页「跳转」字段语义解析（target=目标描述、via=触发元素、type=外链/页内/快照），steps 由「跳转」字段推导或留空（仅存于总览气泡），第九步汇报注记"flow 基于逐页跳转字段（无链路图）"）
2. 每页生成一个 flow 项：`anchor: "page"`（完整流程总览点恒保留）、`steps`（压缩链路图为步骤列表）、`exits`（取跳转表中该页作为来源的条目：`{target, via, type}`；无跳转表时取每页「跳转」字段解析结果）
3. **步骤 → 锚点映射**（steps 升级为对象数组 `{text, anchor?}`，带锚步骤运行时渲染到元素旁；无锚步骤仅存于总览气泡）：
   - 先建 **id→元素语义对照表**：读页面 DOM，对每个 `id` 元素记录文本/aria-label/class 上下文，作为映射基础（禁止凭空猜 id）
   - 逐条映射（优先级递减）：
     - **a. 主操作优先**：步骤含动作动词（点击/勾选/重试/提交）→ 锚宾语元素（如"勾选协议 → 点击一键登录"锚 `#oneClickBtn` 而非字面第一个元素 `#agreeCheck`）
     - **b. 状态承载优先**：步骤描述某状态/提示的出现 → 锚承载元素（"取号中加载态"→`#getNumberLoading`、"提示卡"→`#failCard`、"失败提示+重试"→`#loginFail`）
     - **c. 容器兜底**：操作元素无 id → 锚其有 id 的容器（如 failCard 内的"重新取号"按钮 → 锚 `#failCard`）
     - **d. 系统/跳转/无承载步骤 → 省略 anchor**（如"打开游戏""进入游戏""校验账号"）
     - **e. 禁止编造**：无匹配 → 省略 anchor，不做近似锚定（步骤 anchor 语义是"起点元素"，锚错比不锚更误导）
4. **flow 项 label 固定为「流程」**（与第七步模板一致）；步骤的展示序号（F1、F2…，与 R/S 编号体系一致）由运行时从数组下标派生，数据文件不存序号字段
5. 页面间跳转涉及多端（`-pc`/`-h5`）：flow 项按各自页面生成，步骤锚点按各自端页面 DOM 匹配

### 第五步附加：锚点有效性校验与迁移

对全部 rule/state 的 item 级 anchor 与 flow 步骤的步骤级 anchor 做有效性校验（**refresh 必做**；build 模式生成新页面时锚点来自当前 DOM 天然有效，可跳过）：

1. **锚点有效性扫描**：每条 item 的 `anchor`（非 `page`）与每条 flow 步骤的 `anchor`，检查页面 DOM 是否仍含该 id（`#id` → attrs.id 命中；`.class` → attrs.class 命中）
2. **失效处理三级链**（按序尝试，命中即停）：
   - **L1 同功能迁移**：识别 DOM 中承载相同功能/语义的元素（AI 语义判断：规则文字描述的功能 vs 现存元素文案/上下文）→ 锚定迁移元素，填 `anchorNote`："原锚点 {旧id} 已移除，迁移至功能相同元素 {新id}"
   - **L2 最接近元素**：L1 失败 → 锚语义最接近的现存元素 + `anchorNote` 说明
   - **L3 降级**：均失败 → item 级锚 `page` + `anchorNote`；步骤级省略 anchor（仅存于总览气泡）
3. **典型场景**：原型迭代去掉重复功能元素（文案可能不同但功能相同）——原锚点 id 失效后，L1 把规则迁移到保留的同类元素，程序员看到的标注仍在正确位置而非静默消失
4. 迁移结果计入第九步汇报："锚点迁移 {M} 处（原锚点失效，已迁移/降级）"

### 第六步：PRD 溯源（PRD 存在时；refresh 模式必做）

**增量门（修订 3 落点）**：refresh 模式先比基线 `prototype/.last-check.json` 的 `prdE` 与 `prd/` 最新 E{N}：
- **相同** → PRD 未变，跳过 PRD 读取，`sources.prd` 与各标注 `prd` 字段沿用旧 `annotations/{page}.js` 数据（溯源字段不变，不做语义重匹配）
- **不同** → 按下方 1-5 读 PRD E{N} 重提取规则；**锚点复用**：目标页未变化时，新规则与旧 `annotations/{page}.js` 的 `items[].anchor` 按 label/title 语义配对（页面未变则锚点未变），配对成功直接沿用旧锚点；**配不上的降级 page 级标注并在第九步汇报中列出**（不静默，杜绝 R 编号漂移静默过期）
- **PRD-only 刷新**（基线比对 0 页变化、仅 prdE 不同）→ **不读任何页面 HTML**：仅做规则提取与溯源配对，锚点全部从旧数据文件复用
- 基线缺失/损坏 → 视为 prdE 不同，按全量路径执行（回退语义）

1. 读 `prd/` 目录，取编号最大的 E{N} **完整 PRD** 文件（命名 `*_PRD_E{n}.md`）。**排除简版PRD**——简版PRD 命名 `{功能名}_{版本}_简版PRD_E{n}.md`（"简版"与"PRD"之间**无下划线**，故 `*_PRD_E{n}.md` 模式与 `_PRD_E{n}.md` 结尾匹配均不会命中简版文件，但**目录枚举 `prd/*.md` 会同时列出简版**，必须按文件名含「简版」剔除），两系列 E 编号独立递增，简版内容为有损压缩（语义损失 ~10-15%），不得作为溯源依据；仅当 `prd/` 目录枚举下只有简版PRD（无任何完整 PRD，异常态）时跳过溯源并报告 PM
2. **refresh 模式（规则源为 PRD）**：规则内容与溯源**同源**——第三步提取规则时即记录章节引用（4.2 共同规则 / 用例N 用例规则 / 扩展流程 2a 等），直接填入 `prd` 字段（`{file, useCase, section, ref}`），无需重新语义匹配
3. **build 模式（规则源为 spec）**：对每条 rule 标注做 **AI 语义匹配**：spec R 规则 → PRD 的 4.2 共同规则 / 用例N 的用例规则 / 扩展流程 / 验收标准；匹配成功 → 填 `prd` 字段
4. 匹配失败 → 保留标注不填 `prd`，汇总"未溯源规则清单"报告 PM（如"R5 未在 PRD 中找到对应条款，请确认 PRD 是否遗漏"）
5. PRD 不存在（build 模式常见）→ 跳过，`sources.prd` 不填

### 第六步附加：spec 关联 PRD 回填（refresh 模式附带）

refresh 模式读取 prd/ 最新 E{N} 后，顺带检查 `prototype/working/spec.md` 头部「关联 PRD」行：若缺失、为"未生成"或 E 编号 < E{N} → 更新该行为 `- **关联 PRD**：{功能名}_{版本}_PRD_E{N}`（仅改头部行，不动其余内容；spec.md 不存在则跳过）。此回填使 check-consistency 的「spec 与 PRD 规则覆盖」提示可判断"spec 是否基于旧 PRD"。

**自我打标防护**：回填改写 spec.md 会产生 mtime 变化，第十步会无条件刷新基线 `specMd` 条目——回填不会在下次 refresh 被第二步附加误判为文档级变化（同 check-quality auto-fix 修复落盘后刷基线的先例）。

### 第七步：生成数据文件

1. 每页生成 `annotations/{page-basename}.js`（如 `annotations/login.js`），格式：

```js
window.PM_ANNOTATIONS_DATA = {
  "pageId": "P1", "pageFile": "login.html", "pageName": "一键登录页",
  "stateSource": "spec-matrix",
  "sources": { "spec": "...", "pageInventory": "...", "prd": "..." },
  "items": [
    { "id": "A01", "label": "R1", "type": "rule", "specRef": "R1", "title": "协议强制",
      "text": "规则原文", "anchor": "#agreeCheck", "anchorNote": "", "states": ["初始态"],
      "prd": { "file": "xxx_PRD_E3.md", "useCase": "用例1", "section": "用例规则", "ref": "原文摘录" } },
    { "id": "A02", "label": "S3", "type": "state", "title": "取号中",
      "text": "触发条件：…；UI 表现：…；用户操作：…", "anchor": "#btnOneClick" },
    { "id": "A03", "label": "流程", "type": "flow", "title": "本页交互流程",
      "steps": [
        { "text": "取号成功 → 展示脱敏号码按钮", "anchor": "#btnOneClick" },
        { "text": "校验账号 → 未注册自动创建 / 已注册直接登录" }
      ],
      "exits": [{ "target": "…", "via": "…", "type": "…" }], "anchor": "page" }
  ]
};
```

2. **严格 JSON**（无注释、无尾逗号）——check-quality 用正则提取 + `JSON.parse` 校验
3. `id` 页内唯一（A01、A02…）；`label`：规则 R{n}、状态 S{n}、流程"流程"
4. 写入失败自动重试 1 次；仍失败 → 提示"写入失败：{文件名}，请检查磁盘空间或路径权限"

**{占位符}填充规则**（数据来源 = spec.md / page-inventory.md / 页面 DOM / PRD）：

| 字段 | 填充内容 | 数据来源 |
| :--- | :--- | :--- |
| `pageId` | 页面编号（P1、P2…）；页面不在清单时回退为文件名并按页面顺序补编号 | page-inventory.md 页面清单（清单外回退文件名） |
| `pageFile` | 页面文件名 | 实际生成的文件名（多端含 `-pc`/`-h5` 后缀） |
| `pageName` | 页面名；页面不在清单时回退为文件名 | page-inventory.md 页面清单（清单外回退文件名） |
| `stateSource` | `spec-matrix` / `page-inventory` | 第四步判定结果（矩阵缺失降级时标记） |
| `sources.spec` / `sources.pageInventory` | 数据源文件相对路径 | 实际文件位置 |
| `sources.prd` | PRD 文件名 | 第六步读取的 E 最大 PRD，仅 PRD 存在时填 |
| `items[].id` | A01、A02…（页内唯一） | 按生成顺序编号 |
| `items[].label` | `R{n}` / `S{n}` / `流程` | 第三步/第四步/第五步生成的标注类型 |
| `items[].type` | `rule` / `state` / `flow` | 标注类型 |
| `items[].specRef` | R 编号 | 仅 rule 类型填，与 `label` 同值 |
| `items[].title` | 规则名 / 状态名 / "本页交互流程" | spec.md / page-inventory.md |
| `items[].text` | 规则原文 / "触发条件：…；UI 表现：…；用户操作：…" | 第三步 / 第四步 |
| `items[].anchor` | `#元素id` 或 `page` | 第三步映射结果，**必须来自页面实际 DOM** |
| `items[].anchorNote` | 映射失败说明 | 仅映射失败时填，不得以编造锚点替代 |
| `items[].states` | 适用状态列表 | 状态矩阵 / 页面状态推断，可空 |
| `items[].prd` | `{file, useCase, section, ref}` 溯源对象 | 第六步语义匹配成功时填 |
| `items[].steps` | 流程步骤对象数组 `{text, anchor?}`（anchor 可选：省略 = 无元素承载，仅存于总览气泡；禁止 `"page"` 值） | 第五步链路图压缩 + 步骤锚点映射 |
| `items[].exits` | `{target, via, type}` 跳转出口列表 | 第五步跳转表（该页作为来源的条目） |

### 第八步：注入页面 head 标签（幂等）

对每个页面在 `</head>` 前注入 3 行（已存在相同引用则跳过，不重复注入）；如果页面文本中无 `</head>` 标签 → 跳过该页注入，汇总"页面 {文件名} 缺少 </head>，未注入"报告 PM：

```html
<link rel="stylesheet" href="../annotations.css" />
<script src="../annotations/{page-basename}.js"></script>
<script src="../annotations-runtime.js"></script>
```

### 第九步：复制运行时资产 + 自检

1. 复制 `{本技能源码目录}/../../_shared/annotations/annotations.css` + `annotations-runtime.js` 到 `prototype/working/` 根目录（overwrite）；如果 `{本技能源码目录}/../../_shared/annotations/` 下任一资产缺失 → 提示"共享标注资产缺失：{文件名}，请检查插件完整性"，退出（避免 head 引用 404）
2. 自检（**仅限本次目标页**：build 全量 = 全部页面；refresh = 变化页 ∪ 调用方指定页，未处理页不检）：
   - 每个数据文件可 `JSON.parse`（正则提取 `window.PM_ANNOTATIONS_DATA = ({...});` 后 parse）
   - 每条标注的锚点选择器可在对应页面文本中匹配（`#id` → 页面含 `id="..."`；`page` 恒过）
   - **flow 对象步骤的 anchor 逐一匹配页面文本**（`#id` → 页面含 `id="..."`；省略 anchor / 字符串步骤跳过）
   - **无未处理失效锚点**：所有锚点必须命中 DOM——若第五步附加的迁移三级链已执行，剩余失效锚点视为 L3 已降级（item 级锚 page / 步骤级省略），计入汇报
   - 自检失败 → 修复后重新生成，**最多重试 2 次**；第 2 次后仍失败 → 停止自检循环，提示"标注自检未通过：{失败项列表}，请检查数据源后重跑 refresh"并报告 PM（不无限循环）
3. 汇报：`已为 {N} 个页面生成标注（{M} 条规则 + {K} 条状态 + 流程 {S} 步，其中 {T} 步已锚定到元素），PRD 溯源 {P} 条，锚点迁移 {Q} 处，PRD 新增规则 {V} 条（已补编号，spec 待同步）。页面右下角「规则和状态标注」「流程标注」开关可分别查看规则/状态与流程标注，两个开关可同时开启。`
   - **refresh 增量模式**：汇报改为 `增量刷新 {N} 页，跳过 {M} 页（基线比对无变化），PRD 溯源更新 {P} 条`；锚点配对降级时追加列出 `锚点配对失败降级 page 级：{规则列表}`（见第六步增量门）
   - **refresh 文档变更模式**（第二步附加触发）：汇报改为 `检测到文档变更（{spec.md / page-inventory.md / spec.md + page-inventory.md}），全量刷新 {N} 页标注，PRD 溯源更新 {P} 条`；锚点配对降级列出规则同上

### 第十步：更新页面状态基线（build/refresh 模式）

处理完成后更新增量检查基线 `prototype/.last-check.json`（位于 `prototype/` 级，非 working/ 内——deploy-prototype 以 working/ 为服务根，放 working/ 内会暴露在局域网；save-version 只复制 working/，prototype/ 级天然不进 E 快照）：

1. 基线不存在或损坏 → **本次目标集合为全部页面（build 全量 / refresh 全量回退）→ 创建基线**（格式同 build-prototype 第十一步A：收集全部 `working/pages/*.html` 的 mtime 秒 + size + `specMd`/`pageInventoryMd` + `prdE`（`prd/` 最新完整 PRD E{N}，无则 0）+ `updatedAt`）——覆盖 build-prototype 之外的调用方（extend-html 首轮 build 等无第十一步A 的场景），使后续 refresh 增量生效；**仅增量处理时缺失 → 跳过不创建**（避免掩盖未知变化）
2. 基线存在 → 用内联 `stat -c "%Y %s"` 收集**本次处理过的页面** mtime（秒）+ size，更新对应条目（键 = 相对 `pages/` 路径）；同时 stat `spec.md` 与 `page-inventory.md` 无条件刷新 `specMd` / `pageInventoryMd` 条目（基线记录"标注当前基于的文档状态"——第六步附加回填对 spec.md 的改写一并吸收，防止下次 refresh 自我打标；第一步已保证两文件存在）；`prdE` 更新为当前 `prd/` 目录最新 E{N}（无完整 PRD 写 0）；`updatedAt` 更新；未处理页条目原样保留（严格 JSON 回写；**回写方式：先 Read 现有基线文件 → `JSON.parse` → 仅覆写上列键 → 对同一对象 `JSON.stringify` 写回，禁止新建对象整体替换**）；**其他未定义顶层字段一律原样保留**——例如 build-prototype 写在同一文件里的 `review` 评审攒批块（`lastAt` / `pendingPages` / `pendingRounds`），整块重写会抹掉评审队列痕迹（build-prototype 禁止行为 19）
3. 写盘失败（目录只读/磁盘满）→ 提示但不阻塞（下次调用按全量路径兜底）

### 第十步A：演示数据同步重派生（refresh 出口）

刷新完成后，若工作区已生成状态演示入口（`prototype/working/demo/` 目录存在）→ 对**本次处理的页面**从最新标注数据重派生演示数据（保持标注与演示同源，防状态漂移；demo/ 不存在 → 演示入口未生成，跳过本步）：

1. 逐页读 `annotations/{page}.js` 的 `type:"state"` 项（`label` / `title` / `text` / `anchor`，按原顺序）→ 重写 `demo/{page}.js`（`window.PM_DEMO_DATA` 严格 JSON，`stateSource: "annotations"`，结构同 build-prototype 第八步B（唯一权威定义），**含锚点下沉规则**——锚点 A 包含另一 state 锚点 B 时，演示锚点下沉为 A 容器内第一个非状态锚点、非瞬态（toast/mask/shadow/dialog/backdrop/tip）的直接块级子元素；找不到合适元素 → 保持原锚点不强制；下沉只落 demo 数据不回写标注层）；无 state 项 → 空 `items`
2. **新增页派生**：本次处理页中 annotations 数据存在但 `demo/` 无对应文件的页面 → 一并生成数据文件（head 注入由调用方负责——build-prototype edit / extend-html 的演示面板步骤）
3. 汇报（仅发生同步时）追加：`演示数据已同步 {N} 页`；写盘失败 → 提示但不阻塞

> 派生与 build-prototype 第八步B 同一条规则（复制不重解析），本步仅在标注 refresh 后保持 demo 数据新鲜；首次生成仍由 build-prototype 第八步B / extend-html 演示面板步骤执行。

## 输出

| 文件 | 路径 | 用途 |
| :--- | :--- | :--- |
| `annotations.css` | `prototype/working/annotations.css` | 标注层运行时样式（从 `{本技能源码目录}/../../_shared/annotations/` 复制） |
| `annotations-runtime.js` | `prototype/working/annotations-runtime.js` | 标注层运行时逻辑（从 `{本技能源码目录}/../../_shared/annotations/` 复制） |
| `annotations/{page}.js` | `prototype/working/annotations/{page}.js` | 每页标注数据（严格 JSON） |
| head 注入标签 | 每个 `pages/*.html` | 3 行引用（幂等） |
| `demo/{page}.js`（第十步A 重派生） | `prototype/working/demo/{page}.js` | 每页状态演示数据（从 state 项派生，仅 demo/ 已存在时维护） |

## 与上下游的衔接

| 来源 | 读取路径 | 读取的字段 |
| :--- | :--- | :--- |
| spec.md（上游） | `prototype/working/spec.md` | 核心业务规则、页面状态矩阵 |
| page-inventory.md（上游） | `prototype/working/page-inventory.md` | 元素、状态、跳转表、链路图 |
| PRD（refresh 时） | `prd/` 最新 E{N} | 4.2 共同规则、用例N 用例规则/扩展流程/验收标准 |
| 页面 DOM | `prototype/working/pages/*.html` | id 锚集合 |

| 衔接方 | 调用时机 | 说明 |
| :--- | :--- | :--- |
| build-prototype | 第八步A 自动调用（build 模式） | 页面生成后首次全量生成标注 |
| build-prototype（edit） | 修改完成后自动调用（refresh） | 锚点同步 + 顺带补 PRD 溯源（增量，仅变化页） |
| extend-html | 收尾自动调用（首轮 build / 后续轮 refresh） | 首轮：补全缺失数据文件（page-inventory 缺失按模板补、spec.md 缺失经 write-spec 补）后 build 全量；后续轮：Phase 3 末 refresh（增量，质检前） |
| save-doc | PRD 保存后自动调用（refresh） | 补 PRD 溯源，标注永远跟最新 PRD（增量，仅变化页；PRD-only 不读页面 HTML） |
| check-quality | 生成后由 build-prototype 触发 | 新增 4 项标注检查（assets/json/anchor/rules-covered） |
| 状态演示入口（下游） | 第十步A（refresh 出口） | 从 state 项派生 demo 数据（仅 demo/ 已存在时），保持标注与演示同源 |

## 禁止行为

1. **禁止编造锚点** — 锚点必须来自页面实际 DOM id；映射失败锚最接近元素 + `anchorNote`，或锚 `page`（**步骤级 anchor 例外**：映射失败直接省略 anchor，不做近似锚定——步骤锚点语义是"起点元素"，锚错比不锚更误导）
2. **禁止非严格 JSON** — 数据文件必须可 `JSON.parse`（无注释、无尾逗号），否则 check-quality 校验失败
3. **禁止重复注入** — head 标签已存在相同引用时跳过，不叠加
4. **禁止覆盖人工数据** — v1 无人工维护锚点；refresh 为**增量刷新**（仅重生成变化页），未变化页沿用旧数据文件。**禁止跳过基线比对直接全量**——全量仅限 build 首次生成与基线缺失/损坏回退
5. **禁止修改页面本体结构** — 只允许注入 head 3 行标签，不触碰页面 DOM/CSS/脚本
6. **禁止整块重写基线** — 第十步回写 `.last-check.json` 只改本次处理页的条目与 `specMd`/`pageInventoryMd`/`prdE`/`updatedAt`，**其余未定义顶层字段原样保留**（含 build-prototype 的 `review` 评审攒批块）；整块重写会静默清空评审队列

## 约束

1. **锚点必须来自实际 DOM 并自检** — 每条 rule/state 标注的 `anchor` 必须能在对应页面文本中匹配（`#id` → 页面含 `id="..."`；`page` 恒过）。生成完成后必须执行第九步自检，失败则修复后重新生成（**最多重试 2 次**，仍失败则停止并报告 PM 具体失败项，不无限循环）。
2. **增量刷新、全量兜底** — build 模式首次全量生成；refresh 模式目标页 = 调用方指定 ∪ 基线比对变化页（mtime+size 双键）∪ 文档级变化时的全部页（specMd/pageInventoryMd 任一不符，第二步附加），页面与文档均未变的页数据文件不改写。基线缺失/损坏/回退（E 快照恢复 working 等）→ 自动全量，行为与现状一致，零迁移成本。
3. **PRD 溯源保持最新** — refresh 模式读取 `prd/` 最新 E{N} 并重做语义匹配（**基线 `prdE` 与最新 E{N} 相同则跳过 PRD 读取与重匹配、沿用旧溯源字段**，见第六步增量门）；PRD 未生成时跳过溯源不阻塞，待 save-doc 保存后自动衔接 refresh。
4. **标注层零静态痕迹** — 页面静态 HTML 不得包含标注 DOM；标注全部由 `annotations-runtime.js` 运行时注入（默认隐藏、两开关控制），静态 HTML 只允许出现 head 3 行引用——这是 check-quality 现有检查零误报的结构性保证。

## 正误示例

### 正确示例

**示例 1**：build 模式首次生成全部页面标注

```
annotate-prototype build all
```

预期：读取 spec.md + page-inventory.md + 页面 DOM id 清单 → 逐页生成 `annotations/{page}.js`（R 规则 / S 状态 / 流程三类标注）→ head 幂等注入 3 行 → 复制运行时资产 → 锚点自检通过 → 汇报"已为 {N} 个页面生成标注（{M} 条规则 + {K} 条状态 + 流程），页面右下角「规则和状态标注」「流程标注」开关可分别查看规则/状态与流程标注，两个开关可同时开启"。

**示例 2**：refresh 模式补 PRD 溯源（增量）

```
annotate-prototype refresh
```

预期：先比基线 `prdE` 与 `prd/` 最新 E{N}——相同则跳过 PRD 读取（溯源字段沿用旧数据）；不同则读 PRD E{N} 重提取规则，未变化页锚点从旧 `annotations/{page}.js` 复用（按 label/title 语义配对），配不上的降级 page 级并在汇报列出；页面无变化（PRD-only 刷新）时不读任何页面 HTML；处理完成后更新基线（第十步）。

**示例 3**：refresh 模式处理文档直接变更（未重跑 build）

```
（PM 手工修改 spec.md 状态矩阵 + page-inventory.md 跳转表后）
annotate-prototype refresh
```

预期：第二步附加比对基线 `specMd`/`pageInventoryMd` 发现不符 → 文档级变化，全部页入目标集合按当前文档重新生成标注；页面未变的页不整页 Read、锚点从旧数据按 label/title 配对复用（配不上降级并汇报）；prdE 未变则 PRD 溯源字段沿用；第十步刷新全部处理页 + 两份文档条目。

### 错误示例

**错误 1**：规则映射失败时编造锚点

```
（spec 规则 R3 在页面找不到对应元素，仍生成 anchor: "#fakeId"）
```

问题：锚点必须来自页面实际 DOM id，编造锚点导致 check-quality 锚点检查失败、程序员点击标注无响应。正确做法：锚最接近元素 + 填 `anchorNote` 说明映射失败，或锚 `page`。

**错误 2**：数据文件带注释或尾逗号

```js
// 这是规则标注（JSON 中注释非法）
{ "id": "A01", "label": "R1", "type": "rule", },
```

问题：check-quality 用正则提取 `window.PM_ANNOTATIONS_DATA = ({...});` 后 `JSON.parse` 校验，非严格 JSON 直接校验失败。正确做法：数据文件必须为可 `JSON.parse` 的严格 JSON（无注释、无尾逗号）。

**错误 3**：PRD 更新后手工修改数据文件

```
（PRD 定稿后，直接 Edit 某页 annotations/login.js 补一行 prd 字段）
```

问题：refresh 是技能增量刷新路径（按基线比对），手工改动脱离基线管理——页面未变时 refresh 不会重写该文件，改动可能残留半途状态，且锚点可能与页面 DOM 脱节。正确做法：统一执行 `annotate-prototype refresh`，由技能按增量规则重建变化页标注并重做语义匹配。

**错误 4**：refresh 时顺手修改页面本体 DOM/CSS

```
（refresh 生成标注时发现按钮配色不协调，直接 Edit pages/login.html 改样式）
```

问题：标注层零静态痕迹是结构性保证——页面本体只允许 head 3 行引用，改动 DOM/CSS 会让 check-quality 现有检查产生误报，且超出标注技能职责边界。正确做法：样式问题走 build-prototype（说「改颜色」），标注技能只写 `annotations/*.js` 数据文件与 head 引用。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 |
| :--- | :--- | :--- |
| 原型尚未生成 | `working/pages/` 无 `.html` | 提示"请先执行 build-prototype"，退出 |
| spec.md / page-inventory.md 缺失 | 数据源文件不存在 | 提示缺失文件，退出 |
| React/Vue 技术栈 | 页面为 `.tsx/.vue` | 提示"标注层 v1 仅支持 HTML 模式"，退出 |
| spec 无页面状态矩阵 | 矩阵表缺失 | 从 page-inventory「状态」字段提取，`stateSource: "page-inventory"` 标记 + 提示 |
| spec 规则无编号 | 核心业务规则为纯文本 | 按出现顺序补 R1..Rn 编号 |
| PRD 不存在 | build 模式常见 | 跳过溯源，`sources.prd` 不填，PM 确认后由 save-doc 自动刷新 |
| 仅简版PRD 存在 | `prd/` 下只有 `*_简版PRD_E{n}.md`（无完整 PRD） | 跳过溯源（简版为有损压缩不作溯源源），提示 PM 先通过 generate-prd 生成完整 PRD |
| 规则匹配不到 PRD 条款 | refresh 时语义匹配失败 | 保留标注不填 prd，汇总"未溯源规则清单"报告 PM |
| 基线缺失/损坏 | refresh 时 `prototype/.last-check.json` 不存在/JSON 损坏 | 回退全量（行为与现状一致）；全量处理（build / refresh 回退）时**补建基线**（第十步第 1 条），后续 refresh 增量生效；仅增量处理时缺失 → 跳过不创建 |
| 基线含未知顶层字段 | 基线里有 `review` 评审攒批块等本技能未定义的字段 | 回写时**原样保留**（只改本次处理页条目 + `specMd`/`pageInventoryMd`/`prdE`/`updatedAt` 四个非页面字段），禁止整块重写——丢失评审队列会让 build-prototype 的攒批痕迹凭空消失；本技能静默保留，不提示 PM |
| 基线存在但页面新增 | pages/ 出现基线中不存在的页面 | 新增页视为变化页首次生成标注；基线写入时自然收录 |
| 页面删除（移 .dead/） | 基线有条目但页面文件不存在 | 清理其 `annotations/{page}.js` 数据文件；基线条目在下次写入时移除 |
| 页面重命名 | 文件名变化 | 旧条目失效、新条目收录（基线以 pages/ 实际文件为准）；refresh 按变化处理新页 |
| E 快照恢复 working | 从 E{N} 复制页面回 working（mtime 全变） | 全部页面视为变化 → 自动全量，行为与现状一致 |
| PRD-only 刷新 | 0 页变化且基线 prdE 与 prd/ 最新 E 不同 | 不读任何页面 HTML，仅 PRD 溯源更新 + prdE 写入基线 |
| spec.md / page-inventory.md 被直接修改（未重跑 build） | 基线 `specMd`/`pageInventoryMd` 与当前文件 stat 不符 | 文档级变化（第二步附加）：全部页入目标集合按当前文档重新生成标注；页面未变的页不整页 Read、锚点从旧数据配对复用，配不上降级 page/省略并汇报 |
| 回填写入 spec.md 头部 | 第六步附加回填改写 spec.md | 第十步无条件刷新 `specMd` 条目，下次 refresh 不误判为文档级变化（自我打标防护） |
| 规则无锚点元素 | 页面无对应元素 | 锚最接近元素 + `anchorNote`，不得编造 |
| 多端后缀页面 | `-pc.html` / `-h5.html` | 各自独立生成标注（锚点按各自页面 DOM） |
| page-inventory 无跳转表/链路图 | extend-html 逐页条目格式（元素/状态/跳转/备注） | 不报错：exits/steps 从每页「跳转」字段语义解析，第九步汇报注记"flow 基于逐页跳转字段（无链路图）" |
| 页面不在 page-inventory 清单 | 清单漂移（extend-html 新增页未随动） | 该页 pageId/pageName 回退为文件名（`pageId` 按页面顺序补编号），第九步汇报列出清单外页面 |
| 数据写盘失败 | 磁盘/权限问题 | 重试 1 次，仍失败提示具体错误退出 |
| head 已注入 | 二次生成 | 检测到引用跳过，不重复注入 |
| 锚点自检失败 | 选择器无法匹配页面文本 | 执行第五步附加迁移三级链（L1 同功能迁移 → L2 最接近元素 → L3 降级 page/省略）；仍失败则修复数据后重新生成（**最多重试 2 次**，仍失败则停止并报告 PM） |
| 模式参数非法 | 非 `build`/`refresh` | 提示合法取值，退出 |
| 指定页面不存在 | 页面名不在 `pages/` 清单 | 提示可用页面清单，退出 |
| spec 无核心业务规则 | 规则段落缺失 | rule 标注为空，提示 PM 后继续（状态/流程照常生成） |
| 页面缺 `</head>` | HTML 无闭合 head 标签 | 跳过该页注入，汇总报告 PM |
| 共享标注资产缺失 | `{本技能源码目录}/../../_shared/annotations/` 文件缺失 | 提示插件完整性错误，退出 |
| 页面无任何 id 属性 | DOM 无任何 id | 所有标注锚 `page`（无 `#id` 可锚）；flow 步骤全部省略 anchor（仅存于总览气泡） |
| flow 步骤无匹配元素 | 步骤文字无法对应任何 id 元素 | 省略该步 anchor（仅存于总览气泡），不做近似锚定——步骤锚点语义是"起点元素"，锚错比不锚更误导 |
| flow 步骤 anchor 为 `page` | 数据异常（v2 规范禁止） | 运行时守卫：`"page"` 值步骤不生成伪项（仅存于总览）；check-quality 步骤级校验跳过 |

## 快速参考

| 操作 | 命令 |
| :--- | :--- |
| 首次生成全部页面标注 | `annotate-prototype build all` |
| 生成单页标注 | `annotate-prototype build login` |
| PRD 定稿后刷新（补溯源） | `annotate-prototype refresh`（save-doc 保存 PRD 后自动触发，也可手动） |

## 评估测试用例

### 正向触发（10条）
1. `annotate-prototype build all`（spec 有 R 规则+状态矩阵，3 个 HTML 页面）— 预期：每页生成数据文件 + head 注入 + 资产复制，汇报统计
2. `annotate-prototype refresh`（PRD E3 存在）— 预期：全量重生成 + R 规则填上 PRD 溯源
3. 规则映射到多元素规则 — 预期：锚第一个操作对象
4. 状态矩阵缺失 — 预期：从 page-inventory 提取，`stateSource` 标记
5. 页面已注入过标签再生成 — 预期：跳过重复注入
6. flow 步骤含动作动词且宾语元素有 id — 预期：该步生成 `{text, anchor}` 对象（主操作优先规则，如"点击一键登录"锚 `#oneClickBtn` 而非字面第一元素）
7. edit 只改 1 页后 refresh（基线存在，其余 4 页未变）— 预期：只 Read 变化页 DOM、只重写该页 `annotations/{page}.js`，其余 4 页数据文件 mtime 不变，汇报"增量刷新 1 页，跳过 4 页"
8. PRD-only 刷新（0 页变化、基线 prdE E3→E4）— 预期：全程未 Read 任何页面 HTML，仅更新 PRD 溯源字段与基线 prdE
9. 手改 spec.md 状态矩阵（页面全部未动、prdE 不变）后 refresh — 预期：第二步附加触发文档级变化，全部页重新生成 state/flow 标注，全程未整页 Read 页面 HTML（锚点从旧数据配对复用），汇报"检测到文档变更（spec.md），全量刷新 N 页标注"
10. extend-html 首轮收尾自动调用 build（spec.md + page-inventory.md 已齐）— 预期：全量生成标注 + head 注入 + 资产复制；第十步基线缺失 → **补建基线**；后续 save-doc 保存 PRD 自动 refresh 走增量路径

### 负向触发（6条）
1. `annotate-prototype build`（无 pages/）— 预期：提示先 build-prototype，退出
2. `annotate-prototype build`（spec.md 缺失）— 预期：提示缺失文件，退出
3. React/Vue 页面 — 预期：提示仅支持 HTML 模式，退出
4. 规则映射失败无接近元素 — 预期：锚 page + anchorNote，不编造锚点
5. 数据写盘失败 — 预期：重试 1 次后提示错误退出
6. `annotate-prototype foo all`（非法模式参数）— 预期：提示仅支持 build/refresh，退出

### 边界查询（15条）
1. spec 规则无编号 — 预期：补 R1..Rn
2. PRD 不存在时 refresh — 预期：跳过溯源，不报错
3. 多端页面 `-pc/-h5` — 预期：各自生成
4. PRD 存在但规则匹配失败 — 预期：不填 prd + 报告未溯源清单
5. 单页项目（1 个页面）— 预期：正常生成单页标注
6. `annotate-prototype build nologin`（指定页面不存在）— 预期：提示可用页面清单，退出
7. spec 无「核心业务规则」段落 — 预期：rule 标注为空，提示 PM 后继续生成状态/流程标注
8. 页面 HTML 缺 `</head>` — 预期：跳过该页注入并汇总报告，其余页面正常
9. flow 步骤无匹配元素 — 预期：该步省略 anchor（对象仅含 text），自检跳过，汇报"未锚定步骤"计入统计
10. PRD 重排 R 编号（页面不动，E3→E4）— 预期：旧锚点按 label/title 语义配对复用；配不上的降级 page 级标注并在第九步汇报列出（不静默）
11. 基线缺失（删掉 `prototype/.last-check.json` 后 refresh）— 预期：回退全量，行为与现状一致
12. 第六步回填写入 spec.md 后再 refresh（无其他变化）— 预期：第十步已刷新 `specMd` 条目，不触发文档级变化，增量 0 页跳过
13. page-inventory 为逐页条目格式（无跳转表/链路图，extend-html 场景）— 预期：不报错，exits/steps 从每页「跳转」字段解析，汇报注记"flow 基于逐页跳转字段（无链路图）"
14. 页面不在 page-inventory 清单（清单漂移）— 预期：该页 pageId/pageName 回退文件名，汇报列出清单外页面
15. 基线含 build-prototype 写入的 `review` 评审攒批块（`lastAt`/`pendingPages`/`pendingRounds`）与其它未定义顶层字段时执行 refresh — 预期：第十步回写后这些字段逐字保留，仅本次处理页条目与 `specMd`/`pageInventoryMd`/`prdE`/`updatedAt` 变更（Read→parse→仅覆写该四键→同一对象写回，未新建对象整体替换），静默保留不提示 PM
