---
name: extract-design
description: 从图片、本地HTML文件或网页URL中提取结构化设计信息，输出设计参考报告。当产品经理说"分析这张图"、"分析这个页面"、"看这个网站的风格"、"参考这个"，或上传图片/HTML文件/URL时触发。
type: skill
tags:
  - 设计提取
  - 设计参考
  - 风格分析
  - design
  - analysis
  - reference
  - extraction
  - design-system
allowed-tools:
  - Read
  - Write
  - WebFetch
  - Bash
  - Edit
  - Glob
  - AskUserQuestion
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_evaluate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_click
argument-hint: <输入1> [输入2] ... ["分析重点"] | [--apply <路径>] | [--apply-global <路径>] | [--project <目录>]
prompt: 分析这张图|分析这个页面|看这个网站的风格|参考这个|导入老系统|导入这个系统|读项目代码|参考这个项目|基于这个项目代码|extract-design
dependencies:
  - Node.js（LTS，scripts/extract-css.js 与 scripts/aggregate-styles.js 运行所需）
  - single-file CLI # URL模式的Tier2分析与 --project 模式的主路径转换（--project 模式为硬依赖，npm install -g single-file）
---

# 设计信息提取 (extract-design)

## 概述

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/extract-design/`），脚本路径一律由此锚定解析，不依赖 cwd。

按 7 维度框架（布局结构、组件清单、配色方案、字体方案、间距模式、图标风格、交互细节）从图片、本地 HTML 文件或网页 URL 中提取设计信息，输出结构化的设计参考报告。产物直接写入文件，供 `set-style` 技能直接消费。

## 加载策略总览

| 内容 | 加载时机 | fallback |
|------|---------|----------|
| 输出模板骨架（`references/report-template.md`） | 第四步（按模板输出设计参考报告）入口 | 依据「输出模板」章节保留的章节清单与 7 维度映射说明自行构建，不阻塞流程 |

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| 输入来源 | 图片文件 / HTML 文件 / URL（可混合多个） | 是 | 支持同时传入多种类型。图片（.png/.jpg/.jpeg/.webp/.svg）、HTML 文件（.html/.htm）、网页链接 | `截图.png ./page.html https://example.com` |
| 分析重点 | 自然语言 | 否 | 多个输入时指定侧重方向，必问 | "重点看图1的配色，图2的布局" |
| `--apply` | 路径 | 否 | 导入存量系统模式，输入为 .html 文件或项目目录 | `--apply ./old-system.html` |
| `--apply-global` | 路径 | 否 | 导入全局基准模式，输入为 .html 文件或项目目录，产物写入 `pmcraft/baseline/` | `--apply-global ./brand-system.html` |
| `--project` | 目录 | 否 | 代码项目转换模式，输入为含 package.json 的框架项目目录，启动 dev server 逐路由页转单文件 HTML（主路径）/ 只读提取（兜底） | `--project ./legacy-app` |

## 模式分发

每个输入按类型匹配分析模式，多个输入各自匹配后合并：

| 输入类型 | 分析模式 | 判断依据 |
|---------|---------|---------|
| .png / .jpg / .jpeg / .webp / .svg | 图片模式 | 文件扩展名 |
| .html / .htm 文件 | HTML 模式 | 扩展名 .html / .htm |
| https:// 或 http:// 链接 | URL 模式 | 协议前缀 |
| `--apply` 参数 | --apply 模式（导入存量系统） | 命令标志，修改整体行为 |
| `--apply-global` 参数 | --apply-global 模式（导入全局基准） | 命令标志，产物写入 `pmcraft/baseline/` |
| `--project` 参数 | --project 模式（代码项目转换） | 命令标志，目录含 `package.json` 即触发 |

## 调用方式

```
extract-design <输入1> [输入2] [输入3] ... ["分析重点"]
extract-design --apply <路径>
extract-design --apply-global <路径>
extract-design --project <目录>
```

**示例：**

```
extract-design 截图.png
extract-design ./page.html
extract-design https://example.com
extract-design 图1.png 图2.png 图3.png "重点看图1的配色"
extract-design 图1.png https://example.com page.html "综合配色和布局"
extract-design --apply ./old-system.html
extract-design --apply-global ./brand-system.html
extract-design --project ./legacy-app
```

## 工作流程

### 第一步：确认分析重点

如果 PM 提供了多个输入（如图片 + URL），必须询问分析重点；如果只有一个输入，跳过确认分析重点。

- 多个输入 → 询问："收到 {N} 个输入。这次分析的重点是什么？例如：重点参考图1的配色、链接的布局，还是综合所有？"
- 指定了重点 → 按重点分配分析权重，在报告中标注各输入的主次关系
- 未指定重点 → 综合所有输入并标注各自贡献
- 单输入 → 跳过确认分析重点，继续执行第一步附加

### 第一步附加：确认来源类型

在开始分析之前，必须向 PM 确认素材的来源类型（支持多选，素材可混合）。**调用 `AskUserQuestion` 工具**（如可用）：

- `question`: "这些材料里包含哪些类型？（可多选）"
- `header`: "来源类型"
- `options`:
  - `{label: "竞品参考", description: "竞品截图/网站/UI 灵感参考，仅参考不强制应用"}`
  - `{label: "存量系统", description: "已有的老系统/页面，需要基于它加新功能"}`
  - `{label: "设计师视觉稿", description: "设计师给出的视觉稿，权威级参考，等同规范地位"}`
- `multiSelect`: **true**

PM 勾选后：将来源类型标记到每个输入上，并写入 `design-reference.md` 的「来源概览」表。

**备选（工具不可用时）**：> "这些材料里包含哪些类型？（可多选）① 竞品参考 / 风格灵感 ② 存量系统（在上面加新功能）③ 设计师给的视觉稿"

PM 勾选后，各来源类型对应的级别与报告标记如下，写入 `design-reference.md` 的「来源概览」表：

| 来源类型 | 级别 | 报告中的标记 | 备注 |
|---------|------|------------|------|
| 设计师视觉稿 | 权威级 | 等同 specs，覆盖存量/竞品 | |
| 存量系统 | 基准级 | specs 有值时对齐 specs | |
| 竞品参考 | 参考级 | 仅记录，不强制应用 | |
| PM 口头描述 | 参考级 | 竞品参考-文字描述 | 非实测色值/字体，需样板确认重点校验 |

混合素材时：按类型分节写入报告（如「设计师视觉稿 — 提取结果」「竞品参考 — 提取结果」），每节标注身份。

### 第二步：按模式执行分析

按模式分发规则，对每个输入执行对应模式的分析路径。

**如果输入是图片**，执行图片分析路径：

1. **检测多模态能力**：尝试读取图片文件。
   - AI 无法看到图片内容（非多模态模型）→ 告知 PM："我当前使用的模型不支持看图，无法分析图片。需要你在支持图片识别的模型环境下重新使用本技能，或者把页面保存为 HTML 文件上传，我可以通过分析代码提取设计信息。" → **退出处理**，不继续执行。
2. 可读取图片内容 → 按 7 维度框架逐张提取设计信息。
3. 多张图片：先逐张提取单张摘要，再综合对比找一致点和矛盾点。
4. **颜色必须用精确 hex 值**（如 `#d4a574`），不可用模糊描述。字体只能推测，标注 `[推测]`。
5. 进入下游处理（见本步末尾说明）。

**如果输入是 HTML 文件**，执行 HTML 分析路径：

1. **运行 `scripts/extract-css.js` 提取结构化设计数据**（替代手动解析）：
   ```bash
   node "{本技能源码目录}/scripts/extract-css.js" --html="<HTML 文件路径>"
   ```
   > **参数安全（Bash 注入防护）**：`--html` 的文件路径来自 PM 提供的素材（用户输入），构造 Bash 命令前必须剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 确认实际文件路径）；路径值一律用双引号包裹后传入。含非法字符时以剔除后的路径提交并在结果展示中注明，不中断流程。
   脚本自动提取：色值（hex/rgb/hsl + 频率）、CSS 变量（:root）、字体族/字号/字重/行高、间距（padding/margin/gap）、圆角/阴影、组件库识别（el-*/ant-*/tw-* 前缀）、DOM 布局标签、资源 URL。
2. **LLM 消费脚本输出的 JSON**：将 `colors`/`typography`/`spacing`/`decoration`/`component_library`/`dom_layout` 填入设计参考报告模板。
3. **AI 判断部分**（脚本不覆盖）：风格归类（Organic/Minimal/Playful/Editorial）、综合分析（"可借鉴/需避免"）、布局模式判断（居中/双列/侧边栏）。
4. 交互细节章节标注 `[无交互数据，静态 HTML 无法分析]`。
5. 进入下游处理（见本步末尾说明）。

**如果输入是 URL**，按优先级执行以下策略：

- **Tier 1（Playwright MCP 可用）**：
  > **文件输出规范**：所有 Playwright 工具的 `filename` 参数必须带 `.playwright-mcp/` 前缀（如 `.playwright-mcp/snapshot-login.md`），禁止裸文件名散落在项目根目录。
  1. 用 `browser_navigate` 导航到目标 URL。
  1a. **登录检测**：用 `browser_snapshot` 检查当前页面是否为登录页。
      - 判定特征：页面含登录表单（密码输入框 + 登录按钮）、URL 跳转到 login/auth/signin 路径、页面标题含"登录"/"Login"/"Sign in"。
      - 如果检测到登录页 → **暂停分析，告知 PM**：
        > "该页面需要登录才能访问。请在 Playwright 浏览器中手动完成登录操作，完成后告诉我'好了'或'继续'，我再继续分析页面。"
      - PM 确认后 → 再次 `browser_snapshot` 确认是否已离开登录页：
        - 已离开 → 继续下一步。
        - 仍在登录页 → 告知 PM："似乎还未完成登录，仍在登录页面。请确认登录成功后告诉我，或说"跳过"放弃该 URL。"
      - 如果 PM 表示无法登录（无账号等）→ 告知"无法登录，跳过该 URL 分析"，退出该 URL 的处理。
  2. 用 `browser_take_screenshot` 截图，多模态分析视觉布局。**截图路径规范**：`filename` 必须带 `.playwright-mcp/` 前缀（如 `.playwright-mcp/extract-ref.png`）或传绝对路径至 `{version_dir}/screenshots/`；分析完成后截图归档至 `prototype/reference/source/`。**禁止**裸文件名落在项目根目录。
  3. 用 `browser_evaluate` 注入 JS，提取精确设计令牌（计算样式）。异步交互验证遵循 `../../_shared/reference/playwright-verify-guide.md`（async IIFE + sleep，禁止 setTimeout 回调调用外部 resolve / window.__xxx 全局残留）。
  4. 用 `browser_snapshot` 读取页面结构。
  5. 用 `browser_snapshot` + `browser_click` 观察交互行为（hover、点击响应）。
  6. 记录交互细节描述。

- **Tier 2（Playwright 不可用，SingleFile CLI 可用）**：
  1. 执行 `single-file` 获取完整内联 HTML。
     > **URL 卫生（Bash 注入防护，与 HTML 模式路径卫生同源）**：URL 来自用户输入且常含 `&`/`?` 等 shell 元字符，构造 Bash 命令前必须：① 校验以 `http://` 或 `https://` 开头、不含换行/回车；② 剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 确认实际 URL）；③ URL 一律用双引号包裹后作为 `single-file` 参数传入。含非法字符时以剔除后的 URL 提交并在结果展示中注明，不中断流程。
  2. **登录检测**：先检查抓取到的 HTML 是否为登录页，再决定是否分析。
      - 判定特征：HTML 中含登录表单（`<input type="password">` + 登录按钮）、`<title>` 含"登录"/"Login"/"Sign in"、页面主体仅有登录框而无业务内容。
      - 如果检测到登录页 → **先自检 Playwright MCP 是否可用**，再告知 PM：
        > "SingleFile 抓取到的是登录页面，该网站需要登录后才能访问业务内容。"
        - 如果 Playwright MCP 可用 → 直接切换到 Tier 1 流程重新执行（可交互式等待 PM 登录）。
        - 如果 Playwright MCP 不可用 → 告知 PM："有两个方案：① 安装 Playwright MCP，我可以通过浏览器交互等你手动登录后再分析；② 你在浏览器中登录后，把目标页面保存为 HTML 文件拖给我分析。"
      - PM 选择方案 ① → 安装后切换到 Tier 1 流程重新执行。
      - PM 选择方案 ② → 等待 PM 提供 HTML 文件，按 HTML 模式分析。
      - PM 表示无法登录 → 跳过该 URL，记录原因。
  3. 走 HTML 模式的分析步骤。
  4. 标注来源为"SingleFile 内联页面"。

- **Tier 3（仅 WebFetch 可用，兜底）**：
  1. 用 WebFetch 获取原始 HTML。
  2. **登录检测**：先检查返回的 HTML 是否为登录页，再决定是否分析。同 Tier 2 步骤 2 的判定特征和处理逻辑。
  3. 走 HTML 模式的分析步骤。
  4. 报告中标注 `精度较低（仅原始 CSS，非计算样式）`。

- **Playwright 和 SingleFile 均不可用**：
  1. 告知 PM 当前情况。
  2. **调用 `AskUserQuestion` 工具**（如可用）：

     - `question`: "当前仅 WebFetch 可用，只能获取页面的原始 HTML，无法提取精确的计算样式。推荐安装 Playwright MCP 或 SingleFile CLI。"
     - `header`: "工具安装"
     - `options`:
       - `{label: "安装工具", description: "给出安装指引（Playwright MCP 或 SingleFile CLI），装完后再执行分析"}`
       - `{label: "先用 WebFetch", description: "降级使用 WebFetch，精度较低，输出标注精度说明"}`
     - `multiSelect`: false

  3. PM 选"安装工具" → 给出具体安装指引，装完后再执行分析。
  4. PM 选"先用 WebFetch" → 降级到 Tier 3。

     **备选（工具不可用时）**：> "当前仅 WebFetch 可用，只能获取页面的原始 HTML，无法提取精确的计算样式。推荐安装 Playwright MCP 或 SingleFile CLI（npm install -g single-file）。需要我引导你安装吗？还是先用 WebFetch 分析？"

- **所有 Tier 均无法获取页面内容** → 告知 PM："该页面无法访问，目前无法分析。" **不降级到截图+多模态方式。**

- **URL 加载超时**：Playwright 导航超过 15 秒 → **调用 `AskUserQuestion` 工具**（如可用）：

  - `question`: "页面加载较慢（已超过 15 秒），是否继续等待？"
  - `header`: "加载超时"
  - `options`:
    - `{label: "继续等待", description: "将超时放宽至 30 秒继续尝试加载"}`
    - `{label: "跳过此 URL", description: "放弃当前 URL，切换到其他来源或结束"}`
  - `multiSelect`: false

  PM 选"继续等待" → 超时放宽至 30 秒重试。
  PM 选"跳过" → 放弃该 URL，记录原因。

  **备选（工具不可用时）**：> "页面加载较慢，是否继续等待或尝试其他页面？"

**如果输入是 --apply 模式（导入存量系统）**：

此模式专门处理 PM "基于这个老系统加新功能" 的场景。输入可以是单个 .html / .htm 文件或整个项目目录。

0. **代码项目互通报**：如果输入是目录，且目录含 `package.json` 且其中存在 dev script（`scripts.dev` / `scripts.serve` / `scripts.preview` 任一）→ 告知 PM：
   > "检测到可运行框架项目（{package.json 中的框架名}）。建议改走项目代码转换（说「读项目代码」）——启动项目逐路由页转成单文件 HTML，再在 HTML 上直接增量扩展。"
   同时给出三选（AskUserQuestion，如可用）：
   - `{label: "转代码项目（推荐）", description: "改走 extract-design --project，启动 dev server 逐路由页转换"}` 
   - `{label: "坚持静态导入", description: "按 --apply 静态导入处理（框架项目通常跑不起来，产物为静态快照）"}`
   PM 选"转代码项目" → 切换执行 `--project` 流程；PM 坚持静态导入 → 按 --apply 继续。**备选（工具不可用）**：纯文本三选一问询。

1. **拷贝原始文件到 reference/source/**：
   - 单文件 → 创建 `prototype/reference/source/` 目录，拷贝为 `prototype/reference/source/index.html`
   - 整个目录 → 完整拷贝到 `prototype/reference/source/`（保留原目录结构）
   - `prototype/reference/source/` 是原始备份，永不改动

2. **识别框架结构**：从 DOM 层级分析框架元素：
   - 从语义标签（`<header>` / `<nav>` / `<main>` / `<footer>`）、`role` 属性、class 命名推断
   - 识别顶部导航、左侧菜单、内容区、页脚等框架组成部分
   - 提取框架相关文件到 `prototype/working/framework/`，保留原有交互逻辑
   - 内容区标记为动态填充区域
   - 无法准确判断时 → 标记"待确认"并向 PM 展示 DOM 结构让 PM 确认后再继续

3. **提取设计系统**：与 HTML 模式相同步骤，从 CSS 中提取配色/字体/间距/圆角/组件风格。

4. **输出四份产物**：
   - `prototype/reference/source/` — 原始文件完整拷贝（不改动）
   - `prototype/working/framework/` — 框架壳（可修改）
   - `prototype/working/DESIGN.md` — 设计系统声明（可修改，格式遵循 set-style 的 DESIGN.md YAML + Markdown 模板，将提取到的色值/字体/间距填充进去）
   - `prototype/working/design-system.css` — CSS 变量文件（可修改）

5. **生成设计参考报告**：与普通模式相同，输出到 `prototype/reference/design-reference.md`。

6. **（由路由层衔接）生成样板页**：--apply 完成后，CLAUDE.md 路由层会自动调用 `set-style`（调整模式）生成 `prototype/working/preview.html` 设计系统样板页，供 PM 确认视觉效果后再进入后续流程。本技能不直接调用 set-style。

**如果输入是 --apply-global 模式（导入全局基准）**：

此模式专门处理 PM "设置品牌全局基准" 的场景。行为与 `--apply` 类似，但所有产物输出到 `pmcraft/baseline/` 而非 `{版本}/prototype/`。

1. **拷贝原始文件到全局 source/**：
   - 单文件 → 创建 `pmcraft/baseline/source/` 目录，拷贝为 `pmcraft/baseline/source/index.html`
   - 整个目录 → 完整拷贝到 `pmcraft/baseline/source/`（保留原目录结构）
   - `pmcraft/baseline/source/` 是原始备份，永不改动

2. **识别框架结构**：与 `--apply` 相同逻辑，但框架文件写入 `pmcraft/baseline/framework/`

3. **提取设计系统**：从 CSS 中提取配色/字体/间距/圆角/组件风格，写入 `pmcraft/baseline/DESIGN.md` + `pmcraft/baseline/design-system.css`

4. **输出五份产物**（均写入 `pmcraft/baseline/`）：
   - `source/` — 原始文件完整拷贝（不改动）
   - `framework/` — 框架壳
   - `DESIGN.md` — 全局设计令牌声明
   - `design-system.css` — 全局 CSS 变量
   - `design-reference.md` — 设计参考报告

5. **完成后提示**：
   > "全局基准已设置。后续所有版本的 `initialize-structure` 和 `set-style` 将自动以此基准为默认值，版本特定参考可覆盖基准中的具体令牌。"

**与 --apply 的关键区别**：
- 写入 `pmcraft/baseline/` 而非 `{版本}/prototype/`，不绑定版本号
- 产物跨版本共享，作为所有版本的唯一设计源头
- `initialize-structure` 创建新版本时会从此目录继承四件套
- `set-style` 在没有版本特定报告时会以此基准为默认值

**如果输入是 --project 模式（代码项目转换）**：

此模式专门处理 PM "参考这个项目 / 读项目代码" 的场景。输入为含 `package.json` 的框架项目目录（Vue/React）。核心心智与 extract-design 其他模式一致：**转换为主，提取兜底**——能跑的项目启动 dev server 逐路由页转成单文件 HTML，后续交给 extend-html 就地直改；跑不起来/残缺的项目只读提取架构与样式参考，走 set-style 生成新原型。**不改任何项目代码**。

1. **输入校验与框架识别**：目录含 `package.json` → 读 dependencies → 识别框架（Vue2/Vue3/React）、构建工具（vite/webpack）、UI 库、样式方案。无 `package.json` → 提示按原生多文件处理（--apply 静态导入）或 HTML 提取。

2. **读路由配置**：从路由配置文件（vue-router / react-router 的 routes 数组或路由文件）读取 → 页面 URL 清单（页面名 + 路径，如 `/` → 首页、`/orders` → 订单列表）。
   - **动态路由（`/order/:id`）标记为动态**，转换前向 PM 询问示例参数实例化（如 `id=1024`）：PM 提供 → 用示例参数转换；不提供 → 跳过并记录。
   - **忽略旧功能**：业务组件与逻辑只列清单不细读（禁止读业务逻辑）。

3. **环境预检**（任一失败走第 9 步兜底）：
   - ① node/npm 缺失 → 告知 PM 安装 Node.js LTS，装好后重试。
   - ② **single-file CLI 缺失** → 给安装指引（`npm install -g single-file`）；PM 拒绝安装 → 走兜底。**此分支必须显式处理**——--project 模式硬依赖 single-file（extract-design 中它只是可选依赖）。
   - ③ **node_modules 缺失/依赖不完整** → **先问 PM 是否执行 `npm install`**（AskUserQuestion，附预计耗时提示："依赖较多时可能需要几分钟"）。同意 → 安装后继续；拒绝或安装失败 → 走兜底。这是最常见且可恢复的场景，直接兜底会让主路径命中率极低。

4. **启动项目**：检测 dev script（`npm run dev` / `vite` / `preview` 等 scripts 字段）→ 后台启动 dev server → 就绪探活（轮询首页 HTTP 200，超时 ~120s）→ **记录启动进程 PID**（供第 10 步收尾）。启动失败 → 走兜底。

5. **登录/鉴权检测**：用 Playwright（或抓首页）检测首跳是否为登录页（复用 URL 模式判定特征：密码框 + 登录按钮 / login 路径跳转 / 标题含"登录"）。存量系统多为管理后台，**鉴权是常态而非边缘**：
   - 检测到登录页 → Playwright 打开本地 dev server 让 PM 手动登录一次（话术同 URL 模式 Tier 1："请在浏览器中手动完成登录操作，完成后告诉我'好了'"），登录态就绪后携带会话逐页转换。
   - PM 无法提供账号 → 仅转换免登录页面，其余标注"鉴权不可达"跳过，**不硬生成**。

6. **逐路由页转换（主路径）**：对每个 URL 走 URL 内联路径（single-file CLI，携带登录会话）→ 单文件 HTML：
   - **关键参数**：必须带 `--block-scripts=false --browser-wait-delay=2000`——single-file 默认 `--block-scripts=true`（阻止脚本执行），SPA 页面（Vue/React）不执行 JS 时抓到的只有空壳 `<div id=app>`；加参数后等客户端渲染完成再序列化，结构与样式 100% 保留。单条 URL 建议单独执行（single-file 偶发 "Execution context not found" 报错，重试即可）。
   - `prototype/reference/source/{页面名}.html`（原始备份，永不改动）
   - `prototype/working/pages/{页面名}.html`（工作副本）
   - 转换后用 Playwright 打开验证渲染（检查 `<div id=app>` 内是否有渲染 DOM）；动态 chunk 缺失/交互不完整的页面标注**"快照级"**（质检豁免依据，结构与样式仍 100% 保留）；**单页转换失败不硬生成**，记录失败页继续其余页。

7. **交接 extend-html**：调用 `extend-html/scripts/init-extend.js --from-project` 生成 `working/index.html` 入口与 `.extend-html.json`（imports 多页条目，source 标注"项目代码转换"）；随后 extend-html 从 **Phase 2** 起接管（抽令牌/清单/直改/质检/存档/部署）——Phase 1 的产物落盘由 init-extend.js 单点完成，**本模式不自行重写 index.html / .extend-html.json**（杜绝双写漂移）。脚本路径：`{extract-design 源码目录}/../extend-html/scripts/init-extend.js`。

8. **令牌提取**：运行 `scripts/aggregate-styles.js` 聚合项目全局样式（CSS 变量/色板/字体/间距）输出 JSON，供 extend-html Phase 2 校验与 design-reference 的"页面架构"维度使用：
   ```bash
   node "{本技能源码目录}/scripts/aggregate-styles.js" --project-dir="{项目目录}"
   ```
   （参数卫生同 HTML 模式；聚合脚本自动排除 node_modules/dist 等构建目录）

9. **兜底路径（环境/启动/登录全失败时）**：只读提取 → `prototype/reference/design-reference.md`（新增"页面架构（代码项目）"维度：框架/技术栈、页面路由清单、布局结构、样式方案）+ 可选 design-system.css 令牌 → 提示走 `set-style`（"沿用现有风格"）→ plan-pages → build-prototype 标准流水线。**不改任何项目代码、不生成 framework 壳**。

10. **收尾**：关闭 dev server——**自管 PID 文件 + 进程树终止**：将第 4 步记录的 PID 写入项目内 `{version_dir}/prototype/.extend-dev.pid`，结束时运行 `taskkill /T /PID {pid}`（Windows）杀 npm 包装进程及其 vite 子进程，防孤儿进程；随后删除 PID 文件。**不复用 `_shared/scripts/stop-services.js`**——它只扫 `prototype/{working,main,E*}/mock/.server.pid` 与 `survey/web/mock/.server.pid`，管不了外部 dev server。

**与 --apply 的关键区别**：
- 输入是框架项目目录而非 HTML/静态目录，目标是**可运行转换**而非静态快照导入
- 产物直接落 source/ + pages/ 并由 extend-html 接管就地直改（--apply 是抽壳 framework/ 重新生成）
- 兜底时才走"提取 → set-style"标准流水线；--apply 无启动/登录环节

### 分析后融合：全局基准与规范对齐

在执行下游处理（第三步合并或第四步输出）之前，检测并融合全局基准和权威规范：

1. **检测 `pmcraft/baseline/design-reference.md`**：
   - 存在 → 读取所有章节，视为"基线层"
   - 不存在 → 跳过融合，行为不变

2. **检测 `pmcraft/specs/`**：
   - 存在且非空 → 读取其中品牌色/字体/圆角/间距作为 ground truth
   - 不存在或为空 → 静默跳过

3. **执行逐字段融合**（当前分析 > specs > 基线）：
   - 当前分析结果有值的字段 → 使用当前值（覆盖 specs 和基线）
   - 当前分析结果无值但 specs 有值 → 使用 specs 值（ground truth），标注来源
   - 当前分析和 specs 均无值但基线有值 → 使用基线值（继承）
   - 三者都无值 → 标注"缺失"
   - specs 有值但当前分析或基线值不同 → 标注"偏离规范"，以 specs 为准
   - 被覆盖的基线/specs 值在报告中标注来源

4. **在确认摘要中告知 PM**：
   > "已融合权威规范和全局基准：{N} 个令牌来自当前分析，{M} 个来自权威规范（pmcraft/specs/），{K} 个来自全局基准，{L} 个偏离规范已标注。"

5. **如果 `pmcraft/baseline/` 有素材文件但无 `design-reference.md`**：
   - 在报告"综合分析"中标注"全局基准目录存在 {N} 个参考文件但未生成设计报告，PM 可运行 extract-design --apply-global 生成基准"

> **下游处理说明**：图片模式和 HTML 模式的分析完成后，如果存在多个输入来源，进入第三步合并；如果仅单输入，直接进入第四步按模板输出。

### 第二步附加：外来资源包提取

**触发条件**：输入是 HTML 文件或 `--apply` 目录，且源文件引用了外部资源（`<link>` CSS、`@font-face` 字体文件、`<img>` 本地图片、本地 JS 等）。

**不含** Element Plus 系统——如果是 Element Plus（检测到 `<el-` 组件前缀或 `element-plus` 关键词引用），跳过此步，已有项目离线包覆盖。

**意图判断**：资源处理方式取决于 PM 的意图。从调用上下文获取（CLAUDE.md 路由层在触发 extract-design 前已向 PM 确认）。如果意图未明确，主动问 PM："这是在上面加功能，还是看风格作参考？"

| PM 意图 | 资源处理 | design-reference.md 标记 |
|---------|---------|------------------------|
| 存量导入（"在上面加功能"） | 完整复制到 vendor，build-prototype 必须引用 | `约束级别：强制` |
| 外部参考（"看风格"） | 复制到 vendor 但标注为参考 | `约束级别：可选` |

**提取流程**：

1. **扫描资源引用**：从 HTML/CSS 中提取：
   - `<link rel="stylesheet">` 引用的 CSS 文件
   - `@font-face` 中 `url()` 引用的字体文件（.woff/.woff2/.ttf/.otf）
   - `<img src="...">` 或 CSS `background-image` 引用的本地图片
   - `<script src="...">` 引用的本地 JS（非 CDN 的外部库）
   - CSS 中 `@import` 引用的样式文件

2. **确定 source-name**：从输入来源推断。取文件夹名或文件名主干（不含扩展名），如 `my-legacy-app`、`landing-page`。

3. **复制资源到 vendor**：
   - 创建 `prototype/working/assets/vendor/{source-name}/` 目录
   - 保持原始目录结构（如 CSS 在 `css/` 下、字体在 `fonts/` 下）
   - 路径已存在 → 覆盖更新

4. **在 design-reference.md 中追加"资源清单"章节**：按本文件「输出模板 → 资源清单」章节的格式与占位符写入（资源类型行按实际资源逐行列出，路径形如 `assets/vendor/{source-name}/css/main.css`、`fonts/custom.woff2`、`icons/logo.svg`），约束级别按意图填 `强制 / 可选`。

5. build-prototype 生成页面时：
   - **强制**：必须按资源清单逐一引入所有资源
   - **可选**：以 DESIGN.md 为准，资源清单仅作参考

### 第三步：合并多来源分析结果

存在多个输入来源时（图片+URL 或图片+图片等），将各来源分析结果合并为一份报告：

- **配色方案**：取出现频率最高的色值作为主色/强调色，其余标注"备选"
- **字体方案**：取多数来源一致的字体；冲突时标注"不同来源不一致"
- **布局特征/组件风格**：取共性描述；差异点在综合分析中标注
- **矛盾点**：在综合分析的"需注意"中列出不一致之处

单输入来源时跳过合并，直接使用该来源的分析结果。

### 第四步：按模板输出设计参考报告

**加载输出模板**：先执行 `Read references/report-template.md` 读取 design-reference.md 完整代码块骨架。如果 Read 失败，依据本文件「输出模板」章节保留的章节清单（来源信息/风格判断/配色方案/字体方案/布局特征/组件风格/综合分析/交互细节/图标风格/资源清单）与 7 维度映射说明自行构建模板，不阻塞流程。

将第三步（合并后）的分析结果填入"输出模板"章节定义的模板，生成完整的 `design-reference.md`。

### 第五步：PM 确认准确性

展示提取摘要供 PM 确认：

> "提取完成，核心信息如下：
> - 风格：Organic Natural
> - 主色：暖杏 #d4a574
> - 字体：Karla + DM Sans [推测]
> - 布局：大留白居中，圆角卡片 16px
>
> 带 [推测] 的项后续设定风格时可以调整替换。
> 请确认是否准确，有误可以纠正后重新生成。"

PM 确认后报告锁定。PM 纠正后只重新提取相关维度，其他维度保留不变。

### 第六步：保存文件

**不得擅自决定保存路径。** 先询问 PM：

> "请确认项目路径，所有产物将保存在 prototype/ 下。
> 参考报告 → reference/design-reference.md
> 原始文件备份 → reference/source/（--apply 模式）
> 工作文件 → prototype/working/framework/ 等
> 路径：默认为当前目录，或输入其他路径。"

**普通模式**：写入 `{功能顶级文件夹}/{版本}/prototype/reference/design-reference.md`

**--apply 模式**：
- 原始文件备份 → `{功能顶级文件夹}/{版本}/prototype/reference/source/`
- 框架文件 → `{功能顶级文件夹}/{版本}/prototype/working/framework/`
- 设计系统 → `{功能顶级文件夹}/{版本}/prototype/working/DESIGN.md` + `{功能顶级文件夹}/{版本}/prototype/working/design-system.css`
- 设计参考报告 → `{功能顶级文件夹}/{版本}/prototype/reference/design-reference.md`

**--apply-global 模式**：所有产物写入 `pmcraft/baseline/`（不绑定版本号）
- 原始文件备份 → `pmcraft/baseline/source/`
- 框架文件 → `pmcraft/baseline/framework/`
- 设计系统 → `pmcraft/baseline/DESIGN.md` + `pmcraft/baseline/design-system.css`
- 设计参考报告 → `pmcraft/baseline/design-reference.md`

目录不存在时自动创建。文件已存在时询问是否覆盖。使用 `Write` 直接写入文件，未经 PM 确认不得擅自保存。

## 禁止行为

1. **禁止编造设计信息** — 所有结构、配色、字体、组件信息必须来自实际输入素材；无法从素材确认的信息标注"未知"或向 PM 追问，不得臆造
2. **禁止截图裸文件名落在项目根目录** — Playwright 工具的 `filename` 必须带 `.playwright-mcp/` 前缀或传绝对路径至 `{version_dir}/screenshots/`，分析后截图归档至 `prototype/reference/source/`
3. **禁止修改输入源文件** — 分析只读输入（图片/HTML/URL），不写回不覆盖源素材
4. **禁止未经确认写入/覆盖设计资产** — `--apply` / `--apply-global` 模式产物落盘前须向 PM 确认（文件已存在时询问是否覆盖），不得擅自保存
5. **禁止跳过来源标注** — 报告中每条结论必须标注来源（哪个输入、哪个区域），无来源的结论不得作为可采纳项
6. **禁止读业务逻辑（--project 模式）** — 业务组件与逻辑只列清单不细读，只关注路由/布局/样式
7. **禁止修改项目代码（--project 模式）** — 转换只读项目目录，不改任何项目文件；收尾关闭 dev server 用 taskkill 进程树终止
8. **禁止硬生成（--project 模式）** — 单页转换失败记录失败页继续其余，不硬生成；动态路由无示例参数跳过并记录

---

## 输出模板

模板文件保存到 `{功能顶级文件夹}/{版本}/prototype/reference/design-reference.md`。

文档标题统一使用 `设计参考报告`。至少包含来源信息、风格判断、配色方案、字体方案、布局特征、组件风格、综合分析 7 个章节。`{占位符}` 替换为实际值。

> **7 维度映射说明**：模板中各章节与 7 维度的对应关系为 — 配色方案/字体方案/图标风格/交互细节各有独立章节，布局结构+间距模式合并于"布局特征"，组件清单对应"组件风格"。此外，来源信息/风格判断/综合分析为元信息章节。

---

## 约束

1. **颜色必须输出精确 hex 值** — 不可使用颜色名称或近似描述（如"深蓝色"）。统一使用小写 hex（如 `#1890ff`）。

2. **图片模式的字体标注 `[推测]`** — 图片无法精确确定字体；HTML/URL 模式字体为精确值。

3. **多个输入时必须先问重点** — 不假设 PM 意图，避免分析结果偏离需求。

4. **升级引导不可跳过** — Playwright 和 SingleFile 均不可用时必须告知 PM 并让 PM 选择是否安装，不能静默降级。URL 获取失败时不得降级到截图+多模态方式。**无论哪个 Tier 遇到登录页，必须告知 PM 并给出升级路径，不能静默抓取登录页 HTML 当作分析结果。**

5. **确认步骤不可跳过** — 分析完成后必须展示摘要让 PM 确认，确认后方可保存。

6. **禁止擅自保存** — 未经 PM 确认路径不得写入文件。禁止修改用户原始文件。

7. **禁止生成原型或设计系统** — 本技能只提取和报告设计信息，不生成 HTML、CSS 或 DESIGN.md（--apply 模式除外）。

8. **不依赖设计数据库** — 完全基于输入源提取信息，不调用 styles.csv / colors.csv 等外部数据源。

9. **URL 加载超时默认 15 秒** — 超时后询问 PM 是否延长等待或改用其他来源。

10. **全局基准融合规则** — 每次执行检查 `pmcraft/baseline/design-reference.md` 和 `pmcraft/specs/`，存在则三层融合：当前分析 > specs（ground truth）> 基准（兜底）。specs 有值时基线同字段必须对齐 specs，不一致的标注"偏离规范"。不可跳过检测，不可静默覆盖。

---

## 与 set-style 的衔接（内部）

extract-design 与 set-style 同属 pmcraft-proto，产物通过文件路径直接消费。

| 设计参考报告 字段 | DESIGN.md 字段 |
|---------------------------|---------------|
| 配色方案.Primary | colors.primary |
| 配色方案.Accent | colors.accent |
| 配色方案.Background | colors.background |
| 配色方案.Surface | colors.surface |
| 配色方案.Text | colors.text |
| 配色方案.Border | colors.border |
| 配色方案.Success / Danger | colors.success / colors.danger |
| 字体方案.标题字体 | typography.heading-font |
| 字体方案.正文字体 | typography.body-font |
| 字体方案.字号层级 | typography.* |
| 字体方案.行距 | typography.*.lineHeight |
| 布局特征.卡片圆角 | radius.lg / components.card.rounded |
| 布局特征.间距节奏 | spacing.* |
| 组件风格.* | components.* |
| 图标风格.* | DESIGN.md Do's and Don'ts |

---

## 正误示例

### 正确示例

```
extract-design 首页截图.png
```
预期：读取图片，按 7 维度框架分析，输出设计参考报告。

```
extract-design 登录页.html
```
预期：读取 HTML，从 CSS 提取精确设计令牌，识别组件库。

```
extract-design https://example.com
```
预期：尝试 Playwright → SingleFile → WebFetch 获取页面，输出报告。

```
extract-design 图1.png 图2.png https://example.com "重点看图1配色，链接布局为辅"
```
预期：分别分析两张图和链接，合并输出一份报告，含综合分析和矛盾点。

### 错误示例

**无输入参数**
```
extract-design
```
**错误**：无输入来源，技能无法工作。正确：提供图片、HTML 文件或 URL。

**颜色输出"深蓝色"而非 hex**
```
主色：深蓝色
```
**错误**：pmcraft-proto 无法将"深蓝色"映射为 CSS 变量。正确：`主色：#1890ff`

**不询问重点直接分析多个输入**
```
（收到 3 张图后直接开始分析）
```
**错误**：PM 可能有特定侧重，不确认会造成方向偏离。正确：先询问重点。

**Playwright 和 SingleFile 均不可用时静默降级**
```
（直接使用 WebFetch 不告知 PM）
```
**错误**：PM 不知道当前分析精度较低。正确：告知 PM 并让 PM 选择是否安装。

---

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 |
| :--- | :--- | :--- |
| HTML 文件无 `<style>` 块 | 所有样式通过外部 CSS 加载 | 标注"无内联样式，仅从 DOM 结构和 class 命名推断" |
| URL 需登录（Tier 1） | Playwright 导航后页面为登录页 | 暂停并提示 PM 在浏览器中手动登录，PM 确认后继续；PM 无法登录则跳过该 URL |
| URL 需登录（Tier 2/3） | SingleFile/WebFetch 抓取到登录页 HTML | 告知 PM 抓取到登录页，自检 Playwright 可用性；可用则切 Tier 1，不可用则引导安装 Playwright MCP 或手动保存已登录的 HTML 文件；PM 无法登录则跳过该 URL |
| 图片无法识别颜色 | 分辨率过低或截图不清晰 | 提示"图片不够清晰，建议更换高清截图" |
| 多张图风格不一致 | 3 张图中 2 张浅色、1 张深色 | 报告中标注矛盾点，让 PM 在确认阶段选择 |
| 混合输入（图+URL） | 图片模式和 URL 模式同时触发 | 先问重点，多模态+提取双通道并行 |
| 当前模型不支持看图 | 非多模态模型无法分析图片 | 告知 PM 当前模型不支持看图，提示切换模型或上传 HTML 文件 |
| PM 选择安装工具 | PM 同意安装 Playwright/SingleFile | 给出安装指引（Playwright: MCP 配置；SingleFile: `npm install -g single-file`），装完后再执行分析 |
| 保存路径未确认 | PM 未指定保存路径 | 询问 PM 确认保存路径后再写入 |
| 多个输入分析结果冲突 | 图1偏深色、图2偏浅色，配色方案不一致 | 综合分析中标注矛盾点，由 PM 在确认阶段决定 |
| URL 加载超时 | Playwright 导航超过 15 秒 | 提示 PM 页面加载较慢，询问是否继续等待或改用其他页面 |
| PM 中途取消 | 分析过程中 PM 表示不再需要 | 停止当前分析，清理产生的临时文件 |
| 全局基准目录有文件但无 design-reference.md | `pmcraft/baseline/` 非空但缺设计报告 | 分析结束后提示 PM 可运行 --apply-global 生成基准报告 |
| 全局基准与版本特定值全部一致 | 基线值全部被版本值覆盖或一致 | 正常输出，来源标注"全部来自全局基准（未覆盖）" |
| 全局基准目录同时存在图片和 design-reference.md | 既有视觉参考又有设计报告 | 优先使用 design-reference.md 作为基线值；图片文件仅在报告中列出但不自动重新分析 |
| --apply-global 使用非 .html 输入 | PM 对全局目录传入图片而非 HTML | 提示"全局基准的 --apply-global 模式需要 HTML 文件或项目目录才能提取框架和精确值。图片模式请使用 extract-design <图片>（正常模式），产物写入全局目录需手动指定路径。" |
| specs/ 存在且与当前分析同字段冲突 | specs 指定品牌色为 #1a1a2e，当前分析提取 #2d2d44 | 以 specs 为准，标注"偏离规范"，回复"已按 pmcraft/specs/ 指定品牌色 #1a1a2e 对齐规范" |
| 混合素材包含权威级和参考级 | 同时有设计师稿和竞品截图 | 按类型分节输出，权威级覆盖参考级同字段（见第一步附加 — 输出模板分节） |
| HTML 文件路径含 shell 元字符（`'`、`"`、`$`、`;`、`&`、`|` 等） | HTML 模式下 `--html` 参数来自 PM 提供的文件路径 | 剔除元字符后以剔除版路径提交，不中断流程，并在结果展示中注明 |
| PM 说「直接改这个HTML」 | 表述含"直接改"指向 HTML 文件 | 属 extend-html 模式，不走分析路径——提示"直接修改归 extend-html 技能处理，本技能只做设计提取/转换" |
| 框架识别失败（--project） | 目录无 package.json | 提示按原生多文件处理（--apply 静态导入）或 HTML 提取，不进入转换流程 |
| single-file CLI 缺失（--project） | 主路径硬依赖 single-file 但未安装 | 给安装指引（`npm install -g single-file`）；PM 拒绝安装 → 走兜底只读提取 |
| 依赖缺失（--project） | node_modules 缺失/依赖不完整 | 先问 PM 是否执行 `npm install`（附预计耗时提示）；同意 → 安装后继续，拒绝/失败 → 走兜底 |
| dev server 需登录（--project） | 首跳为登录页（密码框+登录按钮/login 路径跳转） | Playwright 打开本地 dev server 让 PM 手动登录一次，登录态就绪后携带会话逐页转换；PM 无法提供账号 → 仅转免登录页面，其余标注"鉴权不可达"跳过，不硬生成 |
| 动态路由无示例参数（--project） | 路由含 `/order/:id` 且 PM 未提供示例参数 | 跳过并记录（标注"动态路由，无示例参数跳过"），不硬生成 |
| 单页转换失败（--project） | 某路由页 single-file 转换报错 | 记录失败页继续其余页，不硬生成 |
| dev server 启动失败（--project） | 就绪探活超时或启动报错 | 走兜底只读提取（design-reference.md 页面架构维度 + design-system.css 令牌） |
| SPA 转换后交互不完整（--project） | 动态 chunk 缺失/交互为快照级 | 标注"快照级"（质检豁免依据），结构与样式仍 100% 保留 |
| 收尾进程残留（--project） | dev server 关闭后 node/vite 子进程残留 | 用记录的 PID 执行 `taskkill /T /PID {pid}` 进程树终止（Windows），防孤儿 vite 子进程；完成后验证 tasklist 无残留 |
| --apply 收到可运行框架项目目录 | 目录含 package.json 且存在 dev script | --apply 互通报：提示 PM 改走 `--project`（说「读项目代码」）；PM 坚持静态导入则按 --apply 继续 |

---

## 评价测试用例

### 正向触发（8条）

1. `extract-design 截图.png`（1 张图片）— 按 7 维度框架输出完整报告
2. `extract-design ./dashboard.html`（HTML 文件）— 从 CSS 提取精确 hex 和 font-family
3. `extract-design https://example.com`（URL）— 按 Tier 策略获取页面并提取设计信息
4. `extract-design 图1.png 图2.png "重点看图1配色，图2布局为辅"`（多输入+重点）— 分析权重按重点分配
5. `extract-design 图1.png 图2.png https://example.com "综合"`（混合输入）— 图片和 URL 各自分析后合并输出
6. 图片分析完成后 PM 确认"主色不对，应该是 #e8835a" — 接受纠正，只重新提取配色维度，更新报告
7. SingleFile 已安装时执行 URL 分析 — 走 Tier 2，输出精确设计令牌
8. `extract-design --apply-global ./brand-system.html`（全局基准导入）— 产物写入 `pmcraft/baseline/`，不绑定版本号

### 负向触发（5条）

1. `extract-design`（无参数）— 提示需要输入来源
2. `extract-design 图标.ai`（不支持的文件格式）— 提示不支持，列出支持格式（.png/.jpg/.jpeg/.webp/.svg/.html）
3. `extract-design https://需要登录的页面.com` — 检测到登录页，提示 PM 手动登录（Tier 1）或引导升级/手动提供文件（Tier 2/3）；PM 拒绝/无法登录时跳过该 URL 分析
4. `extract-design 模糊截图.png`（分辨率过低）— 提示不够清晰，建议更换
5. Playwright 和 SingleFile 均不可用时执行 URL 分析 — 先询问 PM 是否安装，再决定降级或等待

### 边界查询（3条）

1. 图片中提取到 20+ 种颜色 — 按频率排序，输出 9 色表 + 补充列表
2. HTML 文件中 class 前缀同时匹配多个组件库 — 综合判断，标注最可能的库并附依据
3. URL 的 Tier 1/Tier 2 均不可用，仅 WebFetch 可用 — 提醒 PM 升级，PM 选择降级后输出并标注精度说明

---

## 参考文档

| 文件 | 加载时机 |
|------|---------|
| `references/report-template.md` | 第四步（按模板输出设计参考报告）入口 |
