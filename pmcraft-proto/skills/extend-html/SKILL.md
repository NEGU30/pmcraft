---
name: extend-html
description: 存量 HTML 直接扩展。导入 single-file 单文件 HTML（或 extract-design --project 转换的多页 HTML），备份原稿并落工作副本后，就地小步修改存量页面、适配质检、衔接标注层与状态演示入口，最后存档/部署。当产品经理说"直接改这个HTML"、"在这个HTML上加"、"基于这个HTML"、"改这个HTML"、提到"singleFile 下载的 HTML"时触发。
type: skill
tags:
  - 存量扩展
  - HTML 直改
  - single-file
  - 增量修改
  - prototype
  - html
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Skill
  - AskUserQuestion
argument-hint: '<HTML 文件路径> [更多路径]'
prompt: 直接改这个HTML|在这个HTML上加|基于这个HTML|改这个HTML|singleFile
dependencies:
  - Node.js（LTS，scripts/init-extend.js 与 Phase 2/4 复用脚本运行所需）
  - extract-design 技能（Phase 2 复用其 scripts/extract-css.js）
  - check-quality 技能（Phase 4 复用其 scripts/check-quality.js）
  - write-spec 技能（Phase 5 收尾衔接标注前补 spec.md，仅缺失时调用）
  - annotate-prototype 技能（Phase 3 末 / Phase 5 收尾衔接，标注层生成/刷新）
  - save-version / deploy-prototype 技能（Phase 5 复用，零改动）
---

# 存量 HTML 直接扩展 (extend-html)

## 概述

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/extend-html/`），脚本路径一律由此锚定解析，不依赖 cwd。

与 `extract-design --apply`（导入侧：提取设计 → 重新生成页面）对称，本技能提供**直接编辑存量 HTML** 的独立生命周期：**导入备份 → 落工作副本 → 抽令牌 → 就地小步修改 → 适配质检 → 收尾衔接标注层 → 存档/部署**。输入可以是 single-file 单文件 HTML，也可以是 `extract-design --project` 转换后的多页 HTML（两路均由此接管）。

核心心智：**任何前端输入 → HTML 原型 → 直接改**。存量页面是主角，不是参考素材——`prototype/reference/source/` 是永不改动的原稿，所有修改发生在 `prototype/working/pages/` 的工作副本上。

**两处与 build-prototype 的刻意差异（读者勿误判为遗漏或笔误）**：
- ① 本技能 Phase 4 **刻意不加 `--auto-fix`**（build-prototype 默认带）；
- ② 由此，后续轮编辑链顺序为 **`修改 → 标注 refresh → 质检`**（build-prototype edit 链因 auto-fix 在质检时写盘，必须 `修改 → 质检 → 标注 refresh`，与本技能相反）。

两者同源：不加 auto-fix ⇒ 质检不写盘 ⇒ 标注先刷不会失效。详见 Phase 3 末「标注衔接与编辑链顺序」与 Phase 4「不加 `--auto-fix`」契约。

## 加载策略总览

| 内容 | 加载时机 | fallback |
|------|---------|----------|
| `references/output-templates.md` | Phase 2（生成 DESIGN.md / design-system.css / page-inventory.md / index.html）入口 | 依据本文件「输出模板」章节保留的产物清单自行构建，不阻塞流程 |
| `references/check-quality-adaptation.md` | Phase 4（质检结果过滤）入口 | 依据「Phase 4 质检」章节的过滤规则表执行，不阻塞流程 |
| `pmcraft-proto/_shared/reference/anti-ai-flavor.md` | Phase 3（文案规则 R5）入口 | 默认规避 AI 味表述（夸大的象征意义、宣传性语言、三段式、破折号过度等） |

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| HTML 文件路径 | 字符串 | 是 | 存量 HTML 文件（.html/.htm），single-file 内联页面或项目转换页面 | `C:/tmp/legacy/orders.html` |
| 修改需求 | 自然语言 | 否 | PM 对存量页面提出增量修改（"在订单行加个按钮"） | `在订单行加一个取消订单按钮` |

## 调用方式

```
extend-html <HTML 文件路径> [更多路径...]
```

**示例：**

```
extend-html C:/tmp/legacy/orders.html
extend-html ./downloads/page1.html ./downloads/page2.html
```

## 工作流程

### Phase 0：前置确认

1. **校验输入**：文件存在、扩展名 `.html`/`.htm`、内容含 `<html` 标记。任一不满足 → 告知 PM 并停止（非 HTML 输入拒绝导入）。
2. **大文件提示**：文件 >2MB（多为含 data URI 大图的 single-file 页面）→ 提示"建议小步修改：每次 Edit 精准片段替换，禁止整文件 Write 重写"。
3. **working/ 已有流水线产物检查**：若 `prototype/working/` 已存在标准流水线产物（spec.md 或 pages/ 非本模式页面），**调用 `AskUserQuestion` 工具**（如可用）三选一：
   - `question`: "working/ 已有原型产物，如何处理本次导入？"
   - `header`: "导入方式"
   - `options`:
     - `{label: "先保存版本再导入（推荐）", description: "先把现有产物 save-version 存档，再以干净工作区导入存量 HTML"}`
     - `{label: "并入现有工作区", description: "导入页与现有页面共存于 working/，保留现有产物"}`
     - `{label: "取消", description: "不导入，保持现状"}`
   - `multiSelect`: false
   - **备选（工具不可用）**：纯文本三选一问询，PM 选择后继续。
   - 选"先保存版本" → 衔接 `save-version`（Phase 5 同款，存档后回到本流程 Phase 1 重新开始）；选"并入" → 直接进入 Phase 1（.extend-html.json 登记不影响存量页面）；选"取消" → 结束。
4. **声明边界**（在 Phase 1 前告知 PM，不打断流程）：
   - 原型以导入页为主：跨页链接保持原 href 并标注「外链」（single-file 只内联当前页；SPA 转换页存量交互可能为快照级）。
   - 修改只做增量：存量元素/样式/脚本不动，除非 PM 明确提及（规则 R1）。

### Phase 1：备份与落副本

运行初始化脚本（脚本+LLM 模式——复制/命名/JSON 写入全由脚本完成，LLM 不自行实现）：

```bash
node "{本技能源码目录}/scripts/init-extend.js" \
  --version-dir="{版本目录}" \
  --inputs="{HTML文件路径1},{HTML文件路径2}" \
  [--answers=...]  # 同名冲突时按交互返回的选项重调
```

> **参数安全（Bash 注入防护）**：`--inputs` 文件路径来自 PM 提供的素材，构造 Bash 命令前必须剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 确认实际路径）；路径值一律用双引号包裹后传入。含非法字符时以剔除后的路径提交并在结果展示中注明，不中断流程。

脚本自动完成（对应契约字段）：
- 校验输入（存在 / .html / 含 `<html`）
- 每个导入页 → `prototype/reference/source/{页面名}.html`（**原稿备份，永不改动**）
- 工作副本 → `prototype/working/pages/{页面名}.html`（basename 清洗：非法字符替换为 `-`，末尾强制 `.html`）
- 入口 `working/index.html`：**单页** → `<meta http-equiv="refresh">` 重定向 stub；**多页** → 页面列表导航入口（简单链接列表，列出所有导入页）
- 模式标记 `working/.extend-html.json`：`{"mode":"extend-html","imports":[{"page","source","importedAt","fromProject"}]}`（状态检测判别键；多次导入追加）

**同名冲突**：脚本返回 `status:"interaction"` + `data.collisions`（source/ 或 pages/ 已存在同名且内容不同）→ LLM 用 AskUserQuestion 让 PM 选择「覆盖 / 新副本 -2」（同名已存在时递增 -2/-3/...），携带 `--answers=overwrite_<N>` 或 `--answers=suffix_<N>` 重调脚本。**内容一致的同名文件视为重复导入，静默跳过**（幂等）。

**多页导入**：single-file 单页或 --project 转换的多页均由此接管——多个 `--inputs` 逐页备份+落副本，`.extend-html.json` 逐页登记。

### Phase 2：提取设计令牌

**进入本阶段先加载产物模板**：Read `references/output-templates.md`（DESIGN.md / design-system.css / page-inventory.md / index.html 四类产物模板）；如果 Read 失败，依据本文件「输出模板」章节的产物清单与填充规则自行构建，不阻塞流程。

每页运行 extract-design 的令牌提取脚本（复用，零改动）：

```bash
node "{extract-design 源码目录}/scripts/extract-css.js" --html="{页面绝对路径}"
```

> 路径解析：`{extract-design 源码目录}` = `{本技能源码目录}/../extract-design/`（向上取同级 extract-design 技能目录）。参数卫生同 Phase 1。

脚本自动提取：色值（hex/rgb/hsl + 频率）、CSS 变量（:root）、字体族/字号/字重/行高、间距、圆角/阴影、组件库识别、DOM 布局标签、资源 URL。

LLM 聚合（每页 JSON → 汇总）：
1. **生成 `working/design-system.css`**：`:root` 语义令牌（主/强调/语义色 LLM 语义归类、字体 top2、间距/圆角取整）。格式见 `references/output-templates.md` 产出 2 模板。
2. **幂等注入每页自身 `<style>` 顶部**：标记注释 `/* === pmcraft tokens (extend-html) === */` 起止块。再次运行已含标记 → 跳过注入（保持页面自包含；页面已有同名 CSS 变量 → 复用其值，不重复定义）。
3. **生成 `working/DESIGN.md`**：`references/output-templates.md` 产出 1 模板骨架（set-style 模板简化版），Do's and Don'ts 简化为「存量延续红线」：不得破坏存量视觉习惯、新增元素必须延续页面既有体系。**不生成 preview.html**。
4. **生成 `working/page-inventory.md`**：每个导入页一条：元素=DOM 可交互元素、状态=已实现状态、跳转=页内锚点 + 外链标注。格式见 `references/output-templates.md` 产出 4 模板。
5. **不生成 spec.md**（extend-html 工作区天然无 spec，不进入 write-spec 流程；Phase 5 收尾衔接标注前若缺失，经 write-spec 补全，见 Phase 5 第 1 步）。

### Phase 3：增量修改（R1-R6）

**进入本阶段先加载文案规范**：Read `pmcraft-proto/_shared/reference/anti-ai-flavor.md`（规则 R5 文案对照用）；如果 Read 失败，默认规避 AI 味表述（夸大的象征意义、宣传性语言、三段式、破折号过度等），不阻塞流程。

修改前建立 **session 历史**：每次修改前将页面当前内容快照存入 `prototype/working/.extend-html-history/`（最多保留 5 次，超限滚动丢弃最旧）。「撤销上一次修改」→ 恢复最近一次快照；彻底回滚 = 重新拷贝 `reference/source/` 原稿。

**逐条确认**：每次修改先展示改动点清单（元素/样式/脚本 + 行号），PM 确认后再改下一条；需求模糊时追问，不臆测。

**修改规则 R1-R6**：

| # | 规则 | 内容 |
|---|------|------|
| R1 | 只动提及部分 | 存量元素/样式/脚本不动，除非 PM 明确提及 |
| R2 | 沿用原内联样式体系 | 新元素优先复用页面已有 class（先 Grep 页面 class 清单）；新样式追加进页面自身 `<style>`（同一注入标记块下方）；**禁止引入外部 CSS/JS/CDN** |
| R3 | 取值来源 | 颜色/字体/间距用注入令牌 `var(--xxx)` 或与页面一致的字面值，二选一全页统一 |
| R4 | 交互惯例 | 沿用页面已有 JS 惯例（内联 `<script>` + addEventListener），绑定 id/class 必须来自实际 DOM；禁止引入框架。**静态分析提示**：check-quality 只识别 `getElementById('x')` / `querySelector(All)('.cls')`（单一 id/class 选择器）绑定——新增按钮/链接的绑定用单一 class 或 `data-action` 属性，复合选择器（如 `'#tbody .btn'`）不会被识别，会把新增按钮误报 HIGH（`interactive_button_clickable`）；存量脚本不受此限 |
| R5 | 文案 | 中文、语气与页面一致；对照 `pmcraft-proto/_shared/reference/anti-ai-flavor.md` 规避 AI 味（夸大的象征意义、宣传性语言、破折号过度等） |
| R6 | 状态 | 新增功能至少覆盖默认态 + 一种状态（加载/空/错误） |

**大文件纪律**：Edit 精准片段替换；**禁止整文件 Write 重写**（可能含 data URI 大图）。

**标注衔接与编辑链顺序（后续轮，标注已存在时）**：本次会话修改完成后、**进入 Phase 4 质检之前**，若 `prototype/working/annotations/` 目录已存在 → 调用 `Skill(pmcraft-proto:annotate-prototype)`（refresh，不传页面参数——基线自动比对变化页；extend-html 页面少，全量兜底成本可忽略）——锚点随本次修改同步、PRD 已存在则顺带补溯源。随后再进入 Phase 4 质检：此时页面已含标注注入标签 → 质检维度 7 启用，但标注已同步、无 stale 锚点噪声。

> **⚠️ 编辑链顺序：本技能与 build-prototype 的 edit 链刻意相反，不是笔误、不是遗漏**
> - **build-prototype edit 链**：`修改 → 质检（默认带 --auto-fix，质检时真实写盘）→ 标注 refresh`——它强制标注 refresh 排在质检**之后**，理由即"auto-fix 会真实写盘改页面，标注必须在最终页面上生成，否则锚点会指向旧态"。
> - **本技能（extend-html）**：`修改 → 标注 refresh → 质检`。因为本技能 Phase 4 **刻意不加 `--auto-fix`**（见 Phase 4 契约），质检不写盘、页面不再变动，标注先刷同样基于最终页面，不会失效；先刷还让质检时页面已含标注注入标签，维度 7 正常启用且无 stale 锚点噪声。
> - **两条链分歧的根因是同一个：本技能不加 auto-fix**。**若将来给本技能加上 auto-fix，本条顺序必须同步改为"质检 → 标注 refresh"**，否则锚点指向旧态（后果：质检维度 7 报出成片 stale 锚点噪声，掩盖真实问题）。
> - **首轮例外**：首轮无标注可刷（`annotations/` 不存在），标注在 Phase 5 收尾、**质检通过后** build 生成，顺序天然是"质检 → 标注"。

### Phase 4：质检（适配参数）

**进入本阶段先加载过滤规则**：Read `references/check-quality-adaptation.md`（存量 vs 新增二分过滤表）；如果 Read 失败，依据下方「结果过滤」表执行，不阻塞流程。

运行 check-quality 脚本（复用，零改动）：

```bash
node "{check-quality 源码目录}/scripts/check-quality.js" \
  --pages="{全部导入页绝对路径（逗号分隔）}" \
  --design-system="{working/design-system.css 绝对路径}" \
  --mode=full
```

> **关键契约（易错）**：`--pages` 分隔符是**逗号**——脚本契约为 `args.pages.split(',')`，空格分隔会把整串视为单一不存在路径 → 全部 pages_skipped → 模板 E，质检形同虚设。
> **不传 `--page-inventory`**：不传时维度 1.2 跳转检查整体跳过（脚本对 http 外链本就不检查）——导入页跨页链接保持原 href 属预期行为，不触发跳转断裂误报。
> **不加 `--auto-fix`（本技能与 build-prototype 的默认行为不同，刻意为之）**：build-prototype 调用 check-quality **默认带 `--auto-fix`**；本技能面向存量页面，自动修复会改写存量配色（将低频色替换为色板最近色），违反"存量不动"纪律（R1），故**刻意不加**。这不是参数上的小出入——它直接决定本技能的编辑链顺序与 build-prototype edit 链相反（标注 refresh 在质检**之前**，见 Phase 3 末「标注衔接与编辑链顺序」）。
> **30 秒超时兜底由本技能编排层自带**：check-quality 脚本无内部超时，30s 兜底历来是调用方职责（build-prototype 各自实现一份）——运行超时 → 视为通过，提示"质量检查超时，建议手动复查关键页面"，不阻塞。

**结果过滤**（LLM 侧，规则见 `references/check-quality-adaptation.md`）：

| 检出项 | 存量问题（记录不阻塞） | 新增代码（必须修复） |
|--------|----------------------|---------------------|
| 低频色不在 top-20 色板 | ✅ 记录，不阻塞 | ❌ 必须修复为令牌色 |
| 缺状态（加载/空/错误） | ✅ 记录，不阻塞 | ❌ 按 R6 补齐 |
| 存量交互不可点/快照级 | ✅ 记录（标注"存量快照级"），不阻塞 | ❌ 必须可交互 |
| 对比度/溢出等其余维度 | 记录，提示但不阻塞 | 记录，提示 |
| 维度 7 标注层 | **首轮天然跳过**（首轮标注在质检后生成，质检时页面无标注注入标签）；**后续轮启用**（页面已含标注注入标签）→ 检出即 ⚠️ 记录并提示，处理方式 = 重新执行 annotate-prototype refresh，不阻塞（annotate-prototype 第九步自检兜底） | — |
| 维度 8 演示层 | **首轮天然跳过**（首轮演示面板在质检后生成，质检时页面无 demo 引用）；**后续轮启用**（页面已含 demo 注入标签）→ 检出即 ⚠️ 记录并提示，处理方式 = 重新执行演示面板生成（demo 数据重派生），不阻塞（demo 资产复制/注入为幂等操作） | — |

> 标注衔接在 Phase 3 末（后续轮 refresh，**质检前**——锚点随修改同步）与 Phase 5 收尾（首轮 build；后续轮 Phase 3 末已 refresh，本步只补演示入口）自动执行，不 spawn design-reviewer（独立设计评审面向标准流水线产物）；标注数据质量由 annotate-prototype 自检兜底，质检不因标注检出阻塞。

### Phase 5：标注衔接、保存与部署

**标注衔接（首轮，annotations/ 不存在时；质检通过后、存档前执行）**：

1. **补全数据文件**（annotate-prototype 硬性前置：spec.md + page-inventory.md 齐备）：
   - `prototype/working/page-inventory.md` 缺失**或未覆盖全部 `pages/*.html`**（清单漂移）→ 按 `references/output-templates.md`「产出 4」模板补全（LLM 从 `pages/` 实际文件提取元素/状态/跳转/备注，**以实际文件为准全量覆盖**，顺带消除清单漂移）
   - `prototype/working/spec.md` 缺失 → 调用 `Skill(pmcraft-proto:write-spec)` 补（write-spec 自动扫描 `brief/` 目录）：
     - `brief/` 有简报 → write-spec 提取 + 追问补齐边界，产出 spec.md（含核心业务规则 R 编号 + 状态矩阵），继续标注
     - `brief/` 无简报 → write-spec 提示需先完成需求分析 → 转告 PM 二选一（AskUserQuestion）：① 说「写需求」先出需求简报再补 spec 再标注（推荐，标注完整）② 跳过标注继续存档（之后随时可说「加标注」补）
2. **生成标注**：调用 `Skill(pmcraft-proto:annotate-prototype)`（build，全量——生成 `annotations/{page}.js` 每页标注数据、幂等注入每页 head 3 行、复制运行时资产；spec.md 缺失时以 PRD 为规则源，PRD 也缺失时规则标注为空，不退出；page-inventory 逐页条目格式时 flow 走每页「跳转」字段）。生成失败不阻塞交付，提示"标注层生成失败：{原因}，PM 可随时说「加标注」重试"。
3. **生成状态演示入口（必做，两条流水线一致）**：为每页生成状态演示面板——右下角「演示」开关，点击切换页面到任意状态展示。分小步执行（3.4 仅在移除请求时执行）：
   - **3.1 派生演示数据**（每页 `demo/{page}.js`）：
     - **标注已生成** → 从 `annotations/{page}.js` 的 `type:"state"` 项派生（复制 `label`/`title`/`text`/`anchor`，不重解析——与标注层同源，规则同 build-prototype 第八步B（唯一权威定义），**含锚点下沉**：锚点 A 包含另一 state 锚点 B 时，演示锚点下沉为 A 容器内第一个非状态锚点、非瞬态（toast/mask/shadow/dialog/backdrop/tip）的直接块级子元素；找不到合适元素 → 保持原锚点不强制；只落 demo 数据不回写标注层）
     - **PM 跳过标注**（第 1 步分支②）→ **仍派生**：数据从 `page-inventory.md` 每页「状态」字段派生（`stateSource: "page-inventory"`；状态承载元素锚点从页面 DOM 语义匹配，匹配失败 → 降级页面级——仅文案展示 + 汇报标记"无锚点状态：{状态名}"）
     - **无状态页** → 空 `items`（面板空态"本页暂无状态演示"），汇报列出
   - **3.2 复制运行时资产**：`{本技能源码目录}/../../_shared/demo/demo-panel.css` + `demo-panel-runtime.js` → `working/` 根（overwrite）；缺失 → 提示"共享演示资产缺失：{文件名}，请检查插件完整性"，退出
   - **3.3 幂等注入**：每页 `</head>` 前注入 3 行（`../demo-panel.css` + `../demo/{page}.js` + `../demo-panel-runtime.js`，顺序固定；**仅 `pages/*.html`，index.html 不注入**；无 `</head>` 页跳过 + 汇总）
   - **3.4 去掉演示入口（PM 说「去掉演示入口 / 移除演示入口 / 移除演示」时）**：幂等移除每页 head 的 demo 3 行引用（`../demo-panel.css` + `../demo/{page}.js` + `../demo-panel-runtime.js`）；删除 `demo/` 数据文件与 working/ 根 demo 资产（demo-panel.css / demo-panel-runtime.js，保留会误导部署）；汇报已移除页面列表（与 build-prototype edit「去掉演示入口」分支同款，两条流水线一致；annotate-prototype 第十步A 仅在 demo/ 存在时重派生，移除后不会重建）
4. **提示**：生成后提示 PM——"页面右下角「规则和状态标注」「流程标注」开关可分别查看规则/状态与流程标注（两个开关可同时开启），右下角「演示」开关可查看状态演示"。

**后续轮（annotations/ 已存在）**：Phase 3 末已 refresh（annotate-prototype 第十步A 在 demo/ 存在时自动重派生演示数据）；若 `demo/` 不存在（此前未生成演示入口）→ 本步补齐：从标注 state 项派生 + 复制资产 + 幂等注入（同第 3 步）。

- **存档**：衔接 `save-version`（复用零改动——`index.html` + `DESIGN.md` + `design-system.css` + `page-inventory.md` + `pages/` 天然满足必须文件清单；标注资产 `annotations.css` / `annotations-runtime.js` / `annotations/` 与演示资产 `demo-panel.css` / `demo-panel-runtime.js` / `demo/` 随 working/ 一并入快照）。`--main` 按 PM 意愿（"保存并设为主分支"）。
- **部署**：衔接 `deploy-prototype`（复用零改动，A 模式多页静态服务；`working/index.html` 为入口，单页 stub 自动重定向；部署源含标注资产时自动附标注开关提示行，含演示资产时附「演示」开关提示行）。
- 存档/部署完成后按状态检测表挂 NEXT 族提示（说「保存版本」/「部署」）。

## 输出模板

目标目录结构骨架（全部产物的落盘位置；`{占位符}` 填充规则见下）：

```
prototype/
├── reference/source/{页面名}.html    ← 原稿备份，永不改动
└── working/
    ├── index.html                    ← 入口（单页 stub / 多页导航）
    ├── .extend-html.json             ← 模式标记 {"mode":"extend-html", ...}
    ├── design-system.css             ← :root 语义令牌（Phase 2 注入）
    ├── DESIGN.md                     ← 存量延续红线声明
    ├── page-inventory.md             ← 元素/状态/跳转 + 外链标注
    ├── annotations.css               ← 标注层运行时样式（Phase 5 收尾衔接复制）
    ├── annotations-runtime.js        ← 标注层运行时逻辑（Phase 5 收尾衔接复制）
    ├── annotations/{页面名}.js       ← 每页标注数据（Phase 5 收尾衔接生成）
    ├── demo-panel.css                ← 状态演示面板样式（Phase 5 复制）
    ├── demo-panel-runtime.js         ← 状态演示面板运行时（Phase 5 复制）
    ├── demo/{页面名}.js              ← 每页状态演示数据（Phase 5 派生）
    └── pages/{页面名}.html           ← 工作副本，就地修改对象（head 含标注 3 行 + 演示 3 行注入）
```

**填充规则**：
- `{页面名}` = 输入文件 basename 清洗后的页面名（非法字符替换为 `-`，末尾强制 `.html`），`pages/` 与 `source/` 同名
- 各产物格式细则（DESIGN.md / design-system.css / page-inventory.md / index.html 模板）见 `references/output-templates.md`
- 任一产物缺失 → 对应阶段未完成，补齐后才可进入下一阶段

产物清单（格式模板见 `references/output-templates.md`，冷材料不内嵌）：

| 产物 | 路径 | 说明 |
|------|------|------|
| 原稿备份 | `prototype/reference/source/{页面名}.html` | 永不改动 |
| 工作副本 | `prototype/working/pages/{页面名}.html` | 就地修改对象 |
| 入口 | `prototype/working/index.html` | 单页 stub / 多页导航 |
| 模式标记 | `prototype/working/.extend-html.json` | 状态检测判别键 |
| 令牌文件 | `prototype/working/design-system.css` | :root 语义令牌 |
| 设计声明 | `prototype/working/DESIGN.md` | 存量延续红线 |
| 页面清单 | `prototype/working/page-inventory.md` | 元素/状态/跳转 + 外链标注 |
| 标注运行时 | `prototype/working/annotations.css` / `annotations-runtime.js` | 标注层运行时（Phase 5 收尾衔接复制） |
| 标注数据 | `prototype/working/annotations/{页面名}.js` | 每页标注数据（Phase 5 收尾衔接生成；页面 head 注入 3 行引用） |
| 演示运行时 | `prototype/working/demo-panel.css` / `demo-panel-runtime.js` | 状态演示面板运行时（Phase 5 复制） |
| 演示数据 | `prototype/working/demo/{页面名}.js` | 每页状态演示数据（Phase 5 派生；页面 head 注入 3 行引用，仅 `pages/*.html`，index.html 不注入） |

## 禁止行为

1. **禁止修改原稿** — `prototype/reference/source/` 永不改动；所有修改只发生在 `prototype/working/pages/` 工作副本
2. **禁止整文件 Write 重写** — 大文件可能含 data URI 大图，必须 Edit 精准片段替换
3. **禁止引入外部资源** — 外部 CSS/JS/CDN 一律禁止；沿用页面内联体系（R2）
4. **禁止引入框架** — 不引入 Vue/React/任何框架，沿用页面内联 `<script>` + addEventListener 惯例（R4）
5. **禁止改动存量内容** — 存量元素/样式/脚本不动，除非 PM 明确提及（R1）
6. **禁止静默修改** — 每次修改先展示改动点清单（元素/样式/脚本 + 行号），PM 确认后再改
7. **禁止跳过状态覆盖** — 新增功能至少覆盖默认态 + 一种状态（R6）
8. **禁止生成 spec.md / preview.html** — 本模式自身不生成规格文档（spec.md 由需求域 write-spec 产出；Phase 5 收尾衔接标注前若缺失，经 write-spec 补全，不自行生成）；PM 要求规格时提示回切 write-spec /「生成 PRD」
9. **禁止未确认覆盖原稿** — 同名冲突必须让 PM 选择（覆盖 / 新副本 -2），绝不静默取第一个
10. **禁止臆造修改结果** — 修改与质检必须展示真实证据（改动点清单、Edit 片段、check-quality 输出），不得虚构"已改好/已通过"或伪造快照内容
11. **禁止跳步** — 备份原稿 → 落工作副本 → 就地小步修改 → 适配质检 → 存档/部署 五步顺序执行，不可跳过任一环节（如未备份直接改原稿、未质检直接存档）

## 约束

1. **校验不可跳过** — 输入必须存在、.html 扩展名、含 `<html` 标记；非 HTML 输入拒绝导入
2. **质检契约不可改** — Phase 4 参数固定：逗号分隔 `--pages`、传 `--design-system`、`--mode=full`、不传 `--page-inventory`、不加 `--auto-fix`、30s 超时兜底。其中**不加 `--auto-fix` 是本技能与 build-prototype 的刻意差异**（不是遗漏），并连带决定后续轮编辑链为"先刷标注、再质检"（见 Phase 3 末与 Phase 4 契约）
3. **存量/新增过滤纪律** — 存量问题记录不阻塞，新增代码偏离必须修复；维度 7（标注层）与维度 8（演示层）首轮天然跳过（标注/演示在质检后生成），后续轮启用（页面含注入标签）且检出不阻塞（处理 = 重新执行标注 refresh / 演示重派生，幂等）
4. **会话历史上限 5 次** — 每次修改前存快照，最多保留 5 次，超限滚动丢弃最旧
5. **逐条确认不可跳过** — 修改前展示改动点清单，PM 确认后再改下一条；模糊时追问

## 正误示例

### 正确示例

**示例 1**：single-file 页面导入与直改。
```
PM: 直接改这个HTML：C:/tmp/legacy/orders.html
```
预期：source/ 备份原稿；工作副本落 pages/；index.html stub 可达；`.extend-html.json` 生成；抽取令牌注入页面 `<style>` 顶部；DESIGN.md/page-inventory.md 产出。

**示例 2**：增量修改。
```
PM: 在订单行加一个取消订单按钮，点击后行状态变已取消
```
预期：展示改动点清单（按钮元素 + 样式 + 脚本 + 行号）→ PM 确认 → Edit 精准片段 → 新样式追加进页面 `<style>` → 按钮可点且有状态切换 → check-quality 存量低频色仅记录不阻塞、新增代码无偏离。

**示例 3**：撤销。
```
PM: 撤销上一次修改
```
预期：从 session 历史（`.extend-html-history/`）恢复最近一次快照。

**示例 4**：首轮收尾衔接（annotations/ 不存在）。
```
PM: 保存原型
```
预期：质检通过后自动补全数据文件（page-inventory.md 缺失 → 按模板全量覆盖；spec.md 缺失且 brief/ 无简报 → 二选一，PM 选「跳过标注」）→ 状态演示入口仍生成（数据从 page-inventory「状态」字段派生）→ save-version 存档（快照含演示资产；标注资产因跳过未生成，之后说「加标注」可补）。

### 错误示例

**错误 1**：整文件重写。
```
（用 Write 覆盖整个工作副本 HTML）
```
**错误**：可能覆盖掉 data URI 大图或破坏页面结构。正确：Edit 精准片段替换。

**错误 2**：新增元素用外部 CDN。
```
<link href="https://cdn.jsdelivr.net/npm/element-plus..." >
```
**错误**：引入外部资源。正确：沿用页面内联体系，新样式追加进页面自身 `<style>`。

**错误 3**：check-quality 用空格分隔 pages。
```
--pages="a.html b.html"
```
**错误**：脚本契约为 `args.pages.split(',')`，空格分隔整串被当作单一不存在路径 → 全部 pages_skipped → 模板 E，质检形同虚设。正确：`--pages="a.html,b.html"`。

**错误 4**：对存量页面的低频色执行 auto-fix。
```
（check-quality --auto-fix 把存量低频色替换为色板最近色）
```
**错误**：违反"存量不动"纪律。正确：不加 `--auto-fix`，存量问题记录不阻塞。

**错误 5**：照搬 build-prototype edit 链，把标注 refresh 排到质检之后。
```
（Phase 4 质检跑完，才调 annotate-prototype 做 refresh）
```
**错误**：本技能 Phase 4 不加 `--auto-fix`，质检不写盘，refresh 本就该在质检**之前**（Phase 3 末）——排到质检之后既多绕一步，又让质检看到的是修改前的旧锚点，维度 7 报出 stale 锚点噪声。正确：后续轮"修改 → 标注 refresh → 质检"；首轮无标注可刷，标注在 Phase 5 质检通过后 build。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 |
| :--- | :--- | :--- |
| working/ 已有流水线产物 | 标准流水线页面与导入页共存 | Phase 0 三选一交互（并入 / 先保存版本 / 取消），默认建议「保存版本」 |
| 同名页再导入 | source/ 或 pages/ 已有同名且内容不同 | 交互让 PM 选「覆盖 / 新副本 -2」，绝不静默覆盖；内容一致 → 幂等跳过 |
| 文件 >2MB | 含 data URI 大图 | 提示小步编辑（Edit 精准片段，禁止整文件 Write）；Phase 4 编排层 30s 超时兜底 |
| 无 spec 启动 | 工作区天然无 spec.md | 要规格时提示 write-spec 或「生成 PRD」回切 |
| 页面含外部资源 | single-file 未完全内联（字体/图片外链） | 保持原样 + 提示"部分资源依赖网络，离线预览时可能缺失" |
| 非 HTML 输入 | 图片/PDF/目录传入 | 校验拒绝，提示只接受 .html/.htm |
| 路径含 shell 元字符 | `'`、`"`、`$`、`;`、`&`、`|` 等 | 剔除元字符后以剔除版路径提交，结果展示中注明，不中断流程 |
| 基线含 `review` 块 | `prototype/.last-check.json` 里有 build-prototype 的评审攒批块 | **本技能不读写该块**（由 annotate-prototype 维护，refresh 时原样保留）；本流水线不 spawn design-reviewer，不受评审攒批影响 |
| PM 要求「加标注」 | 想给导入页加标注层 | 直接衔接 annotate-prototype（build / refresh 按上下文：annotations/ 不存在 → build，存在 → refresh）；标注前置数据文件缺失时先按 Phase 5 补文件逻辑补齐（spec.md 经 write-spec、page-inventory.md 按模板） |
| 数据文件缺失（收尾标注前） | page-inventory.md 缺失/未覆盖全部页面，或 spec.md 缺失 | 先补全再标注：page-inventory 按模板全量覆盖；spec.md 经 write-spec（无简报 → 二选一：写需求后再标注 / 跳过标注存档） |
| 去掉演示入口 | PM 说「去掉演示入口/移除演示入口/移除演示」（extend-html 工作区） | 按 Phase 5 3.4 幂等移除 head 3 行 demo 引用 + 删除 `demo/` 数据文件与 working/ 根 demo 资产，汇报已移除页面列表（移除后 check-quality 维度 8 因无 demo 引用静默跳过） |
| check-quality 超时（>30s） | 页面过大或文件异常 | 编排层兜底视为通过，提示"质量检查超时，建议手动复查关键页面" |
| 多次导入同名登记 | `.extend-html.json` 已有该页条目 | 追加新 import 条目，旧条目保留（历史导入记录不删除） |
| SPA 转换页交互不完整 | 动态 chunk 缺失/交互快照级 | 质检豁免（存量问题记录不阻塞），结构与样式仍 100% 保留 |
| 修改需求提到存量区域 | PM 提及修改存量元素 | 允许改，但修改前必须展示精确改动点（原行 + 新行），PM 确认后执行 |
| HTML 文件不存在 | 路径错误或文件被移动 | Phase 0 校验拒绝并停止，提示"文件不存在，请检查路径"，不创建任何文件 |
| HTML 损坏或内容为空 | 文件存在但无 `<html` 标记 / 空文件 / 二进制乱码 | Phase 0 校验拒绝该页；多页导入中单页损坏 → 该页拒绝导入并提示，其余页继续 |
| 样式/令牌冲突 | 页面已有同名 CSS 变量，或新增样式与存量冲突 | 已有同名变量复用其值、不重复定义（Phase 2 幂等注入）；新增样式与存量冲突时以存量为准（R1/R2），仅记录不覆盖 |
| 修改需求信息不足 | PM 描述模糊（如"改好看一点"） | 逐条确认阶段追问（改哪里/改成什么/影响哪些元素）；PM 无法补充时只执行明确部分，其余标注待定，不臆测 |

## 评估测试用例

### 正向触发（7条）

1. `直接改这个HTML：C:/tmp/legacy/orders.html`（single-file 单页导入）— 备份/落副本/index stub/.extend-html.json/令牌注入/DESIGN.md/page-inventory.md 全产出
2. 导入后「在订单行加一个取消订单按钮，点击后行状态变已取消」— 改动点清单确认 → 副本 diff 仅含新增片段；新样式在页面 `<style>` 内；按钮可点且有状态切换；质检存量低频色仅记录、新增无偏离
3. 连续 3 次修改后「撤销上一次修改」— 恢复上一快照
4. 「保存并设为主分支」→「部署」— save-version 无 missing 交互，E1 与 main/ 内容齐全；部署后首页 200
5. 多次导入同名页（同内容）— 幂等跳过，无覆盖询问
6. 首轮收尾（spec.md + page-inventory.md 已齐，annotations/ 不存在）— Phase 5 自动衔接 build 生成标注：3 行 head 注入 ×N 页 + 资产复制 + 数据文件生成 + "页面右下角两个标注开关"提示；存档快照含标注资产
7. 后续轮修改（annotations/ 已存在）— Phase 3 末自动 refresh（增量），**先于质检**，Phase 4 质检维度 7 启用且无锚点噪声；此顺序与 build-prototype edit 链相反属预期（本技能不加 auto-fix）

### 负向触发（5条）

1. 传入图片/PDF — 校验拒绝，提示只接受 .html/.htm
2. 传入不存在路径 — 校验失败，停止
3. 新增元素用 CDN/外部 CSS — 违反 R2，修改被拒（重做）
4. 一次修改中改动存量区域但未展示精确改动点 — 逐条确认机制拦截，先展示再改
5. 「分析这个HTML：C:/tmp/legacy/orders.html」— 表述含"分析"走 extract-design 路由，不触发 extend-html（路由排除语义）

### 边界查询（8条）

1. working/ 已有标准流水线产物（spec.md + pages/）时再导入 — Phase 0 三选交互出现且默认建议「保存版本」
2. 同名页再导入（内容不同）— `-2` 后缀且 source/ 原稿不覆盖
3. 构造 >2MB 文件 — 小步编辑提示出现
4. 单页 vs 多页导入 — index.html 分别为 stub / 导航列表
5. 收尾标注前 spec.md 缺失（brief/ 有简报）— 自动调 write-spec 补 spec.md → 标注全功能
6. 收尾标注前 spec.md 缺失（brief/ 无简报）— 二选一提示（「写需求」补需求后再标注 / 跳过标注先存档）
7. page-inventory.md 未覆盖全部 pages/ 页面（清单漂移）— 按模板全量覆盖补全后标注，页面不在清单的兜底不再触发
8. 「去掉演示入口」（extend-html 工作区）— 幂等移除 head 3 行 demo 引用 + 删除 `demo/` 数据文件与 working/ 根 demo 资产，汇报已移除页面列表；重跑不重复报错

### 加载链自检（3 项）

1. 三条 Read 加载指令（`references/output-templates.md` / `references/check-quality-adaptation.md` / `pmcraft-proto/_shared/reference/anti-ai-flavor.md`）引用的文件存在；任一缺失 → 按该指令 fallback 执行，流程不中断
2. references/ 下文件不含 Read 指令（禁止嵌套加载）；任一含 Read → 引用错误，按 fallback 执行
3. 每条 Read 指令上下文均带「如果 Read 失败…」fallback；缺失 → 补上后再进入对应阶段

## 参考文档

| 文件 | 加载时机 |
|------|---------|
| `references/output-templates.md` | Phase 2（DESIGN.md / design-system.css / page-inventory.md / index.html 模板）入口 |
| `references/check-quality-adaptation.md` | Phase 4（质检结果"存量 vs 新增"过滤规则）入口 |
| `pmcraft-proto/_shared/reference/anti-ai-flavor.md` | Phase 3（文案规则 R5）入口 |
| `pmcraft-proto/skills/extract-design/scripts/extract-css.js` | Phase 2（令牌提取，复用） |
| `pmcraft-proto/skills/check-quality/scripts/check-quality.js` | Phase 4（质检，复用） |
