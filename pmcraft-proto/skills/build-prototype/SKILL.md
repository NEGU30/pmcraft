---
name: build-prototype
description: 按页面清单和设计系统生成或修改可交互的原型页面。当 PM 说"生成原型"、"开始做"（表述含"需求/PRD/简报/文档/测试/测试用例/验收/问卷/访谈"时排除，走需求域或测试域；含"标注"时排除，走标注路由）、"做出来"、对已有原型提出修改意见（"加个XX"、"改颜色"、"换布局"——"加个/改一下"表述含"PRD/简报/文档/需求/标注/演示/场景演示"时排除，分别走需求域追加/修订、标注路由与演示面板路由）时触发，或由 CLAUDE.md 路由层在页面已规划/原型已生成状态下自动衔接。
type: skill
tags:
  - 原型
  - 页面构建
  - 交互设计
  - build
  - prototype
  - html
  - generate
  - edit
allowed-tools: [Read, Write, Edit, Bash, Skill, Glob, Grep, AskUserQuestion, Agent, ToolSearch, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_click, mcp__playwright__browser_evaluate, mcp__playwright__browser_wait_for, mcp__playwright__browser_close]
dependencies:
  - Node.js（LTS，icon-get.js 图标查询与 B 模式 server.js 运行所需；缺失时图标走虚线占位框回退、B 模式回退 A 模式）
  - Playwright MCP（mcp__playwright__* 工具：第十步 10a 运行时可视验证所需；ToolSearch 检测缺失时按 10a 降级标注并提示 PM，不阻塞交付）
argument-hint: '[build|edit] [页面|all] [HTML|vue-ep] [--strict]'
prompt: 生成原型|做原型|做个原型|开始做（表述含"需求/PRD/简报/文档/测试/测试用例/验收/问卷/访谈"时排除，走需求域或测试域；含"标注"时排除，走标注路由）|做出来|加个（表述含"PRD/简报/文档/需求/标注/演示/场景演示"时排除，分别走需求域追加/修订、标注路由与演示面板路由）|改一下（表述含"PRD/简报/文档/需求/标注/演示/场景演示"时排除，分别走需求域追加/修订、标注路由与演示面板路由）|改页面|改颜色|换布局|改布局|build-prototype
---

# 原型构建

## 概述

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/build-prototype/`）。本文件中所有 `../../_shared/...` 相对路径（icon-get.js、aliases.json、element-plus 离线包、element-plus 指南、_common.css、annotations 标注资产等）一律以本技能源码目录为基准解析，不依赖 cwd。

根据 `prototype/working/page-inventory.md` 中的页面清单和 `prototype/working/DESIGN.md` 中的设计系统，生成可交互的原型页面。所有产物写入 `prototype/working/` 目录。流程页逐个生成并让 PM 确认，基础页批量生成。生成完成后自动执行质量检查。

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| 模式 | 字符串 | 否 | build（首次生成）或 edit（修改已有原型） | `build`、`edit` |
| 目标页面 | 字符串 | 否 | 要生成的页面（all / 页面名） | `all`、`P1`、`首页` |
| 技术栈 | 字符串 | 否 | HTML / vue-ep（Vue + Element Plus），不传则按推荐规则询问 | `HTML` |
| 评审通道 | 字符串 | 否 | 默认**攒批**——edit 期间不 spawn 独立设计评审，攒到存档前 / 结构性大改时统一评审（见「评审攒批与批量评审」节）；`--strict` = 每轮评审（旧行为，改一次审一次） | `--strict` |

**平台来源**：平台信息自动从 `prototype/working/spec.md` 的 `使用端` 和 `使用端子类` 字段读取。多端场景分批生成，每次只生成一个端。

所有路径均基于 `prototype/working/`；项目路径从 CLAUDE.md 上下文获取，如无法确定则询问 PM。

## 调用方式

```
build-prototype [模式] [目标页面] [技术栈]   # 技术栈：HTML / vue-ep
```

**示例：**
```
build-prototype build all HTML
build-prototype build P1
build-prototype edit 转交发起页加一个全选
build-prototype edit 颜色调亮一点
build-prototype edit 颜色调亮一点 --strict   # 每轮评审（默认是攒批，存档前统一评审）
```

## 工作流程

### build 模式

#### 第一步：读取 lessons.md

检查 `pmcraft/lessons.md` 是否存在。
- 如果存在 → 读取其中的易错点规则，在当前生成中应用（如"按钮使用直角"则生成时直接使用直角）。
- 如果不存在 → 跳过。

#### 第二步：确认技术栈

**推荐规则（按产品类型自动判断，读 `prototype/working/spec.md` 的 `产品类型` 字段，write-spec 已产出）：**

- 产品类型为**管理后台**（或存量 `prototype/working/framework/` 已检测到 `<el-`/`element-plus` 引用）→ **推荐 Vue + Element Plus**（表格/表单/密集信息组件需求，EP 离线包局域网可用）
- 其他产品类型（SaaS / 消费产品 / 内容平台 / 电商 / 工具类 / 数据产品 / 金融产品 / 社交社区）→ **推荐 HTML**（纯静态即看，零依赖）
- PM 明确指定技术栈 → 用 PM 指定的（推荐仅作引导，不覆盖）

- 如果 PM 未指定技术栈 → **调用 `AskUserQuestion` 工具**（如可用），**推荐项排第一并标注"（推荐）"**：

  - `question`: "用 HTML 还是 Vue + Element Plus 输出？"
  - `header`: "技术栈"
  - `options`（按推荐规则排序，以下为两种场景的选项顺序）:
    - 管理后台场景（推荐项第一）:
      - `{label: "Vue + Element Plus（推荐）", description: "管理后台风格，浏览器端运行（离线包，局域网可用，含中文文案）"}`
      - `{label: "HTML", description: "纯静态 HTML 页面，直接浏览器打开即可查看，零依赖"}`
    - 其他场景（推荐项第一）:
      - `{label: "HTML（推荐）", description: "纯静态 HTML 页面，直接浏览器打开即可查看，零依赖"}`
      - `{label: "Vue + Element Plus", description: "管理后台风格，浏览器端运行（离线包，局域网可用，含中文文案）"}`
  - `multiSelect`: false

  PM 选择后使用对应技术栈。未选择则按推荐规则默认（管理后台 → vue-ep；其他 → HTML）。

  **备选（工具不可用时）**：> "用 HTML 还是 Vue + Element Plus 输出？默认 {推荐项}。"
- 如果 PM 已指定技术栈 → 使用指定技术栈。
- 如果技术栈是 **vue-ep（Vue + Element Plus）** → 自动使用 Element Plus 离线包，生成页面时自动将离线包复制到 `prototype/working/assets/vendor/element-plus/`，页面中通过本地相对路径引用（含 Vue 运行时 `vue.global.prod.js` 与中文语言包 `locale/zh-cn.min.js`，全部离线，局域网可用）：
  - 存量场景补充：`prototype/working/framework/` 下已有 Element Plus 引用（通过 `<el-` 前缀或 `element-plus` 关键词检测）→ 视为 vue-ep 场景
- **离线包回退**：如果 Element Plus 离线包文件缺失 → 回退为纯 HTML + CSS 实现，标注"Element Plus 离线包不可用，已回退为纯 HTML 实现"。

> **技术栈停用声明**：React/Vue 组件交付模式（.tsx/.vue 输出）已停用，仅支持 HTML 与 Vue + Element Plus（vue-ep，输出 HTML 文件）两种技术栈。历史残留的 React/Vue 输出模板与相关约束已清理，本文档不再保留 React/Vue 生成指引；仅"存量 .tsx/.vue 页面存在时标注层跳过"的防御性检查（第八步A / 第八步B / 禁止行为 13）继续有效。

#### 第三步：确认数据层模式

**调用 `AskUserQuestion` 工具**确认数据层模式（如可用），这影响原型的数据交互体验：

- `question`: "原型需要处理增删改查数据吗？选一个数据模式："
- `header`: "数据模式"
- `options`:
  - `{label: "纯前端模拟", description: "数据在页面内存中，刷新后重置。适合快速看效果和流程（默认）"}`
  - `{label: "简易后端", description: "数据持久化到 JSON 文件，启动本地 HTTP 服务，刷新不丢数据。适合完整演示"}`
- `multiSelect`: false

PM 选择后：
- 选"纯前端模拟"或不指定 → 使用纯前端模拟模式。
- 选"简易后端" → 自动生成 `prototype/working/mock/db.json` 和 `prototype/working/server.js`，通过 Bash 启动本地服务，引导 PM 访问 `http://localhost:{端口}` 查看原型。

**备选（工具不可用时）**：
> "原型需要处理增删改查数据吗？选一个数据模式：
> A. 纯前端模拟（默认）——数据在页面内存中，刷新后重置。适合快速看效果和流程。
> B. 简易后端——数据持久化到 JSON 文件，启动一个本地 HTTP 服务，刷新不丢数据、跨页面共享。适合完整演示。"

- 如果 PM 选择 A 或不指定 → 使用纯前端模拟模式。
- 如果 PM 选择 B → 自动生成 `prototype/working/mock/db.json` 和 `prototype/working/server.js`，通过 Bash 启动本地服务。
- 如果 Bash 启动服务失败（端口被占、Node.js 未安装等）→ 回退到 A 模式并告知 PM。

#### 第四步：读取平台信息

读取 `prototype/working/spec.md` 中的 `使用端` 和 `使用端子类` 字段，确定目标平台。

| 分类 | 子类 | 视口 | 框架壳 | 布局范式 |
|------|------|------|--------|---------|
| PC | 全屏网页 | 不限（默认 1280x720） | 侧边栏 + 顶部栏 | 浏览器网页，默认布局（现有默认行为） |
| PC | 桌面软件风格 | 不限 | 无固定框架，更偏工具布局 | 桌面应用范式：右键菜单、拖拽排序、多面板、表格密集、上下文操作栏 |
| 移动 | H5 网页 | 响应式 | 移动顶部栏，无固定导航 | 流动布局，单列，触屏友好控件（大点击区域） |
| 移动 | 手机 App 模拟 | 390x844 画框 | 底部 Tab + 顶部导航栏 | 模拟原生 App，触屏手势、页面堆栈导航 |
| 移动 | 平板 App 模拟 | 768x1024 画框 | 侧边栏 + 内容区 | 类桌面布局但触屏交互，分栏展示 |

读取规则：
- 如果 spec.md 存在且 `使用端子类` 有明确值 → 按该值配置平台参数。
- 如果 spec.md 存在但 `使用端子类` 未明确 → 按 `使用端` 大类设置默认值（PC → 全屏网页，移动 → 手机 App 模拟）。
- 如果 spec.md 不存在或字段缺失 → 使用 PC-全屏网页作为默认。
- **多端场景**（如 `使用端` 标注了"PC-全屏网页 + 移动-H5网页"）→ 选择当前生成批次对应的端类型，向 PM 说明当前在生成哪一端。
- 记录平台参数，后续所有页面生成按此参数执行。

平台参数影响以下方面：
- **框架壳**（顶部栏/底部 Tab/侧边栏）：`index.html` 主入口的导航结构按平台输出
- **视口约束**：移动 App 模拟时页面 HTML 外层包裹手机壳 UI，平板 App 模拟时加平板壳
- **交互范式**：PC 端 hover/click，移动端 touch/手势
- **组件尺寸**：移动端使用大触控目标（>=44px），PC 端标准尺寸

#### 第五步：检查前置条件

依次检查以下条件：

1. 如果 `prototype/working/page-inventory.md` 不存在 → 提示"请先规划页面结构"，退出
2. 如果 `prototype/working/page-inventory.md` 格式异常（缺少类型/元素/状态/跳转中的任一字段）→ 提示"page-inventory.md 格式不完整，请检查后重新规划页面"，退出
3. 如果 `prototype/working/DESIGN.md` 不存在 → 提示"请先设定风格"，退出
4. 如果 `prototype/working/DESIGN.md` 中 YAML 区块的色值/字体存在未替换占位符（`{hex}`、`{font}`、`{n}` 等）→ 提示"DESIGN.md 中存在未替换的变量占位符，请先设定风格"，退出
4a. 如果 `prototype/working/design-system.css` 中 `:root` 块的 CSS 变量值存在未替换占位符 → 提示"design-system.css 中存在未替换的变量占位符，请先设定风格"，退出（此处错误文件是 design-system.css，不是 DESIGN.md——检查 4 和检查 4a 分别对应两个不同的文件）
4b. **视觉确认门**：如果 `prototype/working/DESIGN.md` 存在但 `prototype/working/preview.html` 不存在 → 说明设计系统系继承/存量/上版带来，本版本 PM 尚未确认过视觉（DESIGN.md 存在不等于视觉已确认）→ 提示"视觉尚未经本版本确认，请先设定风格出样板"，退出并转 `set-style` 补出样板走确认。**可豁免**：PM 明确说"沿用上版风格"/"不用看了"→ 由 set-style 生成 preview.html 后放行，不阻塞。（此为 SKILL 内部自检层，与路由层"build-prototype build 前流程校验"互补，防止直接经 prompt 触发 build-prototype 绕过路由层的门。）
5. 如果 PM 上传了参考图但未通过 extract-design 分析 → 引导先使用 extract-design 分析参考图，再继续
6. 如果全部前置条件满足 → 进入下一步。

#### 第六步：确认运行环境约束与消费存量分析

##### 6.1 运行环境约束

在开始生成代码前，根据第二步确认的技术栈和运行环境，对照以下已知约束：

| 运行环境 | 技术栈 | 关键约束 |
|---------|--------|---------|
| 浏览器端编译（`<script>` 标签直接引入，全部本地文件） | Vue 3 + Element Plus（vue-ep） | DOM 模板中自定义组件必须成对闭合（`<el-table-column></el-table-column>`），禁止自闭合 `/>` |
| | | el-table 列宽计算依赖 `border-box`，全局 `box-sizing: border-box` 不得排除 el-table 内部元素 |
| | | el-table 父容器不得设 `overflow-x: hidden` |
| | | Element Plus Icons 必须使用 IIFE 构建版（`icons-global.iife.min.js`），ESM 版在浏览器中不暴露全局变量 |
| | | `el-table-column` 的 `fixed="right"` 要求表格和列均有明确 `width`，条件不满足时改用不固定列 |
| | | **Vue 运行时必须走本地 `assets/vendor/element-plus/vue.global.prod.js`（禁止 unpkg CDN）**；中文文案走 `locale/zh-cn.min.js`（注册见下） |

生成涉及表格/图标/固定列的代码时，对照上表逐条验证，确认符合当前运行环境的已知限制。

##### 6.2 存量分析消费

如果 `prototype/working/framework/` 目录存在（存量导入场景），必须读取 `prototype/reference/design-reference.md`（如存在），从中提取以下信息并逐条对照应用。**如果读取失败** → 依据 DESIGN.md + design-system.css 自行对齐（图标按种子默认库、组件风格按设计令牌、布局沿用框架壳间距节奏），并在日志中标注"设计参考缺失，已按设计系统对齐"：

| 提取维度 | 设计参考报告章节 | 应用方式 |
|---------|---------------|---------|
| 图标系统 | 图标风格 | 使用与源码一致的图标库，不自行替换（如源码用 Element Plus Icons 则不能用 emoji 或 Lucide 替代） |
| 组件风格 | 组件风格 | 按钮/卡片/输入框/表格的圆角、边框、阴影与源码保持一致 |
| 布局模式 | 布局特征 | 新页面布局沿用框架的间距节奏和内容区宽度 |

**权威规范消费**：如果 `pmcraft/specs/` 非空，以 specs 为 ground truth 逐条对照。**如果 specs 目录存在但读取失败** → 以降级链取下一个可用来源（design-reference.md → DESIGN.md），并在生成时标注"specs 读取失败，已降级至 {来源}"：

| 提取维度 | specs 文件 | 应用方式 |
|---------|-----------|---------|
| 品牌规范 | pmcraft/specs/brand-guide.md | 颜色、字体、Logo 使用与品牌手册一致 |
| 组件规范 | pmcraft/specs/component-spec.md | 按钮/卡片/输入框的圆角、边框、阴影与组件规范一致 |
| 无障碍 | pmcraft/specs/accessibility-standards.md | 对比度 >=4.5:1、焦点指示器样式与标准一致 |
| 动效 | pmcraft/specs/motion-guide.md | 过渡时长、缓动函数与动效指南一致 |
| 资源引用 | pmcraft/specs/assets/ | 直接引用设计师切的图/Logo/图标，不自行替换 |

**优先级**：specs（ground truth）> design-reference.md（来源类型：设计师稿 > 存量 > 竞品）> DESIGN.md。specs 有明确规定的值不得从 DESIGN.md 或 design-reference.md 取值。

这些信息不能停留在参考文件里——生成前必须读取并对照。如果各来源有冲突，以优先级链为准，并在生成时标注差异来源。

#### 第七步：生成前 Checklist（必须逐条执行，不可跳过）

> 标有 **[vue-ep]** 的条目仅在第二步确定技术栈为 vue-ep 时执行；HTML 模式跳过该条目不视为违反"必须逐条执行"。

在写第一行代码之前，依次执行以下预检步骤：

0. **Pre-flight — 读取种子模板和布局库（写任何代码前必须执行）**：
   a. 按第四步确定的平台，读取 `assets/seeds/{platform}.html` 完整文件。注意 `@import url('../_common.css')` 声明——页面运行时位于 `prototype/working/pages/`，`../_common.css` 指向 `prototype/working/_common.css`（由 set-style 产出 2.5 写入）；插件源码中该文件实际位于 `../../_shared/_common.css`。通用组件 class 视同种子定义。记录 `<style>` 块中所有 CSS class 名称（类库存），后续页面只使用已有 class。**如果读取失败** → 终止生成并提示"平台种子模板缺失：{platform}"，检查技能安装完整性。
   b. 检测 `prototype/working/framework/` 是否存在 → 存在则跳过种子 chrome 部分（导航/侧边栏/布局壳），用 framework/ 内容覆盖；`_common.css` 组件样式不受影响。
   c. 读取 `references/layouts/{platform}-layouts.md`。了解有哪些布局骨架可用。按 page-inventory.md 中每个页面的 `类型` 字段匹配对应布局（L01 列表页、L02 表单页、L03 详情页、L04 仪表盘、L05 空状态、L06 错误页、L07 登录页；pc-desktop-style 布局库仅含 L01-L06，无 L07 登录页——登录页按表单布局变体组合）。类型为"自定义"时，基于最接近的布局变体组合。**如果读取失败** → 依据页面 `类型` 语义自行构建布局结构（列表=表格+操作栏、表单=字段组+提交区、详情=分节展示、仪表盘=KPI 卡片网格），并在日志中标注"布局库缺失，已按类型语义自建"。
   d. 读取 `references/checklist.md` + `references/token-fallback.md`。记住 P0 必须通过的检查项和变量回退规则。**如果读取失败** → 按 P0 核心项执行自检（元素齐全/状态覆盖/跳转正确/颜色取自 CSS 变量/无空占位），变量缺失统一回退 `--color-text` 并记录。
   e. 对照布局文件顶部的 "Class Inventory" 清单，确认种子（含 `_common.css`）中对应 class 都已定义。缺失则先在 `_common.css` 中补充，再在页面中使用。
   f. 读取 `../../_shared/reference/anti-ai-flavor.md` — 16 条反 AI 味模式清单（含「何时不算」边界）。生成时规避：首屏按任务排布不默认居中 Hero、标题字号字重行高取变量不黑挤、不写复述型说明、全站命名统一、图标按钮带名称、按钮必须可点、动效克制、移动端媒体查询重排、行身份不用原始 ID、单项操作不全页 loading。**如果读取失败** → 依据本步 11-18 号生成规则要点执行，不阻塞。

1. **[vue-ep] 读取 `../../_shared/reference/element-plus-pitfalls.md`** — 不踩坑 checklist：
   - 本地素材扫描与补齐（Element Plus 三件套 + 外来资源包扫描）
   - 本地素材优先原则（vendor > npm > CDN）
   - 图标系统确认（存量对齐、注册方式、禁止 emoji/Lucide、kebab-case、HTML 标签冲突）
   - Element UI 约束自检（成对闭合、overflow、fixed、box-sizing、按钮间距）
   - 设计令牌自检（颜色/字体/圆角来自 design-system.css 的 CSS 变量、多卡片布局一致）
   - 表格文本+操作并列规则（flex 换行布局，禁止 show-overflow-tooltip）
   **如果读取失败** → 依据第六步 6.1 运行环境约束表 + 本清单要点自行核对（成对闭合/图标 IIFE 版/box-sizing/fixed 需 width）。
2. **[vue-ep] 读取 `../../_shared/reference/element-plus-dev-guide.md`** — 用对规范：加载方式、注册机制、DOM 模板约束、表单/按钮/布局组件使用规范、存量组件消费。**如果读取失败** → 依据 6.1 约束表 + 上方 checklist 要点执行，不阻塞生成。

#### 第八步：按页面清单生成

读取 `prototype/working/page-inventory.md`，对每个页面按以下规则分类处理：

**存量场景**：如果 `prototype/working/framework/` 目录存在（从旧系统导入），生成新页面时自动加载该目录中的框架文件作为壳，新页面内容填充到内容区，不触碰导航栏和侧边栏。

**如果是流程页**：
1. 生成该页面，展示给 PM 确认。首次展示时告知：
   > "这是 {P1:页面名} 的初稿。先看这三样：元素齐不齐、流程能不能走通、跳转正不正确。颜色/间距/圆角等视觉细节是在设定风格时已锁定的，如果觉得不对那是设计系统要调——可以提，但别因为这些卡住确认。"
2. PM 确认的标准（**全部满足**方可视为"已确认"）：
   - 元素齐全：page-inventory.md 中列出的所有元素都存在且可见
   - 状态覆盖：至少 2 种状态已实现（默认态 + 加载态/空数据态/错误态/边界态之一）
   - 跳转正确：页面中的所有跳转路径能正确导航到目标页面
   - **数据交互**（第三步选择 B 模式时）：所有数据操作通过 `fetch('/api/...')` 与后端交互，而非直接操作内存变量
3. 如果 PM 确认 → 生成下一个流程页。
4. 如果 PM 不满意 → 根据反馈修改后重新生成，待 PM 确认后再继续。

**如果是基础页**：
1. 全部基础页一次性批量生成。
2. 展示给 PM 整体确认：列出所有基础页的名称和关键元素，让 PM 逐页过目。告知："基础页的关键是一个不乱、二不缺——布局干净、元素都在。不需要像流程页那样逐页逐状态验收，扫一眼觉得 OK 就行。"

##### 页面生成规则

1. 从 page-inventory.md 读取元素列表，构建页面结构。
2. 从 page-inventory.md 读取状态要求，覆盖默认态、加载态、空数据态、错误态、边界态。加载与空态按作用域区分：
   - **加载按对象锁（A1）** — 单项请求只锁对应对象（行内 spinner、按钮 loading 态、局部区域），禁止整页 loading 遮罩；刷新/翻页保留旧数据 + 局部 refreshing 指示，不用整页骨架替换（anti-ai-flavor 模式 16）。
   - **空态区分集合空与筛选空（A2）** — 集合为空（"还没有订单，去创建一单"）与筛选无结果（"没有符合条件的订单，清空筛选看看"）是两种状态，文案与恢复动作必须不同。
3. 从 `prototype/working/design-system.css` 读取 CSS 变量（`:root` 块中的 `--color-*`、`--font-*`、`--space-*`、`--radius-*` 等）作为所有颜色/字体/间距/圆角的值来源。`prototype/working/DESIGN.md` 仅用于理解语义令牌含义（如"primary 是主按钮色"），不从中取值。
   - 如果 design-system.css 中某个变量缺失 → 按 `references/token-fallback.md` 的对应规则回退（如 `--color-danger` → `#dc2626`）；该表未覆盖的变量 → 使用 CSS 变量 `--color-text` 作为默认回退。**`--color-background` / `--color-surface` / `--color-text` / `--color-border` / `--color-primary` 无回退（必须存在）**，缺失时停止生成并提示 PM 检查 design-system.css。日志记录统一为"变量 {名称} 缺失，已使用回退值 {值}"。
4. 从 `prototype/working/components/` 目录匹配组件：
   - 如果描述匹配已知组件 → 加载对应组件。
   - 如果 `prototype/working/components/` 目录不存在 → 静默跳过组件匹配，直接生成 HTML 结构。
   - 如果描述不匹配 → 直接生成 HTML 结构，不强制使用组件。
5. 如果技术栈为 **vue-ep（Vue + Element Plus）**：从 `../../_shared/vendor/element-plus/` 复制离线包到 prototype/working/assets/vendor/element-plus/（**全部 5 个文件**：`index.css`、`index.full.min.js`、`icons-global.iife.min.js`、`vue.global.prod.js`、`locale/zh-cn.min.js`），页面引用本地路径；文件缺失则回退为纯 HTML。
6. 需要图标时，从 DESIGN.md 读取 `icon_library` 字段确定图标库（默认 `lucide`），然后根据技术栈使用对应方式引用：
   - **HTML（内联模式）**：运行 `node "{本技能源码目录}/../../_shared/scripts/icon-get.js" {lib} {图标名}` → stdout 即为可内联的 SVG 正文（打包时已剔除顶部注释）→ 包上 `<svg class="icon icon-{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ...>` 根标签写入 HTML。SVG 保留 `stroke="currentColor"` 让颜色跟随 CSS 变量。取内容与查名称**一律走 icon-get.js**（从 `{本技能源码目录}/../../_shared/icons/{lib}/bundle.json` 读取，每库一个打包文件）；**禁止直接 Read/Grep bundle.json**（tabler 包约 2MB、按行存储，Read 截断且污染上下文）。
     - **图标尺寸选择规则**（按场景映射，禁止无脑套默认）：
       | 场景 | 尺寸类 |
       |------|--------|
       | 按钮内图标 / 输入框图标 / 表格操作图标 / 小标签图标 | `icon-sm`（14px） |
       | 导航/侧边栏/工具栏/列表项图标 | `icon-md`（18px，种子默认） |
       | 空状态 / 页面级占位图形 | `icon-lg`（24px） |
       | 登录页品牌图形 / 仪表盘主 KPI 卡图标等明确大尺寸场景 | `icon-xl`（32px，**仅限明确场景**） |
       | — | `icon-2xl`（64px，**默认禁止**，仅 DESIGN.md 或 PM 明确要求时使用） |
       种子与布局库中最大图标为 `icon-lg`——`xl`/`2xl` 为预留尺寸，非无参考时的常规选项。
     - **图标名三级查找链**（确定性，禁止自由联想）：
       1. 先查 `{本技能源码目录}/../../_shared/icons/aliases.json`——62 个常用语义（如 `search`/`user`/`trash`/`home`）→ 当前库实际图标名的映射表（全部名称已与 icons.json 验证一致）。需要图标时先确定语义 → 查表得当前库名称。
       2. 运行 `node "{本技能源码目录}/../../_shared/scripts/icon-get.js" {lib} {名称}` 取内容（名称索引校验内置在脚本中；取不到时 stderr 会列出相近名称，可直接采用）。**参数安全（Bash 注入防护）**：`{名称}` 优先取 aliases.json 映射或 stderr 建议的内部名称；若需直接使用 PM 表述中的名称，构造 Bash 命令前必须剔除 `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或改从 aliases.json / stderr 建议中取内部名称），参数值一律用双引号包裹后传入。
       3. 取不到 → 换用相近语义的别名（如 `close` 无 → `x`）重试；仍无 → 走下方缺失回退。
     - **顶部注释已随打包剔除**：bundle 打包时已去除 SVG 顶部 `<!-- ... -->` 元数据注释（如 Tabler 的 tags/unicode/version），查询输出无需再处理。
     - **本地 SVG 缺失回退**：三级查找链全部落空时，用**虚线占位框 + 图标名**替代——`<svg class="icon icon-{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="4" stroke-dasharray="3 3"/></svg>` 内附文字标签，并标注"图标 {名称} 缺失，已使用虚线占位"。**禁止用 emoji/UTF-8 符号替代功能图标**（check-quality 会将 emoji 报为缺陷，且符号不跟随 `currentColor` 样式）。
   - **Vue + Element Plus 场景**：使用 `icons-global.iife.min.js` 离线包中的 Element Plus Icons，按 kebab-case 注册，禁止混用 Lucide。
7. 从 page-inventory.md 读取跳转关系，串联页面。
8. **按平台从种子生成**：
   - 复制平台种子模板文件 `assets/seeds/{platform}.html` 到 `pages/{page-name}{-端后缀}.html`。
   - 删除 `<main>` 或 `.content` 中的示例内容，保留 chrome（导航/侧边栏/顶栏/TabBar 等）。
   - 从 `references/layouts/{platform}-layouts.md` 中选取匹配页面 `类型` 的布局骨架，粘贴到内容区。
   - 将布局中的 `[REPLACE]` 占位符替换为 page-inventory.md 中的实际内容（元素名、字段名、数据示例）。
   - **禁止创建新的全局 CSS class**。所有样式使用种子模板（含 `_common.css`）中已定义的 class。单个页面的微调使用内联 `style="..."`。
   - 如果页面需要的组件 class 在种子和 `_common.css` 中均不存在 → 在页面 `<style>` 块中新增（作用于单页），同时在日志中记录"种子缺失 class: {名称}，已在 {页面} 中补充"。
   - **B 模式数据绑定**：Agent 可改（把静态 `<tr>` 替换为动态渲染逻辑、在 `<tbody>` 上添加 `id` 作为 DOM 挂载点、添加 `<script>` 块写 `fetch()` 和数据绑定）；不可改（CSS class、表格结构 `<table class="ds-table">`、布局骨架 HTML 结构、种子组件样式）。
   - **多端场景**：同一页面复制多个版本（如 `order-pc.html` + `order-h5.html`），每个版本使用对应端的种子和布局，在 PM 对话中标注当前生成的是哪个端版本。
8a. **交互元素 id 分配**：每个可交互元素（`button`/`a`/`input`/`select`/`textarea`）分配语义化 id（命名 {页面}{动作}，如 `smsLoginBtn`、`agreeCheck`）。id 不仅是 JS 绑定钩子，也是标注层锚点与自动化测试的唯一稳定标识——**禁止仅给 JS 引用的元素加 id**。表单控件已有 `<label>` 时同步补 `for="{id}"` 关联，避免 check-quality 自动修复插入重复 label。
9. **数据层生成（A 模式 — 纯前端模拟）**：
   - 如果页面包含表格/列表 → 生成 3-5 条模拟数据（使用中文真实感内容），配套 add/delete/update 函数操作内存数组
   - **模拟数据身份（A4）** — 列表行身份 = 视觉身份（头像/状态点）+ 主名称 + 区分字段（如"张伟 · 财务部"、"工单 #WX-240828-01"）。禁止用 UUID、原始 ID（"ID: 1024"）、千篇一律的类型标签当行身份（anti-ai-flavor 模式 15）——一眼假的数据会破坏演示可信度。
   - 如果页面包含表单 → 表单提交后数据写入模拟数据集，页面自动刷新列表
   - 如果页面包含详情展示 → 支持通过 ID 查询模拟数据渲染详情
   - 数据存储在全局 JS 变量中，刷新页面后重置
10. **数据层生成（B 模式 — 简易后端）**：
   - 生成 `prototype/working/mock/db.json` 作为数据源，按页面实体定义初始数据结构（如 `users: [], orders: []`）；db.json 种子数据的行身份要求同 A 模式（规则 9 模拟数据身份 A4）
   - **异步确认生命周期（A5）** — 提交类操作：成功后不立即关闭弹窗，界面更新完成后再关；失败时保留弹窗和已填输入并给出错误提示。
   - 所有 CRUD 操作通过 `fetch('/api/{entity}')` 实现
   - 前端不直接修改数据，统一通过 API 调用
   - 生成 `prototype/working/server.js`：**必须 CommonJS 格式**（`require('http')` 等）。使用 `path.join(__dirname, 'mock', '.server.pid')` 写入 PID，`path.join(__dirname, 'mock', 'db.json')` 读取数据——`__dirname` 是 CommonJS 的内置全局变量，始终指向 server.js 所在目录，不受 CWD 影响。**禁止 ESM**（`import.meta.dirname` 要求 Node.js >=21.2，兼容性不足）。
   - 生成启动脚本 `prototype/working/start.bat`（Windows）：使用 `cd /d "%~dp0"` 确保脚本从自身所在目录启动（`cd /d "%~dp0" && node server.js`），使双击启动和存档到 E 目录后均能正常工作
   - 生成启动脚本 `prototype/working/start.sh`（Mac/Linux）：使用 `cd "$(dirname "$0")" && node server.js` 确保脚本从自身所在目录启动
   - 生成关闭脚本 `prototype/working/close.bat`（Windows）：使用 `cd /d "%~dp0"` 确定脚本所在目录 → 读取 `mock\.server.pid` → **校验 PID 为纯数字**（**先校验文件、后读取，禁止把 %PID% 展开进命令行**：用 `findstr /r "[^0-9]" "mock\.server.pid"` 直读文件校验，`if not errorlevel 1` 命中即含非数字 → 删除 pid 文件并退出；通过后再 `set /p PID=<mock\.server.pid`。**禁止 `set /a "PIDCHECK=%PID%"` 与 `echo %PID%|findstr ...` 两种校验写法**——被篡改值中含双引号会闭合外层引号配对（如 `123"&calc&"`），`&` 后的命令在该校验行本身即被执行（先于任何 errorlevel 门），是注入面；口径与共享模板 `deploy-prototype/templates/close.bat-template` 一致）→ **验证 PID 属于 node.exe 进程**（`tasklist /FI "PID eq %PID%" | findstr /i "node"`，不匹配则提示 PID 可能已被复用、拒绝终止并删除 pid 文件）→ `taskkill /F /PID %PID%` → 检查错误码（进程不存在则提示已停止/PID 已被复用，无论成败均删除 pid 文件）
   - 生成关闭脚本 `prototype/working/close.sh`（Mac/Linux）：使用 `cd "$(dirname "$0")"` 确定脚本所在目录 → 检查 `mock/.server.pid` 是否存在 → **校验 PID 为纯数字**（`echo "$PID" | grep -qE '^[0-9]+$'`，非数字则删除 pid 文件并退出）→ **验证 PID 属于 node 进程**（`ps -o comm= -p "$PID" | grep -qi node`，不匹配则提示 PID 可能已被复用、拒绝终止并删除 pid 文件）→ `kill "$PID"` → 检查返回码（进程不存在则提示已停止/PID 已被复用，无论成败均删除 pid 文件）
   - 生成 `prototype/working/README.md`，说明：原型简介 + 启动方式 + 关闭方式 + 数据 API 说明 + Node.js 安装指引
   - 启动 Bash 进程运行 `node prototype/working/server.js`
   - 告知 PM："服务已启动，访问 http://localhost:{端口} 查看原型。关闭时可以双击 close.bat 或告诉我'关闭服务'。"
11. **首屏按任务排布** — 不默认"居中大标题+两行说明+两个按钮"的 Hero（anti-ai-flavor 模式 1）。按用户进入页面后的主要任务安排首屏：产品界面、数据、流程或操作在前。仅当页面只需传达单一简短主张时才用居中 Hero。
12. **标题规格** — 页面主标题字号/字重/行高一律取 design-system.css 变量，禁止自创 64px/900 字重配紧行高的组合（anti-ai-flavor 模式 7）。多行标题检查行高与手机宽度换行，先保证字面清楚再谈视觉冲击。
13. **文案规则** — 不写复述标题或按钮名称的说明文字（"在这里管理你的知识"、"请填写你的基本信息"；anti-ai-flavor 模式 11）——删掉后信息不减少就删除，只保留输入格式/条件/后果/陌生概念的解释。全站统一对象与动作命名：同一动作不换着叫（新建/添加/创建 取其一），与 page-inventory 术语对齐（anti-ai-flavor 模式 12）。
14. **图标按钮** — 主要操作直接显示文字；纯图标按钮必须带 `aria-label` 或 `title`（anti-ai-flavor 模式 14）；删除等危险操作单独确认（确认弹窗或二次点击），且删除与归档不用相似符号。
15. **动效约束** — 禁止整页区块入场动画、卡片悬停统一上浮、按钮持续脉冲（anti-ai-flavor 模式 9）；动效仅用于说明页面切换/对象来源/操作结果，时长 150-300ms，支持 `prefers-reduced-motion`。
16. **移动端重排** — 页面必须含移动端媒体查询重排（anti-ai-flavor 模式 10）：折叠次要导航、表格列裁剪或改卡片呈现、触控目标 ≥44px；禁止只把桌面布局改成单列堆到底。
17. **表单克制（A3）** — 表单只收集当前任务必需的字段；不默认添加草稿、预览、重置按钮、步骤条、字符计数、第二套确认等额外设施。复杂度由字段依赖和错误代价决定，不由数据库字段数量决定——原型演示里"多一个字段就多一个确认负担"。
18. **行内编辑有门槛（A6）** — 只有同时满足六条件才用行内编辑：①高频编辑 ②单字段 ③输入内容短 ④无字段依赖 ⑤结果可即时理解 ⑥失败可撤销。否则用弹窗或详情页编辑，别把表格每格都变成输入框。

> 规则 2/9/10/17/18 中 A1-A6 条款借鉴自 [oil-oil/oil-frontend](https://github.com/oil-oil/oil-frontend)（MIT License）的 state-and-loading / interaction-and-editing / resource-recognition 契约，按原型语境改写。

#### 第八步A：原型标注层生成

所有页面生成完成后（第八步之后、第九步之前），自动执行：

1. 技术栈为 **HTML** → 调用 `Skill(pmcraft-proto:annotate-prototype)`：
   - `prototype/working/annotations/` **不存在** → `mode=build`（首次全量生成）
   - **已存在**（如在工作区已有标注的情况下 `build P2`）→ `mode=refresh`（**增量**：传入本批次生成页，其余页由基线比对决定），**禁止全量重建**（annotate-prototype 禁止行为 4 已规定全量仅限首次与基线回退）
   - 后续动作（生成 `annotations/{page}.js` / 幂等注入 head 3 行 / 复制运行时资产）：
   - 生成 `annotations/{page}.js` 每页标注数据（规则 R 编号 + 状态 + 流程，数据源 spec.md + page-inventory.md）
   - 幂等注入每页 head 3 行标签（`../annotations.css` + `../annotations/{page}.js` + `../annotations-runtime.js`）
   - 复制运行时资产（`{本技能源码目录}/../../_shared/annotations/` → working/ 根）
   - 生成后提示 PM："页面右下角「规则和状态标注」「流程标注」开关可分别查看规则/状态与流程标注，两个开关可同时开启"
2. 技术栈为 **React/Vue** → 跳过并提示："标注层 v1 仅支持 HTML 模式。React/Vue 组件建议在 HTML 模式原型中查看标注效果。"
3. PRD 已存在（原型先行但项目已有存量 PRD）→ annotate-prototype 自动读取 PRD 补溯源；PRD 未生成 → 标注首版无溯源，PRD 保存后由 save-doc 自动衔接 refresh。

#### 第八步B：状态演示入口生成

第八步A 标注层生成完成后自动执行（依赖标注数据，顺序不可调换）。为每页生成"状态演示面板"——右下角「演示」开关，点击切换页面到 加载态/错误态/空态/成功态 等任意状态展示，便于演示与评审：

1. 技术栈为 **HTML** 且标注层已生成（`prototype/working/annotations/` 存在）→ 逐页执行：
   - **生成数据文件** `demo/{page}.js`：定义 `window.PM_DEMO_DATA = { "pageId", "pageFile", "pageName", "stateSource": "annotations", "items": [...] }`——`items` 从 `annotations/{page}.js` 的 `type:"state"` 项**派生**（复制 `label` / `title` / `text` / `anchor`，按原顺序编号，不重新解析 spec——与标注层同源，无规则双写）；无 state 项页面 → 生成空 `items`（面板空态"本页暂无状态演示"），汇报中列出
   - **锚点下沉（状态块互斥修正）**：派生时若某 state 项的锚点 A 是另一 state 项锚点 B 的**元素祖先**（A 的 DOM 包含 B）→ 演示锚点下沉为 A 的**直接子元素中第一个"块级可见、非任何 state 项锚点（含其祖先/后代元素）、类名不含瞬态语义（toast/mask/shadow/dialog/backdrop/tip 等）"的元素**（如容器 `#onekeyLogin` 含 `#okLoading`/`#okFail` → 下沉为 `#okMain` 表单块）；找不到合适元素 → 保持原锚点不强制。**下沉只落 demo 数据，不回写标注层**（程序员视角的规则/状态锚定保持原样，S4 容器锚定在标注层仍合理）——这样切换任意状态时，同容器内互斥状态块（含非锚点的成功表单等）会被正确隐藏，避免"失败提示出现在成功表单下方"的观感问题
   - 复制运行时资产 `{本技能源码目录}/../../_shared/demo/demo-panel.css` + `demo-panel-runtime.js` 到 working/ 根（overwrite）；资产缺失 → 提示"共享演示资产缺失：{文件名}，请检查插件完整性"，退出（镜像 annotate 第九步）
   - 每页 `</head>` 前幂等注入 3 行（已存在相同引用则跳过；页面无 `</head>` → 跳过该页注入，汇总"页面 {文件名} 缺少 </head>，未注入"报告 PM）：
     ```html
     <link rel="stylesheet" href="../demo-panel.css" />
     <script src="../demo/{page-basename}.js"></script>
     <script src="../demo-panel-runtime.js"></script>
     ```
   - **范围：仅 `pages/*.html` 业务页面**，index.html（入口/导航页）不注入
2. 技术栈为 **React/Vue** → 跳过并提示（同第八步A：演示面板 v1 仅支持 HTML 模式）
3. 汇报：`已为 {N} 个页面生成状态演示入口（{M} 页含状态列表，{K} 页无状态）。页面右下角「演示」开关可查看。`

> **edit 模式**：修改后标注层 refresh 完成（annotations/ 数据已同步）时，若页面尚无 demo 引用 → 幂等注入（数据从最新标注派生）；已有引用 → 数据随标注 refresh 由 annotate-prototype 重派生（见 annotate-prototype 第十步后），无需本步骤重跑。

#### 第九步：自动技术检查（check-quality，含 auto-fix）

**先于浏览器验证执行**——check-quality 的 auto-fix 会真实写盘，必须让所有写盘动作先落地，第十步的浏览器验证与独立评审看到的才是最终产物。

所有页面生成完成后 → 自动调用 `pmcraft-proto:check-quality`，**默认带 `--auto-fix`**：

- 脚本自动修复可自动修复项（配色偏离 → 替换为色板最近色、缺 label → 补合法 `<label>`、无 focus-visible → 追加样式规则）；**写后复检与增量基线刷新已内置**——调用方不要为"复检"再手动重跑一次（重跑只会让基线反复过期）。
- 剩余 HIGH 且**不可自动修复**（对比度不足 / 跳转断裂 / 元素重叠）→ AI 修复 **1 次** → 复检 **1 次**。仍失败 → 停止重试，向 PM 报告"已修复 {N} 处，仍有 {M} 处无法自动修复（{问题列表}），建议手动检查"。
- 超时（超过 30 秒）→ 视为通过，提示"质量检查超时，建议手动复查关键页面"。
- 调用出错（工具不可用）→ 提示"质量检查工具暂时不可用，请手动检查以下关键项：{关键检查项}"，不阻塞交付；**同时禁用本次评审攒批**（见「评审攒批与批量评审」节降级规则）。

#### 第十步：运行时验证与独立评审

##### 10a. 运行时可视验证（Playwright MCP）

所有写盘动作（含第九步 auto-fix）完成后执行，**默认必须**用浏览器做运行时可视验证：

**【强制】检测 Playwright MCP 可用性**（第一步，不可跳过）：使用 `ToolSearch` 查询 `mcp__playwright__` 相关工具（`browser_navigate` / `browser_snapshot` / `browser_take_screenshot` / `browser_click` / `browser_wait_for` / `browser_close`）。

> **浏览器验证脚本规范**：使用 `browser_evaluate` 做运行时验证时（特别是异步交互验证），严格遵循 `../../_shared/reference/playwright-verify-guide.md` 的模板与禁止模式——**能分步就分步（browser_click + snapshot），evaluate 内异步必须用 async IIFE + sleep，禁止 setTimeout 回调里调用外部 resolve / window.__xxx 全局残留**。

**若 Playwright 可用**（按完整执行清单执行）：

1. **验证范围（先确定再开浏览器）**：
   - `build all` → `index.html` 主入口（如存在）+ 1 个关键流程页（从 page-inventory.md 中选取优先级最高的流程页）
   - `build P1` / edit 单页 → **只验本批次生成或修改的页 + 其入口**，**不扩到未改动页**
2. **全程单个 browser session**：从第一次 `browser_navigate` 到 `browser_close` 之间**禁止中途关闭浏览器重开**（重开要重建会话与状态，纯往返浪费）。
3. 用 `browser_navigate` + `browser_snapshot` 打开并捕获可访问性快照（验证 DOM 声明元素是否真实渲染）。
4. 用 `browser_click` 实际点击关键交互元素（验证跳转、弹窗、状态切换的运行时行为）。
5. 用 `mcp__playwright__browser_take_screenshot` 截图检查：
   - **截图路径**：`filename` 参数必须带 `.playwright-mcp/` 前缀（如 `.playwright-mcp/screenshot-p1.png`），Playwright MCP 快照和日志已自动落在这个目录，截图统一归入。**禁止**裸文件名落在项目根目录。
   - 表格列是否对齐（无表头-数据列错位）
   - 图标是否正常渲染（无空白、无 emoji 替代功能图标）
   - 按钮样式是否与 DESIGN.md 一致（圆角、颜色）
   - 页面整体无白屏、无明显布局崩溃
6. **标注层 + 演示面板合并验证（一轮三图）**：**仅本次确实重建/刷新了标注层或 demo 数据时执行**；两者都无变更 → 静默跳过**本子验证**（不截图、不点开关），并在汇报中注明"本轮无标注/演示变更，已跳过标注+演示合并验证（其余可视验证照常）"：
   - **图1 标注全景**：点右下角「流程标注」+「规则和状态标注」两个开关 → 截图（`.playwright-mcp/anno-*.png`，含流程徽章与规则/状态徽章气泡）
   - **图2 演示与标注并存**：点「演示」开关 → 面板列出状态清单 → 点一个状态项（目标锚点显示、其他状态锚点隐藏、`data-pm-demo` 属性挂载）→ 截图（`.playwright-mcp/demo-*.png`；同时确认三个开关垂直堆叠、面板不遮挡标注徽章）
   - **图3 零残留基线**：点「还原默认态」（页面 reload 恢复）→ 依次关闭两个标注开关 → 截图与开启前对比（标注层零干扰验证）
7. 用 `browser_close` 关闭浏览器。
8. 发现问题 → 修复后重新验证，最多重试 2 次。超过 2 次仍有问题 → 记录到反馈中继续流程。

**若 Playwright 不可用**（降级标注路径，不可静默）：
- 降级处理，但必须降级标注：
  1. 提示 PM："Playwright 暂不可用，建议在浏览器中手动打开页面检查视觉效果，或配置 Playwright MCP 后补做运行时验证。"
  2. 记录降级原因（如"MCP 未配置/连接失败"）到反馈/交付说明中，不静默跳过。
  3. 不阻塞交付。

##### 10b. 独立设计评审（reviewer agent）

**触发时点**：build 模式生成完成后**立即评审**（首次生成属结构性大改，不攒批）；edit 模式的触发判定见「评审攒批与批量评审」节。

通过 `Agent` 工具 spawn 一个独立的 reviewer agent：
- **agent_type**: `design-reviewer`（设计审查员人设，见市场根 `.claude/agents/design-reviewer.md`——init-project 已安装到项目级 `.claude/agents/`；独立判断标准以 `references/reviewer-prompt.md` 的 system prompt 覆盖为准）
- **prompt**: **只传评审范围与上下文路径**——页面文件路径列表（本轮评审范围）、`design-system.css` 路径、`page-inventory.md` 路径、`DESIGN.md` 路径（如存在）、check-quality 脚本与 `--page-inventory` 所需路径。**不传任何 check-quality 结论或分数**（技术分由 reviewer 自己跑出来，见下）
- 同时传入 `references/reviewer-prompt.md` 的内容作为 system prompt 覆盖（reviewer 的独立判断标准）
- **截图规范**：reviewer agent 如使用浏览器验证视觉效果，`browser_take_screenshot` 的 `filename` 必须带 `.playwright-mcp/` 前缀（如 `.playwright-mcp/review-p1.png`），**禁止**裸文件名落在项目根目录（该规则已写入 reviewer-prompt.md 的 system prompt）。**默认不截图**，仅当 5 维或 Anti-Slop 无法凭代码判定时才用，每轮上限 2 张
- **技术分由 reviewer 自己跑**：reviewer 在自己的隔离上下文里执行一次**只读**检查（**不带 `--auto-fix`**，零写盘）：

  ```
  node "{check-quality 源码目录}/scripts/check-quality.js" --pages={评审范围} --design-system={路径} --page-inventory={路径}
  ```

  读自己跑出的 JSON → 按 `reviewer-prompt.md` Part C 的 20 项映射表换算技术分。

  > **为什么不由主流程传分数**：主流程是"刚改完页面的现场"，由它跑检查再把结论递进独立评审，等于让 reviewer 吃二手结论、独立性尽失（等同自审）。省掉的应当是 **judgment**（用眼睛把 20 项重判一遍），不是 **execution**（一条确定性命令，秒级）。脚本在此刻跑还有个附带好处：auto-fix 与标注刷新都已落盘，它看到的就是最终态——"用哪次结果"的歧义随之消失。

Reviewer 返回结构化 JSON：
- `verdict`: `"PASS"` | `"REVISE"`
- `scores5d`: 5 维设计评分（philosophy/hierarchy/execution/specificity/restraint），每维 1-5 分 + note；`total5d` 总分 5-25
- `scoreTechnical`: 20 项技术质量加权得分（raw / max（73）/ normalized（5 分制）+ failedItems 清单），附 `source`（`self-run` / `unavailable`）
- `antiSlopFindings`: P0/P1/P2 发现，每项含 file/line/pattern/alternative（具体替代方案，非仅"有问题"）
- `technicalOverrides`（可选）：reviewer 对脚本判定不服的项，须带 `file:line` + 反例，按原权重改写分数

判定逻辑：
- `verdict = PASS` → 进入第十一步（产物清理）
- `verdict = REVISE` → 根据 `antiSlopFindings` 和评分备注中的 fix 建议修复页面 → **重跑第九步 check-quality（`--pages` 只传被修复页）** → 重新 spawn reviewer（第 2 轮）
- 第 2 轮仍 REVISE → 停止重试，向 PM 报告：

> "设计评审两轮后仍有 {N} 个问题未通过：
> {问题列表（含具体文件和修复建议）}
> 是否继续修复（最多再 1 轮），还是先接受当前版本再调整？"

- reviewer agent 调用出错或超时（90 秒——较旧版 60 秒放宽，因其需自行执行一次 check-quality 脚本）→ 降级处理，提示"独立设计评审暂不可用，已通过 check-quality 技术检查，建议手动审查关键页面的视觉效果"，不阻塞交付；**降级时不得清空待评审队列**（edit 模式：本轮改动留在队列里，等下一个触发点重审）
- reviewer 返回 `scoreTechnical.source = "unavailable"`（脚本在其上下文中跑不起来）→ 视为**技术分未验证**，汇报中显式标注"技术分未验证（reviewer 侧脚本不可用），仅供参考"，**不得当作通过**；edit 模式下同时**禁用后续攒批**（下次 edit 强制完整评审，见「评审攒批与批量评审」节）

**上下文隔离**：reviewer agent 通过 `Agent` 工具 spawn，拥有独立上下文窗口和独立系统提示——不会受到 build-prototype 生成过程的影响，不会因"和自己辩论"而让步。技术分同样由它在自己的上下文里跑出来（不接受调用方转述的结论），隔离是完整的。

#### 第十一步：产物清理

生成流程中可能产生废弃文件（如框架壳从 iframe 模式改为内联模式后，独立的 `framework/index.html` 或孤立的 `pages/` 文件不再被任何入口消费）。必须清理死产物：

0. **截图兜底清理**（在任何浏览器截图/评审之后）：扫描项目根目录裸 `*.png`（非 `.playwright-mcp/` 前缀、非 prototype 资产）→ 移至 `.playwright-mcp/` 或删除，静默处理不提示 PM

1. 检查 `prototype/working/` 下页面文件和入口文件的引用关系：
   - `preview.html`（设计系统样板页）→ 始终有效，不纳入清理范围
   - B 模式基础设施文件（`server.js`、`start.bat`、`start.sh`、`close.bat`、`close.sh`、`README.md`、`mock/`）→ 始终有效，不纳入清理范围
   - 能通过页面入口文件（`index.html` 或框架壳入口）导航到达 → 有效
   - 被其他页面通过 `<a href>` 或 JS 跳转引用 → 有效
   - 是 `framework/` 壳入口 → 有效
   - 不被任何入口引用 → 标记为死产物
2. 扫描时排除 `prototype/working/.dead/` 目录自身，避免重复处理已归档的死产物。
3. 将死产物移至 `prototype/working/.dead/` 目录（软删除，可恢复）。如 `.dead/` 已存在则追加。**同名冲突处理**：如果 `.dead/` 中已存在同名文件，新移入的文件自动添加数字后缀（如 `old-page.html` → `old-page-1.html`、`old-page-2.html`），确保旧归档不被覆盖。
4. 报告："已清理 {N} 个废弃文件：{文件列表}。已移至 .dead/ 目录，如需恢复可从此取回。"如有同名冲突，报告中标注重命名情况（如"old-page.html 已存在，重命名为 old-page-1.html"）。

#### 第十一步A：更新页面状态基线

产物清理完成后，更新增量检查基线 `prototype/.last-check.json`（位于 `prototype/` 级，非 working/ 内——deploy-prototype 以 working/ 为服务根，放 working/ 内会暴露在局域网；save-version 只复制 working/，prototype/ 级天然不进 E 快照）：

1. 用内联 `stat -c "%Y %s"` 收集全部 `working/pages/*.html` 的 mtime（秒）+ size，写入基线（格式 `pmcraft-proto.page-baseline.v1`）：`pages`（键 = 相对 pages/ 路径，如 `login.html`）+ `specMd` / `pageInventoryMd`（各自 mtime+size）+ `prdE`（`prd/` 目录最新完整 PRD 的 E{N}，无则 0）+ `updatedAt`。**被清理进 `.dead/` 的页面移出条目**（以 pages/ 实际文件为准，统计时自然覆盖）
2. **清理后写入**：此时 check-quality 自动修复与标注注入已落盘，基线捕获的是最终状态，天然不自伤（下次 edit 比对不会因上次修复误判变化）
3. **写 `review` 块**（可选块，字段命名固定，评审攒批的痕迹载体）：

   ```json
   "review": {
     "lastAt": "2026-09-17T08:00:00.000Z",
     "lastScope": ["p1.html"],
     "pendingRounds": 0,
     "pendingPages": []
   }
   ```

   - `lastAt` = 上次评审完成时刻（ISO 8601）；`lastScope` = 上次评审覆盖的页面；`pendingRounds` = 自上次评审以来累计的 edit 轮数；`pendingPages` = 待评审页（自上次评审后被改动过的页）
   - build 模式在第十步 10b **PASS** 后写入本块并清零 `pendingRounds` / `pendingPages`；若 10b 降级未 PASS（reviewer 不可用 / 超时 / 技术分 `unavailable`）→ **不清零**：把本批次页并入 `pendingPages`、`lastAt` 保持原值，交由存档前批量评审补齐（与禁止行为 17"禁止无登记地跳过评审"一致）
   - **schema 仍为 `pmcraft-proto.page-baseline.v1`**——本块是增量可选字段，不改格式串
   - **兼容**：旧基线无 `review` 块 → 视为无积压（等价旧行为），**不**触发一次性全量评审
   - **写入点白名单**：只有两处可写该块——① **评审完成点**（本步骤 / 批量评审出口：负责清零 `pendingRounds` / `pendingPages` 并刷新 `lastAt` / `lastScope`）；② **edit 攒批登记点**（批量第 6 条 / 单条第 8 条：只并入 `pendingPages`、`pendingRounds` +1，**不清零、不刷新 `lastAt`**）。除这两处外，annotate-prototype 第十步与 check-quality auto-fix 的基线回写**必须原样保留该块及其他未定义顶层字段**（两处已各自立硬约束）
4. 基线写盘失败（目录只读/磁盘满）→ 提示但不阻塞（下次 edit 自动回退全量）

#### 第十二步：提示存档

产物清理完成后，**调用 `AskUserQuestion` 工具**（如可用）：

- `question`: "原型已完成。保存后复制到 prototype/E{编号}/ 目录，方便后续回溯和对比。"
- `header`: "保存存档"
- `options`:
  - `{label: "保存", description: "保存当前版本快照到 prototype/E{编号}/"}`
  - `{label: "保存并设为主分支", description: "保存到 E{编号} 并同步到 main/，部署和分享默认使用"}`
  - `{label: "稍后再说", description: "不保存，需要时告诉我'保存'"}`
- `multiSelect`: false

PM 选"保存" → 调 `pmcraft-proto:save-version`，完成后告知存档编号和路径。
PM 选"保存并设为主分支" → 调 `pmcraft-proto:save-version --main`，完成后告知存档编号和路径（含 main/ 同步）。
PM 选"稍后再说" → "好的，需要保存时随时说'保存'。"

**备选（工具不可用时）**：> "原型已完成。要保存存档吗？(A) 保存到 E 编号 (B) 保存并设为主分支 (C) 稍后再说。"
- 如果 PM 选 A → 调 `pmcraft-proto:save-version`
- 如果 PM 选 B → 调 `pmcraft-proto:save-version --main`
- 如果 PM 选 C → "好的，需要保存时随时说'保存'。"

### edit 模式

#### 修改历史记录

每次 edit 操作前，将当前受影响的页面文件备份到内存（session 级变量）中：

1. 备份格式：`{undo-timestamp}-{page-name}.html`（扩展名 .html）。
2. 最多保留最近 5 次修改的历史记录，超出时丢弃最旧备份。
3. 当 PM 说"撤销上一次修改"或"回退"时，从历史记录中恢复受影响页面上一次的快照。
4. 如果历史记录为空（无备份可恢复）→ 告知 PM"没有可撤销的修改记录"。

#### 批量处理（从 feedback.md 传入多条意见）

如果调用方传入了多条修改意见（来自 feedback.md 的"改吧"批量执行）：

1. 逐条执行以下流程：
   - 如果某条意见是"加一个页面 / 新增 XX 页面"（页面级新增）→ 按单条处理「加一个页面」必做两步分支执行（更新 page-inventory.md → 生成新页面），完成后继续下一条。
   - 如果某条意见是"删掉 XX 页面 / 移除 XX 页面"（页面级删除）→ 按单条处理页面级删除分支执行（清单移除 + 跳转清理 + 文件移 .dead/），完成后继续下一条。
   - 如果某条意见是"加演示入口 / 加场景演示 / 去掉演示入口"（演示面板级操作）→ 按单条处理对应分支执行（见操作表），完成后继续下一条。
   - 如果某条意见能定位到页面和元素 → 执行修改。
   - 如果某条意见无法定位（描述模糊，如"改好看点"、"调一下"等无具体操作对象的意见）→ 标记"跳过"并记录原因，继续处理下一条，不打断批量流程。
   - 如果两条意见冲突（如"按钮加圆角"和"按钮用直角"操作同一元素）→ 以最后一条为准。
2. 全部执行完后 → 报告统计："已执行 {N} 条，跳过 {M} 条（{原因}）"。
3. **自动技术检查**：`0 页变化且基线 prdE 与 prd/ 最新 E 相同` → **跳过本步与 4/5/6 整体衔接**（不调用 check-quality——空 `--pages` 会 usage 报错），仅提示"无实际变更"。否则自动调用 `pmcraft-proto:check-quality`（**`--pages` 只传实际变更页、带 `--auto-fix`**；超时/出错处理同 build 模式第九步）。
4. **标注刷新衔接**：如果 `prototype/working/annotations/` 目录存在 → 调用 `Skill(pmcraft-proto:annotate-prototype)`（refresh）并**传入实际变更页列表**（含页面级新增/删除——删除页由 annotate 清理其 `annotations/{page}.js`）——锚点随页面改动同步，PRD 已存在则顺带补 PRD 溯源。**必须排在 check-quality 之后**：auto-fix 会真实写盘改页面，标注必须在最终页面上生成，否则锚点会指向旧态。
5. **清单一致性自检**：批量完成后对照 `prototype/working/pages/` 实际文件与 page-inventory.md 条目：清单有条目但 pages/ 无对应文件（漏生成）→ 提示补齐；pages/ 有文件但清单无条目（孤儿页面）→ 提示补清单或删除；跳转表引用不存在的页面 → 提示清理。仅报告差异，不自动修改。
6. **评审触发判定**：按「评审攒批与批量评审」节判定本轮是立即评审还是登记待评审（默认攒批）。
#### 单条处理（PM 直接对话提出的意见）

1. 检查 `pmcraft/lessons.md` 是否存在。如果存在 → 读取易错点规则，修改时避免相同错误。
2. 读取 PM 的修改描述，定位修改范围（哪个页面、哪个元素）。**已指明页面 → 只读目标页**（Read/Grep 该页 DOM），**禁止全量扫读未修改页面**。
3. 如果 PM 描述模糊（无法定位到具体的页面名或页面编号）→ 读 page-inventory.md 页面清单（只读清单部分），列出候选页让 PM 确认，**禁止自行全量扫读 pages/ 定位**；仍无法确定时追问"你指的是哪个页面、哪个元素？例如：在 P1 转交发起页上，修改提交按钮的颜色。"
4. 根据修改类型执行对应操作：

| PM 表述 | 操作 |
|:---|:---|
| "加一个 XX" | 在对应页面新增元素 |
| "XX 改到 YY 下面" | 调整 DOM 顺序 |
| "用 XX 颜色" | 修改对应元素样式（颜色值必须从 design-system.css 的 CSS 变量中选取） |
| "删掉 XX" | 移除对应元素 |
| "删掉 XX 页面 / 移除 XX 页面"（页面级） | ① 更新 page-inventory.md 移除该页面条目并清理跳转表中相关跳转 ② 页面文件移至 `.dead/`（软删除，同第十一步） ③ 提示 PM 已从清单移除 |
| "颜色调亮/调暗" | 调整对应颜色的 HSL 亮度值（每次调整 +10%/-10% 亮度，饱和度不变，最多调整 3 次后**调用 `AskUserQuestion` 工具**确认（如可用）："是否需要显著调整色相？"——不可用时纯文本询问同一问题；确认后不再自动调整） |
| "加一个页面" | 超出原页面清单，**必做两步**（不依赖 AskUserQuestion 可用性，不可跳过）：① 更新 page-inventory.md——按 plan-pages 条目格式新增页面条目（页面ID/名称/类型/元素/状态/跳转），跳转表同步增补相关跳转，向 PM 展示新条目确认；② 确认后按新条目走第八步生成流程。禁止不更新清单直接生成页面（PM 明确"不用更新清单直接画"时放行，完成时提示"清单与页面已不一致，建议后续说「规划页面」校准"，见边缘情况处理） |
| "加演示入口 / 加场景演示 / 场景演示入口" | 按第八步B 执行（默认全部 `pages/*.html`，可指定页）：标注层存在 → 数据从 `annotations/{page}.js` state 项派生；标注层不存在 → 提示"请先补标注层（说「加标注」）或确认无标注生成页面级演示（仅文案）"；幂等注入 + 复制 demo 资产 + 汇报（无 state 页列出） |
| "去掉演示入口 / 移除演示入口 / 移除演示" | 幂等移除页面 head 的 demo 3 行引用（`../demo-panel.css` + `../demo/{page}.js` + `../demo-panel-runtime.js`）；`demo/` 数据文件与 working/ 根 demo 资产文件一并删除（保留会误导部署）；汇报已移除页面列表 |
| "XX 字体大一点/小一点" | 调整对应文本的 font-size，步进为 2px，调整后告知 PM 调整后的字号 |

5. 执行修改前自动备份受影响的页面文件到 session 历史记录。
6. **自动技术检查**：`0 页实际变化且基线 prdE 与 prd/ 最新 E 相同` → **跳过 6/7/8 整体衔接**（不调用 check-quality——空 `--pages` 会 usage 报错），仅提示"无实际变更"。否则自动调用 `pmcraft-proto:check-quality`（**`--pages` 只传实际修改页、带 `--auto-fix`**；超时/出错处理同 build 模式第九步）。
7. **标注刷新衔接**：如果 `prototype/working/annotations/` 目录存在且本次修改页非空 → 调用 `Skill(pmcraft-proto:annotate-prototype)`（refresh）并**传入本次修改页列表**——锚点随页面改动同步，PRD 已存在则顺带补 PRD 溯源。**必须排在 check-quality 之后**（同批量第 4 条：auto-fix 写盘在前，标注基于最终页面生成）。
8. **评审触发判定**：按「评审攒批与批量评审」节判定（默认攒批，不 spawn reviewer）。

### 评审攒批与批量评审

> **目的**：把"每轮 spawn 一次独立设计评审"改成"攒批 + 三个触发点"。省掉的成本与"本轮改了几行"无关的那部分；质量底线（5 维评分 + 16 模式 Anti-Slop）一字不动，只是**时点后移、次数合并**。

**默认攒批**：edit 每轮只跑 check-quality（第九步同款）+ 标注 refresh，**不 spawn reviewer**，把本轮变更页登记进基线。

**立即评审的三个触发点**（不攒批，改完当轮就审）：

| 触发 | 判据（客观可复核） |
|---|---|
| **结构性大改** | ① 页面新增 / 删除 / 重命名（page-inventory 条目或 pages/ 文件集合变化）；② 标注层或演示入口增删；③ 页面 `<script>` 块内容变化（交互行为变了） |
| **有界阈值** | 取**本轮登记后**的值判：`review.pendingRounds ≥ 3` **或** `review.pendingPages` 去重后 `≥ 5`（先到者）→ 当轮立即评审 |
| **PM 显式** | PM 说「审查原型」（走 review-ux），或调用时带 `--strict`（每轮评审，旧行为）；build 模式本就不攒批，`--strict` 对其无差异 |

**登记规则**：非上述触发的编辑轮，完成后更新基线 `review` 块——`pendingPages` 并入本轮变更页（去重）、`pendingRounds` +1。**基线缺失/损坏 → 本次回退旧行为**（立即评审，不做登记）——比"登记到不存在的地方"更安全。

**判定顺序（先登记、后判阈值）**：本轮**先完成登记**（`pendingPages` 并入本轮变更页去重、`pendingRounds` +1），**再**用登记后的值判阈值——因此连续第 3 轮未评审即触发（而非第 4 轮）。顺序写死，禁止先判阈值再登记。

**结构性大改轮的轻验证**：因结构性大改（触发表第①③类）触发的当轮评审，**先按第十步 10a 的范围规则对变更页做轻验证**（navigate + 点本轮新增/改动的交互元素 + 1 张 `.playwright-mcp/` 截图），通过后再进入下面的评审流程；纯样式/文案编辑轮不跑浏览器（对应维度由 check-quality 静态覆盖，见约束 17）。

**批量评审（存档前置门）**：

1. **触发**：`review.pendingPages` 非空时，**不得直接调用 `save-version`**，先执行批量评审（路由层同规则，见 CLAUDE.md「保存/存档」语义行）。
2. **范围** = `review.pendingPages` ∪ 自 `review.lastAt` 之后被改动的页（基线 mtime + size 比对兜底，防手工改文件绕过登记）。**先按 `pages/` 实际文件过滤掉已删除/重命名的页**（防止把不存在的路径传给 reviewer 与 check-quality 触发 usage 报错）；过滤后范围为空 → 不 spawn reviewer、不调用 check-quality，仅清零队列。
3. **流程** = build 模式第十步 10b 同一套：同一 reviewer 人设与 system prompt、同一"自己跑 check-quality 取技术分"的方式、同一 PASS/REVISE 判定；REVISE → 修复 → 重跑 check-quality（`--pages` 只传被修复页）→ 重新 spawn（最多 2 轮）。
4. **收尾**：PASS → 清零 `pendingRounds` / `pendingPages`、刷新 `lastAt` / `lastScope`，然后才调 `save-version`。评审未 PASS 或降级 → **不清空队列**，如实报告。
5. **汇报格式**：`本轮批量评审覆盖 {N} 页（{页列表}），自 {lastAt} 起累计 {M} 轮未评审。`

**降级规则（禁用攒批的两种情形）**：① check-quality 不可用 / 超时（第九步降级）；② reviewer 返回技术分 `unavailable`。两者出现后，**当轮即恢复完整评审**，并在本轮结束前提示 PM"质量检查降级，已跳过评审攒批"。情形 ① 下 reviewer 通常也取不到技术分，属**预期连锁**——按 10b 的 `unavailable` 分支标注"技术分未验证（reviewer 侧脚本不可用）"，不重复触发新一轮降级判定，也不因此阻塞交付。

**痕迹纪律**：攒批不等于静默跳过——`pendingRounds` / `pendingPages` 写在基线里、存档前强制拦截、状态检测会播报待评审页数（CLAUDE.md）。**禁止**在没有登记的情况下跳过评审。

## 输出

| 文件 | 路径 | 用途 |
|------|------|------|
| `pages/{page-name}{-端后缀}.html` | `prototype/working/pages/{page-name}.html` | 每个页面独立文件；多端场景时加端后缀（如 `pages/order-pc.html`、`pages/order-h5.html`） |
| `index.html` | `prototype/working/index.html` | 主入口（串联所有页面，含导航入口）— **仅 HTML 模式输出**。按平台输出对应框架壳 |
| `framework/`（存量场景） | `prototype/working/framework/` | 旧系统框架壳目录（含 HTML/CSS/JS，导入时生成） |
| `mock/db.json`（B 模式） | `prototype/working/mock/db.json` | 数据源文件 |
| `server.js`（B 模式） | `prototype/working/server.js` | 后端服务入口 |
| `start.bat` / `start.sh`（B 模式） | `prototype/working/start.bat` / `prototype/working/start.sh` | 启动本地服务的脚本 |
| `close.bat` / `close.sh`（B 模式） | `prototype/working/close.bat` / `prototype/working/close.sh` | 关闭本地服务的脚本 |
| `README.md`（B 模式） | `prototype/working/README.md` | 原型使用说明文档 |
| `assets/seeds/{platform}.html` | `skills/build-prototype/assets/seeds/` | 平台种子模板（布局基类 + chrome 结构） |
| `../../_shared/_common.css` | `../../_shared/` | 跨平台通用组件样式（btn/card/table/badge/field/stat/typography/modal/toast） |
| `annotations.css`（第八步A） | `prototype/working/annotations.css` | 标注层运行时样式（从 `{本技能源码目录}/../../_shared/annotations/` 复制） |
| `annotations-runtime.js`（第八步A） | `prototype/working/annotations-runtime.js` | 标注层运行时逻辑（从 `{本技能源码目录}/../../_shared/annotations/` 复制） |
| `annotations/{page}.js`（第八步A） | `prototype/working/annotations/{page}.js` | 每页标注数据（严格 JSON，`window.PM_ANNOTATIONS_DATA`） |
| `demo-panel.css`（第八步B） | `prototype/working/demo-panel.css` | 状态演示面板运行时样式（从 `{本技能源码目录}/../../_shared/demo/` 复制） |
| `demo-panel-runtime.js`（第八步B） | `prototype/working/demo-panel-runtime.js` | 状态演示面板运行时逻辑（从 `{本技能源码目录}/../../_shared/demo/` 复制） |
| `demo/{page}.js`（第八步B） | `prototype/working/demo/{page}.js` | 每页状态演示数据（严格 JSON，`window.PM_DEMO_DATA`；从标注层 state 项派生，仅 `pages/*.html`，index.html 不生成） |
| `references/layouts/{platform}-layouts.md` | `skills/build-prototype/references/layouts/` | 平台布局骨架库（L01-L07） |
| `references/checklist.md` | `skills/build-prototype/references/` | 生成质量自检清单（P0/P1/P2） |
| `references/token-fallback.md` | `skills/build-prototype/references/` | CSS 变量回退规则表 |
| `references/test-cases.md` | `skills/build-prototype/references/` | 评价测试用例（人工评估用，AI 不读取，版本发布前人工评估参考） |

### 页面输出模板（HTML 模式）

每个页面文件按以下骨架生成。生成顺序：复制平台种子 → 保留 chrome → 粘贴布局骨架 → 替换占位符：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="../_common.css" />
  <title>{页面名}</title>
</head>
<body>
  <!-- {平台chrome}：来自 assets/seeds/{platform}.html，导航/侧边栏/顶栏/TabBar 原样保留，禁止修改 -->
  <main class="content">
    <!-- {布局骨架}：来自 references/layouts/{platform}-layouts.md，按页面类型匹配 L01-L07 -->
  </main>
  <script>
    // {数据层}：A 模式 = 内存数组 + add/delete/update 函数；B 模式 = fetch('/api/{entity}') 与后端交互
  </script>
</body>
</html>
```

**{占位符}填充规则**：

| 占位符 | 填充来源 | 规则 |
|:---|:---|:---|
| `{页面名}` | page-inventory.md 页面名 | 文件名 `pages/{page-name}{-端后缀}.html`（多端加 -pc/-h5 后缀） |
| `{平台chrome}` | `assets/seeds/{platform}.html` | 删除 `<main>` 或 `.content` 中的示例内容，其余原样保留；framework/ 存在时以框架壳覆盖 |
| `{布局骨架}` | `references/layouts/{platform}-layouts.md` | 按页面 `类型` 匹配（L01-L07），将布局中全部 `[REPLACE]` 占位符替换为 page-inventory.md 实际内容 |
| `{数据层}` | 第三步确认的数据模式 | A 模式写入内存数组；B 模式通过 `fetch('/api/{entity}')` 交互，禁止直接操作内存变量 |

### 资源地图

build-prototype 的种子模板和布局骨架是预置的 CSS 工程质量资产。Agent 不写 CSS，只复制、粘贴、填充。

```
skills/build-prototype/
├── SKILL.md                              ← 当前文件
├── assets/
│   └── seeds/
│       ├── pc-fullscreen.html            ← PC-全屏网页 种子（sidebar + topbar + content）
│       ├── pc-desktop-style.html         ← PC-桌面软件风格 种子（toolbar + 多面板 + context-menu）
│       ├── mobile-h5.html                ← 移动-H5 网页 种子（header + 单列 + 触屏）
│       ├── mobile-phone-app.html         ← 移动-手机App模拟 种子（iPhone壳 + TabBar + 堆栈导航）
│       └── mobile-tablet-app.html        ← 移动-平板App模拟 种子（平板壳 + 侧栏 + 分栏视图）
└── references/
    ├── layouts/
    │   ├── pc-fullscreen-layouts.md      ← L01-L07（列表/表单/详情/仪表盘/空状态/错误/登录）
    │   ├── pc-desktop-style-layouts.md   ← L01-L06（列表/表单/详情/仪表盘/空状态/错误）
    │   ├── mobile-h5-layouts.md          ← L01-L07
    │   ├── mobile-phone-app-layouts.md   ← L01-L07
    │   └── mobile-tablet-app-layouts.md  ← L01-L07
    ├── checklist.md                      ← P0/P1/P2 生成质量自检清单
    ├── token-fallback.md                 ← CSS 变量回退规则表
    ├── reviewer-prompt.md                ← 独立 reviewer agent 的评审标准
    └── test-cases.md                     ← 评价测试用例（人工评估用，AI 不读取）
```

**种子读取规则**：
- `../../_shared/_common.css`（插件源码位置）由 set-style 产出 2.5 复制到 `prototype/working/_common.css`；5 个种子通过 `@import url('../_common.css')` 引入（页面运行时位于 `prototype/working/pages/`，`../` 指向 working/ 根）——Agent 读种子时看到 `@import` 即知通用组件 class 视同种子定义。
- `prototype/working/framework/` 存在时 → 跳过种子 chrome 部分（导航/侧边栏/布局壳），用 framework/ 内容覆盖；`_common.css` 组件样式保留。
- Element Plus 离线包位于 `../../_shared/vendor/element-plus/`（pmcraft-proto 插件根目录），vue-ep 技术栈时从此处复制到 `prototype/working/assets/vendor/element-plus/`（**全部 5 个文件**：`index.css`、`index.full.min.js`、`icons-global.iife.min.js`、`vue.global.prod.js`、`locale/zh-cn.min.js`）。
- **vue-ep 页面引用顺序**（全部本地相对路径，禁止任何 unpkg/CDN）：
  ```html
  <link rel="stylesheet" href="assets/vendor/element-plus/index.css">
  <script src="assets/vendor/element-plus/vue.global.prod.js"></script>
  <script src="assets/vendor/element-plus/index.full.min.js"></script>
  <script src="assets/vendor/element-plus/icons-global.iife.min.js"></script>
  <script src="assets/vendor/element-plus/locale/zh-cn.min.js"></script>
  ```
- **vue-ep 应用注册**（含中文语言包，页面底部统一注册）：
  ```js
  const { createApp } = Vue;
  const app = createApp({ /* ... */ });
  app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
  Object.entries(ElementPlusIconsVue).forEach(([name, comp]) => app.component(comp.name, comp));
  app.mount('#app');
  ```

## 与上下游的衔接

| 来源 | 读取路径 | 读取的字段 |
|------|---------|-----------|
| spec.md（上游） | `prototype/working/spec.md` | 使用端、使用端子类（平台参数） |
| page-inventory.md（上游） | `prototype/working/page-inventory.md` | 页面列表、元素、状态、跳转 |
| DESIGN.md（上游） | `prototype/working/DESIGN.md` | 语义令牌含义（仅参考） |
| design-system.css（上游） | `prototype/working/design-system.css` | CSS 变量值（配色、字体、间距、圆角、阴影的实际值） |
| lessons.md（上游） | `pmcraft/lessons.md` | 易错点规则 |
| framework/（存量场景） | `prototype/working/framework/` | 框架壳目录 |
| design-reference.md（存量场景） | `prototype/reference/design-reference.md` | 设计参考报告（图标系统、组件风格、布局模式） |

| 下游 | 调用时机 | 说明 |
|------|---------|------|
| pmcraft-proto:check-quality | build 模式第九步 / edit 模式修改后（存档前批量评审时，reviewer 另自跑一次只读检查） | 自动技术检查（带 `--auto-fix`：脚本写盘修复 + 写后复检 + 基线自刷新）；剩余不可自动修复的 HIGH → AI 修 1 次 + 复检 1 次；超时/不可用降级处理不阻塞并**禁用攒批** |
| reviewer-agent（独立设计评审） | build 模式第十步-10b（生成后立即） / edit 模式三个触发点（结构性大改、达阈值、PM 显式） | spawn 独立 reviewer agent：5 维评分 + Anti-Slop 检测 + **自跑 check-quality 取技术分**；PASS 继续 / REVISE 修复后重审（最多 2 轮） |
| pmcraft-proto:annotate-prototype | build 模式第八步A（HTML）/ edit 修改后（annotations/ 存在时） | 生成/刷新标注层（规则 R 编号、状态矩阵、交互流程、PRD 溯源；edit 传实际变更页，增量刷新） |
| 状态演示入口（第八步B 自执行） | build 模式第八步B（HTML，标注层后）/ edit「加演示入口」 | 从标注层 state 项派生 demo 数据 → 注入 head 3 行 → 复制 demo 资产（仅 `pages/*.html`，index.html 不生成）；标注 refresh 后由 annotate-prototype 重派生 demo 数据 |
| pmcraft-proto:save-version | PM 说"保存"时由 CLAUDE.md 路由调用 | 将 prototype/working/ 中的产物快照到 prototype/E{编号}/ |

## 禁止行为

1. **禁止从参考图/截图直接提取色值/字体** — 所有颜色/字体必须从 design-system.css 取；DESIGN.md 仅作语义参考，不从中取具体数值
2. **禁止自行发明新的全局 CSS class** — 只能使用平台种子模板（含 `_common.css`）中已定义的 class；新样式用内联 `style`，多处复用先在 `_common.css` 中补充
3. **禁止用 "Lorem ipsum" 或纯占位文字** — 内容未定义时使用上下文相关的示例文案
4. **禁止生成独立 index.html 或另起渲染实例** — 存量场景（framework/ 存在）新页面必须嵌入框架壳入口文件，只有一个入口、一个框架、一种渲染方式
5. **禁止编造缺失资产** — 缺失图标用**虚线占位框 + 图标名**替代并标注"图标 {名称} 缺失"（与第八步图标三级查找链与回退规则、边缘情况表一致）、缺失头像用首字母圆形、缺失图片用宽高比占位卡；禁止用 emoji/UTF-8 符号代替功能图标（check-quality 会将 emoji 报为缺陷，且符号不跟随样式），不编造假图片/假数据
6. **禁止混用图标体系** — 图标系统按 DESIGN.md 注册方式统一（存量对齐），禁止 emoji/Lucide 与 Element Plus 图标混用
7. **禁止用 ESM 写 server.js** — 必须 CommonJS（`require('http')` + `__dirname` 定位），禁止 `import.meta.dirname`
8. **禁止生成孤立页面** — 页面必须通过导航或跳转链接互相可达，page-inventory.md 声明的跳转关系必须实现
9. **禁止死产物滞留 working/** — 生成完毕后引用链路断开的文件移至 `.dead/`，不留未被任何入口引用的文件
10. **禁止批量生成流程页** — 流程页必须逐个经 PM 确认，不能批量生成
11. **禁止截图裸文件名落在项目根目录** — 主流程第十步 10a 与 reviewer 子代理的 Playwright 截图，`filename` 一律带 `.playwright-mcp/` 前缀（如 `.playwright-mcp/screenshot-p1.png`），禁止裸文件名落在项目根目录
12. **标注层资产豁免** — `annotations.css` / `annotations-runtime.js` / `annotations/*.js` 使用 `pm-anno-` 前缀命名空间，属独立资产，不受"禁止发明新的全局 CSS class"约束（由第八步A 的 annotate-prototype 管理）；**演示层资产同豁免** — `demo-panel.css` / `demo-panel-runtime.js` / `demo/*.js` 使用 `pm-demo-` 前缀命名空间（数据文件仅定义 `window.PM_DEMO_DATA` 纯数据，无 class），由第八步B 管理
13. **禁止在非 HTML 技术栈下生成标注层** — 第八步A 仅在技术栈为 HTML 时调用 annotate-prototype；React/Vue 模式跳过并提示"标注层 v1 仅支持 HTML 模式。React/Vue 组件建议在 HTML 模式原型中查看标注效果。"
14. **禁止编造标注锚点** — annotate-prototype refresh 无法重映射锚点时，锚定最接近元素并附 anchorNote，不得凭空指定锚点
15. **edit 模式禁止重读未修改页面** — 修改定位只读目标页（PM 已指明页或从 page-inventory.md 清单确认的候选页），禁止全量扫读 pages/ 未修改页面；标注刷新与 check-quality 只传实际变更页
16. **禁止生成摆设按钮** — 每个看起来能点的按钮（button/a 且有点击交互样式）必须有真实结果：绑定 handler/跳转/选中状态切换；暂不支持的操作置灰并标注原因（如"未实现"），或页面明确声明"静态示意不可点"（anti-ai-flavor 模式 13）。禁止筛选不筛、收藏无选中态、导出弹假成功。
17. **禁止无登记地跳过评审** — 攒批必须写入基线 `review` 块（`pendingPages` + `pendingRounds`）并在存档前强制清空。禁止"这轮就不审了"式的静默跳过；降级情形（check-quality 不可用/超时、技术分 `unavailable`）必须禁用攒批并告知 PM。
18. **禁止向 reviewer 转述 check-quality 结论** — spawn 时只传评审范围与上下文路径，**不传任何分数或结论**；技术分必须由 reviewer 在自己的隔离上下文里跑脚本得出。转述结论等于让独立评审吃二手结论，独立性尽失（等同自审）。**判定口径**：spawn prompt 中不得出现任何来自第九步的数字、检查项名或失败清单；reviewer 返回的 `scoreTechnical.source` 必须为 `self-run`（为 `unavailable` 即技术分未验证，不得当通过）；一旦发现已转述 → 本次评审无效，须按本约束重新 spawn。
19. **禁止在非白名单写入点改写基线 `review` 块** — 只有"评审完成点"（第十一步A / 批量评审出口，可清零）与"edit 攒批登记点"（批量第 6 条 / 单条第 8 条，只累加不清零）可写该块；annotate-prototype 第十步与 check-quality auto-fix 的基线回写**必须原样保留该块及其他未定义顶层字段**，不得整块重写丢失。
20. **禁止把 auto-fix 的复检外包给"重跑一次看看"** — `--auto-fix` 的写后复检与基线刷新在脚本内已完成（`per_page` 反映修复后状态），调用方手动重跑只会让基线反复过期、放大漂移。

## 约束

1. **每个页面必须覆盖至少 2 种状态** — 不允许零状态的静态页。至少包含默认态 + 加载态或空数据态。
2. **生成后必须通过双门质量检查** — 先通过 check-quality（静态技术检查 + `--auto-fix`），再通过独立 reviewer agent（5 维设计评审 + Anti-Slop 检测）。任一未通过 → 修复后重试：check-quality = 脚本自动修一次 + AI 修一次（仅不可自动修复项）+ 复检一次；reviewer 最多 2 轮。超时或不可用时降级处理，不阻塞流程，**但降级时攒批与任何评审豁免一律失效**（回退逐轮完整评审）。
3. **布局避免全卡片化** — 不要将每个区域都塞入卡片，避免相同尺寸卡片+图标+文案的重复网格。卡片不嵌套卡片。
4. **空数据态应引导用户操作** — 空数据态不是"暂无数据"的静态提示，应说明下一步可做什么（如"还没有订单，去创建一个"）。
5. **按钮必须区分层级** — 每页只有一个主要操作按钮，其余使用次按钮或幽灵按钮。
6. **避免滥用模态框** — 优先使用内联展开或编辑区域，模态框仅用于必须中断用户流程的场景。
7. **交互动效遵守性能原则** — 只对 `transform` 和 `opacity` 应用动效，不动画 `width`/`height`/`padding` 等布局属性。微交互时长控制在 150-300ms。
8. **外部依赖不可用时的回退方案** — Element Plus 离线包缺失时回退为纯 HTML 实现；本地图标缺失时走三级查找链（aliases.json 查名 → icon-get.js 取内容 → 相近别名），全部落空则用虚线占位框 + 图标名（禁止 emoji/UTF-8 符号）。icon-get.js 不可用时（node 缺失）回退直接读取备份源 `C:\dev\pmcraft\_icon\{库}\svg\{名称}.svg`（注：该备份源为开发者本机 svg 备份约定，仅在本机有效；其他环境下备份源不存在时同样走虚线占位框回退）。不得出现空白页面。
9. **单次 build 页面数上限** — 单次 build 生成的页面总数不应超过 20 页。超过时拆分执行（每次生成 10 页），每批完成后**调用 `AskUserQuestion` 工具**（如可用）：

    - `question`: "已生成 10 页，继续生成剩余页面还是暂停确认？"
    - `header`: "生成进度"
    - `options`:
      - `{label: "继续生成", description: "继续生成下一批页面"}`
      - `{label: "暂停确认", description: "暂停生成，先确认已生成的页面效果"}`
    - `multiSelect`: false

    **备选（工具不可用时）**：文字询问 PM "继续生成还是暂停确认？"
10. **写入失败时自动重试** — 写入页面文件失败时，自动重试 1 次。重试仍失败则提示"写入失败：{文件名}，请检查磁盘空间或路径权限"，退出当前页生成，不影响其他页。
11. **edit 操作支持撤销** — 每次 edit 前备份受影响的页面到 session 历史记录（最多保留 5 次），PM 说"撤销"时恢复。
12. **check-quality 的 MEDIUM 问题不能以"存量框架约束"为由跳过** — 收到 checker 报告后，DOM 结构和交互逻辑不可随意改，但图标、配色、排版等视觉层 MEDIUM 问题就是该修的问题。
13. **平台一致性** — 同一构建批次的所有页面必须使用同一平台模板（框架壳、视口约束、交互范式一致）。多端场景时分批生成，每次只生成一端，完成后告知 PM 当前端已就绪，再进入下一端。
14. **移动端触控目标** — 移动端所有可交互元素（按钮、链接、表单控件）的最小点击/触控区域不得小于 44x44px，且必须有 `cursor: pointer` 样式。PC 端标准尺寸（>=32px）。
15. **移动端手机壳必用** — 手机 App 模拟和平板 App 模拟必须使用壳包裹，页面本身的尺寸固定且居中显示在浏览器中。壳的背景（页面外的区域）使用深色（`#1a1a1a`），模拟真机息屏边框效果。
16. **Mobile-first 响应式** — 移动-H5 网页必须使用流动布局，不固定宽度，不出现水平滚动条。最大内容宽度不超过 480px，在桌面浏览器中居中显示。
17. **运行时验证分层** — 关键交互不得取消运行时验证，但按风险分层（不是"按模式一刀切"）：静态可操作性由 check-quality 每轮兜底；build 模式第十步 10a 按**本批次页**做浏览器验证；edit 模式**结构性大改**（页面增删、`<script>` 变化、标注/演示入口增删）在评审时对变更页做轻验证（navigate + 点本轮新增/改动的交互元素 + 1 张截图）；纯样式/文案编辑不跑浏览器（对应维度由 check-quality 静态覆盖）。
18. **评审攒批有界** — edit 默认攒批；上限 `pendingRounds ≥ 3` 或 `pendingPages` 去重后 `≥ 5`（判据取**本轮登记后**的值，先到者当轮立即评审）；存档前必须清空队列；`--strict` 时不做攒批（每轮评审）。

## 正误示例

### 正确示例

```
build-prototype build all HTML
```
预期：读取页面清单，流程页逐个确认后生成，基础页批量生成，完成后自动质量检查。

```
build-prototype build P1
```
预期：只生成 P1 一个页面，展示给 PM 确认。

产出示例（HTML 模式，单页场景）：
```
prototype/working/
├── index.html            ← 主入口（串联所有页面，仅 HTML 模式）
├── _common.css           ← 通用组件样式（set-style 产出）
├── design-system.css     ← 设计令牌 CSS 变量
└── pages/
    └── p1.html           ← P1 页面（种子 chrome + 布局骨架 + 数据层）
```

```
build-prototype edit P1 加一个全选按钮
```
预期：定位到 P1，增加全选按钮，自动质量检查。

```
build-prototype build all HTML（含第八步A 标注层自动生成）
```
预期：全部页面生成后自动调用 annotate-prototype（mode=build）——生成 `annotations/{page}.js`、幂等注入每页 head 标注标签、复制运行时资产，并提示"页面右下角「规则和状态标注」「流程标注」开关可分别查看规则/状态与流程标注，两个开关可同时开启"。

```
build-prototype edit P1 改按钮颜色（annotations/ 已存在）
```
预期：修改完成后自动追加调用 annotate-prototype（refresh）——标注锚点随页面改动同步，PRD 已存在时顺带补 PRD 溯源。

### 错误示例

**错误**: 流程页批量生成
```
（一次性生成所有流程页，不逐个确认）
```
问题：PM 可能在看完全部页面后才发现第一个页面方向就错了。正确做法：流程页逐个确认。

**错误**: 颜色从参考图提取而非设计系统
```
按钮颜色使用了参考图中的 #ABCDEF，该色值不在 design-system.css 的 CSS 变量中
```
问题：设计系统锁定的颜色才是统一规范。正确做法：只能使用 design-system.css 中声明的 CSS 变量值。

**错误**: 页面只包含静态结构，无状态切换
```
生成一个登录页，只包含默认态，缺少加载态和错误态
```
问题：每个页面必须覆盖至少 2 种状态。正确做法：包含默认态、加载态、错误态中的至少两种。

**错误**: 本地 SVG 图标文件缺失
```
（icon-get.js 查不到该图标，页面图标区域空白）
```
问题：本地图标资产缺失时没有回退方案。正确做法：使用虚线占位框 + 图标名替代图标，标注"图标 {名称} 缺失"（禁止用 emoji/UTF-8 符号——会被 check-quality 报为缺陷且不跟随样式）。

**错误**: React/Vue 技术栈下仍生成标注层
```
（技术栈为 React/Vue 时，仍调用 annotate-prototype 生成标注）
```
问题：标注层 v1 仅支持 HTML 模式，React/Vue 下标注运行时无法挂载。正确做法：跳过标注生成并提示"标注层 v1 仅支持 HTML 模式。React/Vue 组件建议在 HTML 模式原型中查看标注效果。"

**错误**: 标注锚点失效时编造锚点
```
（edit 后元素 id 变更，annotate-prototype refresh 无法重映射锚点，凭空指定新锚点）
```
问题：编造的锚点会把标注挂到错误元素上，程序员拿到的是错误的规则/流程定位。正确做法：锚定最接近的目标元素，并附 anchorNote 注明锚点不确定性。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 |
| :--- | :--- | :--- |
| prototype/working/page-inventory.md 不存在 | build 模式但无页面清单 | 提示"请先规划页面结构"，退出 |
| page-inventory.md 格式异常 | 页面清单缺少类型/元素/状态/跳转字段 | 提示"page-inventory.md 格式不完整，请检查后重新规划页面"，退出 |
| DESIGN.md 或 design-system.css 存在未替换占位符 | CSS 变量值为 `{hex}`、`{font}`、`{n}` 等占位符 | 提示"DESIGN.md 或 design-system.css 中存在未替换的变量占位符，请先设定风格"（对应第五步检查 4/4a，指明检出文件），退出 |
| prototype/working/DESIGN.md 不存在 | build 模式但无设计系统 | 提示"请先设定风格"，退出 |
| DESIGN.md 存在但 preview.html 不存在 | 设计系统系继承/存量/上版带来，本版本 PM 未确认视觉 | 提示"视觉尚未经本版本确认，请先设定风格出样板"，退出并转 set-style 补确认（可豁免：PM 说"沿用上版"/"不用看了"-> 生成 preview.html 后放行） |
| edit 模式但定位不到修改位置 | PM 描述模糊（无具体页面/元素） | 追问"你指的是哪个页面、哪个元素？例如：在 P1 上修改 XX 按钮的颜色" |
| edit 模式但原型尚未生成 | `prototype/working/pages/` 无页面文件（从未 build） | 提示"原型尚未生成，请先执行 build 模式生成页面"，转 build 流程 |
| edit 模式修改描述为空 | `build-prototype edit` 后无修改内容 | 追问"要改什么内容？" |
| PM 在流程页确认前要求跳过 | 流程页未确认想直接进入下一环节 | 提示"确认后再进行下一步，确保方向正确" |
| PM 上传了参考图但未提取设计系统 | build 模式时 PM 刚上传图 | 引导使用 extract-design 先分析，再继续 |
| PM 在 edit 模式要求加一个页面 | 超出了原页面清单 | **必做两步**：更新 page-inventory.md 新增条目（展示确认）→ 按新条目生成页面；不更新清单直接生成为违规。PM 明确"不用更新清单直接画"→ 放行，完成时提示"清单与页面已不一致，建议后续说「规划页面」校准" |
| 调用 params 全部缺失 | `build-prototype` 无参数 | 追问"build 还是 edit？生成/修改什么内容？" |
| check-quality 检测失败 | build/edit 完成自检不通过 | `--auto-fix` 脚本自动修一次（写后复检已内置）→ 剩余不可自动修复的 HIGH 由 AI 修 1 次 → 复检 1 次；仍失败 → 停止并向 PM 报告"已修复 {N} 处，仍有 {M} 处无法自动修复（{问题列表}）" |
| check-quality 超时 | 检查超过 30 秒未返回 | 视为通过，提示"质量检查超时，建议手动复查关键页面"；**同时禁用本次评审攒批** |
| check-quality 不可用 | 调用 check-quality 时工具报错 | 提示"质量检查工具暂时不可用，请手动检查以下关键项：按钮可点击、跳转可走通、配色无偏离"，不阻塞交付；**同时禁用本次评审攒批**（回退逐轮完整评审） |
| reviewer agent REVISE | 独立设计评审不通过 | 根据 fix 建议修复 → 重跑 check-quality（**`--pages` 只传被修复页**）→ 重新 spawn reviewer（最多 2 轮）；第 2 轮仍 REVISE → 向 PM 报告具体问题，让 PM 决策 |
| reviewer agent 超时/不可用 | spawn 90 秒未返回或 Agent 工具报错 | 降级处理，提示"独立设计评审暂不可用，已通过 check-quality 技术检查"，不阻塞交付；**不清空待评审队列**（edit 模式留到下个触发点重审） |
| reviewer 技术分 `unavailable` | reviewer 在自己上下文中跑 check-quality 脚本失败 | 视为技术分未验证：汇报中显式标注"技术分未验证，仅供参考"，不得当作通过；**禁用后续攒批**（下次 edit 强制完整评审） |
| edit 攒批累计达阈值 | 本轮登记后 `review.pendingRounds ≥ 3` 或 `review.pendingPages` 去重后 `≥ 5` | 当轮**立即**执行完整评审（不再攒批），评审完成后清零队列 |
| 存档前存在待评审队列 | `review.pendingPages` 非空时 PM 说"保存/存档" | **先批量评审**（范围 = pendingPages ∪ 自 lastAt 后被改动的页），PASS 后才调 `save-version`；评审未 PASS 或降级 → 不清空队列、如实报告 |
| 基线无 `review` 块 | 旧版本项目升级后基线里没有该块 | 视为无积压（等价旧行为），**不**触发一次性全量评审；由下一次 build（第十一步A）或全量 annotate 补建 |
| 基线 `review` 块被清空 | annotate refresh / auto-fix 回写基线时整块重写 | 视为基线损坏 → 本次 edit 回退"立即评审"（不做攒批登记），并提示 PM 基线异常 |
| 评审/验证后根目录出现裸截图 | 截图 filename 未带 `.playwright-mcp/` 前缀 | 自查并静默清理：移至 `.playwright-mcp/` 或删除后继续，不提示 PM |
| prototype/working/components/ 目录不存在 | 第八步匹配组件时目录缺失 | 静默跳过组件匹配，直接生成 HTML 结构 |
| 本地图标缺失（bundle 查不到） | 三级查找链（aliases.json → icon-get.js 名称索引 → 相近别名）均落空 | 使用虚线占位框 + 图标名替代图标，标注"图标 {名称} 缺失，已使用虚线占位"（禁止 emoji/UTF-8 符号） |
| Element Plus 离线包不可用 | Vue + 管理后台场景下离线包文件缺失或损坏 | 回退为纯 HTML + CSS 实现，标注"Element Plus 离线包不可用，已回退为纯 HTML 实现" |
| 写入页面文件失败 | 磁盘空间不足或路径权限错误 | 自动重试 1 次，仍失败则提示具体错误，退出当前页生成，不影响其他页 |
| B 模式 server.js 启动后运行时崩溃 | 服务启动成功但后续访问时进程已退出（端口无响应） | 检测到服务不可达时提示 PM "本地服务似乎已停止，是否重新启动？"并提供重启选项；同时检查 `.server.pid` 是否残留，清理后重新 `node server.js` |
| PM 要求撤销上一次修改 | edit 后 PM 说"撤销"或"回退" | 从 session 历史记录中恢复受影响的页面到上一次的快照（最多恢复最近 5 次） |
| 单次 build 页面超过 20 页 | page-inventory.md 列出 25 个页面 | 拆分执行每次 10 页，每次完成后让 PM 选择继续或暂停 |
| PM 连续 3 次修改同一元素的同类型属性 | 如同一个按钮颜色被改了 3 次 | **调用 `AskUserQuestion` 工具**（如可用）确认最终效果（连续 3 次调色时询问"是否需要显著调整色相？"，不可用时纯文本询问同一问题），确认后不再自动调整 |
| React/Vue 技术栈 | 第八步A 时技术栈非 HTML | 跳过标注生成，提示"标注层 v1 仅支持 HTML 模式" |
| 标注锚点失效 | edit 后元素 id 变更，annotate-prototype refresh 重映射失败 | 锚最接近元素 + anchorNote，不得编造锚点 |
| spec 无状态矩阵 | annotate-prototype 生成时矩阵缺失 | 从 page-inventory「状态」字段提取，`stateSource` 标记 + 提示 PM |
| PRD 缺失 | 第八步A 时 PRD 尚未生成（原型先行） | 标注首版无溯源，PRD 保存后 save-doc 自动衔接 refresh |
| annotate-prototype 调用失败 | 第八步A 自动标注或 edit 后 refresh 时工具不可用/报错 | 提示"标注层生成失败：{原因}"，不阻塞原型交付；PM 可随时说「加标注」重试（与 extend-html 同场景话术一致，路由表已注册） |
| edit「加演示入口」时标注层不存在 | `annotations/` 目录缺失或为空 | 提示"请先补标注层（说「加标注」）或确认无标注生成页面级演示（仅文案）"，不派生数据 |
| 第八步B demo 资产缺失 | `../../_shared/demo/` 文件缺失 | 提示"共享演示资产缺失：{文件名}，请检查插件完整性"，退出，不注入引用 |
| 页面缺少 `</head>` | 第八步B 注入时目标页无 `</head>` | 跳过该页注入，汇总"页面 {文件名} 缺少 </head>，未注入"报告 PM |
| 生成后 feedback.md 中意见全是"跳过" | 批量执行时所有意见均无法定位 | 报告"所有 {N} 条意见均无法定位，请逐一明确修改对象后再试" |
| Playwright MCP 不可用 | 第十步 10a 浏览器验证时工具报错 | 降级处理，提示 PM "Playwright 暂不可用，建议在浏览器中手动打开页面检查视觉效果"，不阻塞交付 |
| 浏览器截图发现问题超过 2 次 | 第十步 10a 修复 2 次后仍有视觉问题 | 记录到反馈中继续流程，不无限循环 |
| 本轮无标注/演示变更 | 10a 时本次未重建标注层也未刷 demo 数据 | 静默跳过**标注+演示合并验证**（不点开关、不截图），汇报中注明"本轮无标注/演示变更，已跳过标注+演示合并验证（其余可视验证照常）"；**不得**因此跳过 10a 的其余可视验证 |
| 产物清理发现死产物 | 第十一步检测到无引用的废弃文件 | 移至 `.dead/` 目录，报告清理结果 |
| `.dead/` 目录已存在 | 多次清理产生死产物 | 追加新死产物；同名文件自动添加数字后缀（如 `old-page.html` → `old-page-1.html`），不覆盖已有归档 |
| `.dead/` 中已有同名文件 | 多次 build 产生同名死产物 | 新移入文件自动重命名加数字后缀，报告中标注重命名情况 |
| `preview.html` 存在 | 第十一步扫描到 working/ 下的样板页 | 跳过，始终视为有效（不受引用链路检查） |
| `.dead/` 目录被第二次扫描 | 再次 build 时扫描 working/ 遍历到 .dead/ 内容 | 显式排除 `.dead/` 目录，不重复处理已归档死产物 |
| 基线缺失/损坏 | edit 时 `prototype/.last-check.json` 不存在/JSON 损坏 | 本次 annotate refresh / check-quality 按全量处理，行为与现状一致；下次 build/edit 完成后重建基线 |
| 页面新增/删除/重命名 | edit 后 pages/ 文件集合变化 | 基线以 pages/ 实际文件为准：新增自然收录、删除（移 .dead/）自然移出条目；annotate refresh 只处理变化页 |
| E 快照恢复 working | 从 E{N} 复制页面回 working（mtime 全变） | 基线比对全部变化 → annotate refresh / check-quality 自动全量，行为与现状一致 |
| edit 后 0 页实际变化 | 批量意见全部"跳过"/修改被撤销，且基线 prdE 未变 | 跳过整体衔接（批量 3/4/5/6、单条 6/7/8）——不调用 check-quality（空 `--pages` 会 usage 报错），仅提示"无实际变更"；本轮**不计入** `review.pendingRounds` |

## 评估测试用例

内联简版供 Grader 快速评估；**完整版（18 正向 + 13 负向 + 12 边界）见 `references/test-cases.md`**（人工评估用，AI 生成时不读取）。

### 正向触发（10条）

1. `build-prototype build all HTML`（页面清单含 2 流程页 + 2 基础页）— 预期：流程页逐个确认，基础页批量生成，完成后自动检查
2. `build-prototype build P1` — 预期：只生成 P1 一个页面
3. `build-prototype edit P1 加一个全选按钮` — 预期：定位 P1 增加按钮，自动检查
4. 生成完成后质量检查发现配色偏离 — 预期：`--auto-fix` 脚本直接写盘修复 + 写后复检（调用方不重跑），基线条目同步刷新
5. edit 只改 1 页（基线存在，5 页项目）— 预期：只 Read 目标页 DOM；check-quality `--pages` 只传 1 页且带 `--auto-fix`；annotate refresh 只处理 1 页；**默认攒批 → 不 spawn reviewer**，登记 `review.pendingPages` + `pendingRounds` +1
6. build 完成后第八步B 自动生成状态演示入口（HTML 技术栈）— 预期：`demo/{page}.js` 从标注 state 项派生、每页 head 幂等注入 3 行、demo 资产复制 working/ 根；仅 `pages/*.html`，index.html 不注入
7. edit 攒批累计到阈值（连续 3 轮编辑未存档）— 预期：第 3 轮 `pendingRounds ≥ 3` → **当轮立即完整评审**，评审后清零队列
8. edit 后说「保存原型」且队列非空 — 预期：先批量评审（范围 = pendingPages ∪ 自 lastAt 后被改动页），PASS 后才调 save-version
9. `build-prototype edit P1 改按钮颜色 --strict` — 预期：跳过攒批，当轮 spawn reviewer（旧行为）
10. 结构调整（给列表加一个全选按钮）— 预期：判为结构性大改 → 当轮立即评审，不等攒批

### 负向触发（5条）

1. `build-prototype build all`（page-inventory.md 不存在）— 预期：提示先规划页面，退出
2. `build-prototype edit 改颜色`（原型未生成）— 预期：提示先生成原型
3. `build-prototype build all HTML`（DESIGN.md 不存在）— 预期：提示先设定风格，退出
4. `build-prototype`（无参数，意图模糊）— 预期：追问"build 还是 edit？生成什么内容？"
5. 存量导入场景：`framework/` 含 `.tsx/.vue` 页面（第八步A 标注生成）— 预期：跳过标注，提示"标注层 v1 仅支持 HTML 模式"

### 边界查询（7条）

1. page-inventory.md 中只有一个页面 — 预期：直接生成，无需区分流程页/基础页分类
2. PM 连续生成后要求撤销上一次修改 — 预期：从 session 历史记录恢复（最多保留 5 次备份）
3. page-inventory.md 列出 25 页，超过单次上限 — 预期：拆分每次 10 页，每批完成后让 PM 选择继续
4. edit「加演示入口」但标注层不存在（annotations/ 缺失）— 预期：提示"请先补标注层（说「加标注」）或确认无标注生成页面级演示（仅文案）"
5. 旧基线无 `review` 块（老项目升级后首次 edit）— 预期：视为无积压、**不**触发一次性全量评审；按本轮变更正常登记
6. check-quality 不可用/超时时 edit — 预期：不走攒批，回退逐轮完整评审，并提示 PM"质量检查降级，已跳过评审攒批"
7. reviewer 返回技术分 `unavailable`（脚本在其上下文中跑不起来）— 预期：汇报标注"技术分未验证，仅供参考"，不得当作通过；禁用后续攒批

## 快速参考

| 操作 | 命令 |
|:---|:---|
| 首次生成全部页面 | `build-prototype build all HTML`（平台自动从 spec.md 读取） |
| 生成单个流程页 | `build-prototype build P1` |
| 手动指定平台 | 在 spec.md 的 `使用端子类` 中设置；或对话中告知 PM 读取后按平台生成 |
| 修改已有原型 | `build-prototype edit [页面] [修改描述]`（默认攒批：本轮不 spawn 评审，攒到存档前/结构性大改时统一评审） |
| 每轮都评审（旧行为） | `build-prototype edit [页面] [修改描述] --strict` |
| 看还有哪些页没评审 | 读 `prototype/.last-check.json` 的 `review.pendingPages` / `pendingRounds`（说「进度」会一并播报） |
| 手动触发批量评审 | 说「审查原型」（走 review-ux），或直接说「保存原型」由存档前置门自动先评审 |
| 批量执行 feedback | `build-prototype edit`（配合 feedback.md） |
| 撤销上一次修改 | PM 说"撤销"或"回退"（需在 edit 后的同一 session 中） |
| 加一个新页面 | `build-prototype edit 加一个页面`（必做两步：先更新 page-inventory.md 展示确认，再生成页面） |
| 生成/更新标注 | `annotate-prototype build/refresh`（第八步A 自动生成；PRD 保存后自动刷新） |
| 加演示入口 | `build-prototype edit 加演示入口`（按第八步B 执行；标注层存在时数据从标注 state 项派生，可指定页，默认全部 `pages/*.html`） |
| 去掉演示入口 | `build-prototype edit 去掉演示入口`（幂等移除 head 3 行引用 + 删除 `demo/` 数据文件与 working/ 根 demo 资产） |
