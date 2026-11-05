---
name: check-quality
description: 当 build-prototype 完成构建或修改后，自动检查原型页面质量。检查交互可操作性、状态覆盖完整性、配色一致性、排版清晰度、UX 规则遵循情况及反 AI 痕迹静态项（含标注页面追加标注层检查、演示页面追加状态演示层检查）。不独立触发，不产出独立报告文件。
type: skill
tags:
  - 原型质检
  - 质量检查
  - quality
  - check
  - review
  - prototype
allowed-tools: [Read, Write, Edit, Glob, Bash]
dependencies:
  - Node.js（LTS，scripts/check-quality.js 运行所需；缺失时脚本不可用兜底返回空结果，不阻塞 build-prototype）
argument-hint: '[内部调用，无用户参数：--pages=<页面路径[,路径…]> [--design-system=<路径>] [--page-inventory=<路径>] [--mode=full|quick] [--auto-fix] [--dry-run]]'
prompt: ''
---

# 质量检查 (check-quality)

## 执行模型

本技能为"脚本 + LLM 报告"模式，LLM 只负责：**运行脚本 → 解析 JSON → 按模板报告**，不自行实现或改写静态检查逻辑。

1. **脚本执行静态检查** — 34 项静态检查由 `scripts/check-quality.js` 完成（零依赖，var() 展开 + :root 色板比对；维度 6 反 AI 痕迹 11 项，判定标准见 `pmcraft-proto/_shared/reference/anti-ai-flavor.md`）；页面含标注注入标签时追加维度 7 标注层 4 项（assets/json/anchor/rules-covered，均 MEDIUM，仅含标注注入标签的页面启用）；页面含 demo 注入标签时追加维度 8 状态演示层 5 项（assets/order/json/anchor/coverage，均 MEDIUM，仅含 demo 注入标签的页面启用）
2. **保留 AI 的检查** — 视觉/文案类 AI 味模式（居中大标题首屏、手机端堆叠、冗余说明、命名漂移等，完整清单见 `pmcraft-proto/_shared/reference/anti-ai-flavor.md`）保留 AI（独立设计评审，第二道门），不在脚本职责内，LLM 静态阶段不重复执行
3. **LLM 不修改检查逻辑** — 检查逻辑的变更属于技能开发范畴；本技能只按契约消费脚本输出，不改写 `check-quality.js` / `apply-fixes.js` 行为
4. **模型选择** — 主体为"脚本产出 + 模板化报告"，无视觉/多模态依赖，调用方可按降本需要选用快速模型；但第 5 步剩余不可自动修复项的 AI 修复需具备页面代码修改能力，不适用于能力受限的模型

## 触发条件

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/check-quality/`），脚本路径一律由此锚定解析，不依赖 cwd。

由 build-prototype 在 `build` 和 `edit` 模式完成后自动内部调用（通过 CLAUDE.md 编排层路由），或 extend-html Phase 4 调用。不独立触发。
调用方式：CLAUDE.md 编排层在 build-prototype 完成页面生成/修改后，运行 `scripts/check-quality.js` 脚本完成检查。

## 输入

| 参数 | 类型 | 必选 | 说明 |
| :--- | :--- | :--- | :--- |
| `--pages` | string[] | 是 | 最近生成或修改的页面文件路径列表（逗号分隔，由 build-prototype 传入）。**增量语义**：传入即"变化页子集"（edit 模式只传实际修改页），跨会话变化集合由调用方按基线 `prototype/.last-check.json` 比对（基线缺失/损坏时调用方回退全量传入）；维度 1-6 只检查传入子集，维度 7「规则覆盖完整」的 specRef 并集仍从全部 `annotations/*.js` 数据文件聚合 |
| `--design-system` | string | 否 | design-system.css 的绝对路径，用于配色偏离色比对（脚本从 :root 块提取 CSS 变量值作为色板） |
| `--page-inventory` | string | 否 | page-inventory.md 的绝对路径，用于验证页面间跳转链路 |
| `--mode` | string | 否 | 可选值 `quick` / `full`。默认 `full`。`quick` 跳过对比度和溢出检测 |
| `--auto-fix` | 开关 | 否 | 自动修复可修复的问题（配色偏离/缺 label 为 HIGH，无 focus-visible 为 MEDIUM）。**调用方约定**：build-prototype build/edit **默认启用**（第九步）；**extend-html 明确禁用**（存量不动纪律，见其质检契约）；reviewer agent 自跑取技术分时**不带**（只读评审，零写盘） |
| `--dry-run` | 开关 | 否 | 仅模拟，不执行修复。**与 `--auto-fix` 同时传入时 `--dry-run` 优先**：不写盘、不刷新基线，`fixes` 不产出 `applied` 条目、`fixes_applied` 恒为 0 |

## 工作流程

### 第一步：运行检查脚本

运行：
```bash
node "{本技能源码目录}/scripts/check-quality.js" \
  --pages="<页面1>,<页面2>" \
  [--design-system="<design-system.css 路径>"] \
  [--page-inventory="<page-inventory.md 路径>"] \
  [--mode=full|quick] [--auto-fix] [--dry-run]
```

> **参数安全（Bash 注入防护）**：`--pages` 页面路径通常由 build-prototype 内部构造，但页面名源自 page-inventory.md（PM 可编辑）；`--design-system` / `--page-inventory` 同理取自 PM 项目目录。构造 Bash 命令前必须剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 确认实际路径）；路径值一律用双引号包裹后传入。含非法字符时以剔除后的路径提交并在结果展示中注明，不中断流程。

脚本自动完成：
1. **过滤无效路径**（不存在 → pages_skipped；空 → pages_empty；无法读取 → pages_error）
2. **逐页检查** 34 项静态分析（6 维度，见"检查清单"）——含配色偏离（var() 展开 + :root 色板比对）、WCAG 对比度、表单 label、touch 目标、Anti-Slop 静态项（维度 6 共 11 项）；页面含标注注入标签时追加维度 7 标注层检查 4 项（assets/json/anchor/rules-covered，均 MEDIUM）；页面含 demo 注入标签时追加维度 8 状态演示层检查 5 项（assets/order/json/anchor/coverage，均 MEDIUM）
3. **B 模式 API 探活**（读 mock/db.json + server.js 端口 → 逐 entity HTTP 检查）
4. **汇总统计**（`results` 内：high_fixable / high_unfixable / medium_low_count / b_mode_api_status；顶层：pages_checked / pages_skipped / pages_empty / pages_timeout / pages_error）
5. **自动修复并真实写盘**（**仅当** `--auto-fix` 且**非** `--dry-run` 时执行：配色偏离→替换为色板最近色、缺 label→补合法 `<label>`、无 focus-visible→追加样式规则；由脚本 `scripts/lib/apply-fixes.js` 直接改写页面文件 + `writeUtf8` 落盘；**写后复检**——该页有 `applied` 条目即对写盘后文件重跑全量静态检查，`per_page` 与 `high_fixable`/`high_unfixable`/`medium_low_count` 统计**一律取自复检后结果**）
6. **修复状态输出**（每条 fix 带 `status: applied|failed|skipped_noop`；`fixes_applied` / `fixes_failed` 汇总）

> 对比度不足**不自动修复**：var() 架构下根因在 design-system.css 的 token 配对，页面内字符串替换不成立——走模板 B 报告，建议在 design-system 层调整。

解析输出 JSON（`data` 字段），按以下优先级**逐条判定，模板 A/B/C 可叠加组合输出**（顺序 A → B → C；见正误示例 3）：

1. **优先判定（最高优先级）**：如果无任何页面进入实际检查——`pages_empty` / `pages_skipped` / `pages_error` 任一覆盖全部，或三者合计覆盖全部文件 → 直接输出模板 E，忽略其余判定，结束。
2. **否则**，继续叠加判定：
   - 如果 `fixes_applied > 0` → 按模板 A 报告修复详情（用 `fixes` 数组中 `status: applied` 的条目）
   - 如果 `fixes_failed > 0` 或 `results.high_fixable > 0` → 按模板 B 报告剩余 HIGH 问题（含 failed 原因，需 PM 确认）
   - 如果 `medium_low_count > 0` → 按模板 C 报告建议（最多前 10 条；可与 A/B 叠加）。**「规则覆盖完整」建议输出前先核对页面落点**：对照 `page-inventory.md` 判断缺失的 `R{n}` 是否有页面落点（该规则在各页「元素/状态」中均无承载即视为无落点）——无落点规则从缺失列表中剔除，剔除后剩余为空则该建议不输出（见边界 8）
   - 如果以上条件均不成立（无任何问题）→ 安静完成（模板 D）
3. **脚本不可用兜底**：如果 node 不可用、脚本执行失败（非 0 退出且未输出可解析 JSON），**或**脚本输出 `status: "error"`（参数错误等，退出 1 但 JSON 可解析）→ 返回空结果，不阻塞 build-prototype 流程（见禁止行为 6），静默结束。

### 第二步：按模板输出

1. **选择模板**：从"输出模板"章节选择第一步判定命中的模板 A/B/C/D/E（可叠加时按 A → B → C 顺序组合输出）
2. **填充占位符**：按模板骨架将脚本返回的 JSON 映射到 `{占位符}`——`per_page` 提供每页每项检查的 `id`/`severity`/`passed`/`description`/`element`/`line`，`fixes` 提供修复详情
3. **输出到对话**：结果在对话中展示，不写入独立文件（见禁止行为 2）

> **保留 AI**：视觉/文案判断类 AI 味模式（居中大标题首屏、手机端堆叠、冗余说明、命名漂移等，完整 16 模式清单见 `pmcraft-proto/_shared/reference/anti-ai-flavor.md`）不在脚本检查输出中（脚本仅输出可静态检测的 medium/LOW 检出项），由独立设计评审（第二道门）检查——脚本头部注释已注明。LLM 无需重复静态检查。

## 检查清单

### 1. 交互可操作性

| 检查项 | 检查方法 | 严重度 | 备注 |
|--------|---------|--------|------|
| 所有按钮可点击 | 解析 HTML，检查每个 `<button>` / `<a>` 元素是否包含点击事件或有效 `href` | HIGH | 静态分析，不模拟点击 |
| 跳转路径可走通 | 检查页面间超链接路径与 build-prototype 提供的 page-inventory 索引一致 | HIGH | 需 build-prototype 配合提供 page-inventory |
| hover 有反馈 | 检查 CSS 中交互元素是否定义了 `:hover` 伪类样式 | MEDIUM | 仅检查 CSS 是否存在，不验证视觉效果 |
| 弹窗可关闭 | 检查模态框/弹窗元素是否包含关闭按钮或遮罩层点击关闭机制 | MEDIUM | — |
| focus 态可见 | 检查所有可交互元素是否定义了 `:focus-visible` 样式（键盘导航基础） | MEDIUM | — |

### 2. 状态覆盖完整性

| 检查项 | 检查方法 | 严重度 | 备注 |
|--------|---------|--------|------|
| 加载态 | 列表页/详情页是否包含骨架屏（skeleton）或加载指示器（spinner/progress）元素 | MEDIUM | — |
| 加载作用域（A1） | loading 是否只锁操作对象（行内 spinner、按钮 loading 态），而非全页遮罩；刷新/翻页是否保留旧数据 + 局部 refreshing | LOW | 静态检测 `state_loading_scope`；单项请求全页遮罩、刷新整页骨架替换均为违规 |
| 空数据态 | 列表页是否包含空数据提示元素（empty state / "暂无数据"） | MEDIUM | — |
| 空态区分（A2） | 集合为空与筛选无结果是两种状态：含筛选控件的页面是否提供"无结果"文案与清空筛选恢复动作 | MEDIUM | 静态检测 `state_filtered_empty`；"还没有订单，去创建一单" vs "没有符合条件的订单，清空筛选看看" |
| 骨架结构（A7） | 骨架屏是否与最终布局同构（保留表头/工具栏、高度由占位内容决定），而非全屏 spinner | LOW | 全屏 spinner 由 `state_loading_scope` 静态检出；同构性（保留表头/工具栏）为视觉判断，reviewer 复核 |
| 错误态 | 表单提交/数据加载失败场景是否有错误提示区域 | MEDIUM | — |
| 边界态 | 极限情况（如列表为空、输入超长、网络错误）是否有处理 | LOW | — |

### 3. 配色一致性

| 检查项 | 检查方法 | 严重度 | 备注 |
|--------|---------|--------|------|
| 无偏离色 | 提取所有 `color` / `background-color` / `border-color` 值，与 design-system.css 的 :root 块声明的色板交叉比对 | HIGH | 需 build-prototype 提供 design-system.css 路径；`quick` 模式下跳过 |
| 对比度足够 | 对文字颜色与背景色计算 WCAG 2.1 对比度，阈值 >= 4.5:1 | HIGH | 需解析 CSS 完整计算；`quick` 模式下跳过 |
| 语义色正确 | 错误提示使用 danger 色，成功提示使用 success 色 | MEDIUM | — |
| 无纯黑纯白 | 背景未使用 `#000` 或 `#000000`，文字未使用 `#fff` 或 `#FFFFFF`（应使用带色相倾向的深浅色变体） | MEDIUM | — |

### 4. 排版清晰度

| 检查项 | 检查方法 | 严重度 | 备注 |
|--------|---------|--------|------|
| 无文本溢出 | 检查容器是否设置了 `overflow: hidden` 且未设置 `text-overflow: ellipsis` 的文本可能被截断 | MEDIUM | `quick` 模式下跳过 |
| 无横向溢出 | 检查 `overflow-y: auto/scroll` 容器是否显式裁剪 `overflow-x: hidden`，且页面存在负偏移装饰元素（right/left/margin-right 负值、translateX 负值）——装饰伸出未裁剪会产生横向滚动条（手机壳原型常见：氛围装饰圆 `right: -90px`） | MEDIUM | 显式 `overflow-x: hidden` 或移除负偏移装饰；`quick` 模式下跳过 |
| 层级清晰 | `h1`/`h2`/`h3`/`body` 的 font-size 和 font-weight 层级是否明显区分 | MEDIUM | — |
| 无重叠 | 检查元素定位是否存在不合理重叠（position absolute/fixed 元素坐标重叠且非弹窗/浮层场景） | HIGH | — |

### 5. UX 规则

| 检查项 | 检查方法 | 严重度 | 备注 |
|--------|---------|--------|------|
| 无 emoji 图标 | 检查是否将 emoji 字符（Unicode Emoji 范围）用作功能图标而非装饰 | MEDIUM | 纯装饰性 emoji 不视为问题 |
| 图标尺寸过大 | 检测 `icon-xl`（32px）/`icon-2xl`（64px）类用于非明确大尺寸场景（登录页品牌图形、仪表盘主 KPI 卡等），或页面图标尺寸层级混乱 | MEDIUM | 常规图标用 sm/md/lg；xl/2xl 仅限明确场景 |
| 表单有 label | 每个 `<input>` / `<select>` / `<textarea>` 是否有关联的 `<label>` 或 `aria-label` | HIGH | — |
| touch 目标足够大 | 按钮/输入框 `height` 或 `min-height` >= 36px | MEDIUM | 推荐 44px |
| 无 console 报错/throw | 检查 `<script>` 块中是否存在 `console.error(` 调用或 `throw\s+` 语句（静态分析） | MEDIUM | 无法检测运行时 JS 错误；生产环境需配合浏览器测试 |

### 6. 反 AI 痕迹

以下 11 项可通过静态分析检测（判定标准与「何时不算」边界见 `pmcraft-proto/_shared/reference/anti-ai-flavor.md`）。其余模式（居中大标题首屏、手机端堆叠、冗余说明、命名漂移等视觉/文案判断项）无法静态检测——在报告中注明"已交由独立设计评审（第二道门）检查"。

| 检查项 | 检查方法 | 严重度 | 替代方案 |
|--------|---------|--------|---------|
| 一屏超过 2 个 primary 按钮 | 统计 `.btn-primary` 或 class 含 `primary` 的按钮元素出现次数（阈值 > 2） | MEDIUM | 保留 1 个主操作，其余降级为 secondary 或 ghost |
| 卡片嵌套卡片 | 检测 `.card` 内部直接嵌套 `.card`（不限深度） | MEDIUM | 用分隔线或背景色区分层级，不用双层卡片 |
| 色彩无语义使用 | 红色/绿色用于非状态元素（如绿色"保存"按钮时不匹配 danger/success 语义） | MEDIUM | danger 仅用于错误/删除操作；success 仅用于成功/确认态 |
| 纯黑文字/纯白背景 | `color: #fff`/`#ffffff` 或 `background: #000`/`#000000`（已包含于维度 3.4，此处集中报告，严重度以维度 3.4 为准） | MEDIUM | 文字色用 `var(--color-text)`，背景色用 `var(--color-background)` |
| badge 过度使用 | 检测 class 含 `badge` 的元素数量（阈值 ≥ 4） | LOW | badge 仅用于真实例外状态，不作为装饰元素 |
| emoji 做功能图标 | CSS 伪元素或文本节点含 Emoji 范围字符（已包含于维度 5.1，此处集中报告） | MEDIUM | 使用本地 SVG 图标（按 DESIGN.md `icon_library` 选库，经 aliases.json 查名，见 build-prototype 图标三级查找链）；纯装饰性 emoji 除外 |
| 纯图标按钮 | `<button>` 无文本节点（仅含 svg/i/img 等图形）且无 `aria-label`/`title` | MEDIUM | 主要操作直接显示文字；其他图标按钮补 `aria-label` 或 `title`；删除等危险操作单独确认 |
| 黑挤标题 | h1/h2 元素 font-size ≥ 40px 且 font-weight ≥ 700 且 line-height ≤ 1.2（组合命中），且标题文本 ≥ 8 字符 | MEDIUM | 标题字号/字重/行高取 design-system.css 变量；换行后先保证可读再谈视觉冲击 |
| 分割线过度使用 | `<hr>` 元素计数 ≥ 5 | LOW | 先用标题层级和间距分组，仅相邻内容易混淆时保留低对比度分割线 |
| 动画过度使用 | 入场/悬浮/脉冲类 `@keyframes`（fade/up/slide/float/zoom/pulse/bounce/pop）计数 ≥ 4，或 `animation` 声明数 ≥ 4 | LOW | 动效仅用于说明页面切换/对象来源/操作结果，并支持 prefers-reduced-motion |
| 假身份字段（A4） | 行身份展示 UUID / 原始 ID（`ID: 1024`）/ 千篇一律的类型标签；静态检测 UUID 格式与 `ID: <数字>` 展示（人类可读编号如"工单 #WX-240828-01"不触发） | MEDIUM | 行身份 = 视觉身份 + 主名称 + 区分字段（如"张伟 · 财务部"）；原型假数据同样禁止 UUID 当身份 |

### 7. 标注层（annotate-prototype 产物）

**仅当页面含标注注入标签时启用**（含 `../annotations.css` 与 `../annotations-runtime.js` 引用）——存量无标注页面静默跳过，向后兼容。标注 DOM 全部运行时注入，不参与维度 1-6 的静态解析（零误报）。

| 检查项 | 检查方法 | 严重度 | 替代方案 |
|--------|---------|--------|---------|
| 标注资产齐全 | 页面含 3 个引用且 `annotations.css` / `annotations-runtime.js` / `annotations/{page}.js` 文件存在 | MEDIUM | 重新执行 annotate-prototype build/refresh |
| 标注数据 JSON 有效 | 正则提取 `window.PM_ANNOTATIONS_DATA = ({...});` 并 `JSON.parse` | MEDIUM | 数据文件须为严格 JSON（无注释/尾逗号），重新生成 |
| 标注锚点可解析 | 逐 item + **逐 flow 步骤**（v2 steps 对象含 anchor 时）：`#id` → 页面 attrs.id 命中；`.class` → attrs.class 命中；`page` 恒过（步骤 anchor 为 `page`/空/字符串步骤跳过） | MEDIUM | 锚点失效时重新执行 annotate-prototype refresh——**第五步附加迁移三级链**：L1 同功能元素迁移（anchorNote 注明"原锚点已移除，迁移至功能相同元素"）→ L2 最接近元素 → L3 item 级锚 page / 步骤级省略 anchor（锚错比不锚更误导） |
| 规则覆盖完整 | 跨页聚合：spec.md 全部 `R{n}` vs 全部页面标注 specRef 并集——**聚合来源为全部 `annotations/*.js` 数据文件（每页几十行，不读页面 HTML）**，增量模式下传入子集仅影响维度 1-6 逐页检查，规则覆盖检查保持全局；报告前由 LLM 对照 page-inventory 判断缺失规则是否有页面落点，无落点规则不计入缺失（边界 8） | MEDIUM | 缺失规则需在对应页面补充标注（R 规则无页面落点时除外） |

### 8. 状态演示层（状态演示入口产物）

**仅当页面含 demo 注入标签时启用**（含 `../demo-panel.css` 与 `../demo-panel-runtime.js` 引用）——存量无 demo 引用页面静默跳过，向后兼容。演示 DOM 全部运行时注入，不参与维度 1-6 的静态解析（零误报）。仅 `pages/*.html` 生成，index.html 不检查。

| 检查项 | 检查方法 | 严重度 | 替代方案 |
|--------|---------|--------|---------|
| 演示资产齐全 | 页面含 3 个引用（css + `demo/{page}.js` + runtime）且 `demo-panel.css` / `demo-panel-runtime.js` / `demo/{page}.js` 文件存在 | MEDIUM | 重新执行演示入口生成（build-prototype 第八步B / extend-html Phase 5；资产从 `_shared/demo/` 复制） |
| 注入顺序 | `demo/{page}.js` 引用须位于 `demo-panel-runtime.js` 引用之前（运行时读 `window.PM_DEMO_DATA`） | MEDIUM | 调整 head 注入行序（数据文件在前，runtime 在后） |
| 演示数据 JSON 有效 | 正则提取 `window.PM_DEMO_DATA = ({...});` 并 `JSON.parse`（**独立校验，不依赖维度 7 启用条件**——demo 引用存在但标注缺失时维度 7 可能跳过，维度 8 仍须校验数据文件） | MEDIUM | 数据文件须为严格 JSON（无注释/尾逗号），重新派生 |
| 演示锚点可解析 | 逐 item：`#id` → 页面 attrs.id 命中；`.class` → attrs.class 命中；`page` 恒过（state 锚点须元素级——页面级状态仅展示文案） | MEDIUM | 锚点失效时重新派生演示数据（从标注 state 项 / page-inventory 状态字段） |
| 数据一致性 | 有标注层时：demo items 的 label 集 vs 该页标注 state 项 label 集——标注有而演示缺 → 提示待同步；无标注层（extend-html 跳过标注场景）由生成步骤从 page-inventory 保证，脚本不比对 | MEDIUM | 重新执行 annotate-prototype refresh（第十步A 自动重派生 demo 数据） |

## 自动修复规则

以下问题支持自动修复（无需询问 PM；无 focus-visible 为 MEDIUM 级，其余为 HIGH 级）：

| 问题类型 | 修复方法 |
|---------|---------|
| 配色偏离色板 | 将偏离色替换为 design-system.css 色板中最接近的语义色（`kind=replace`，保留 `#` 前缀） |
| 表单缺 label | 根据 input 的 `placeholder`（去引导词）或 id 推导文案，自动插入合法 `<label for="...">`（`kind=insert-before`）；input 已被 label 包裹（implicit label，含任意深度祖先）时识别为已有关联，不生成修复（apply-fixes 包裹守卫兜底 skipped_noop）；checkbox/radio 无 placeholder 时跳过自动修复（id→英文文案推导必然残留，走模板 B 由 PM 人工补中文 label） |
| 无 focus-visible | 追加 `*:focus-visible { outline: 2px solid ... }` 样式规则（`kind=append-style`，幂等守卫：已含则 skipped_noop） |

> 上述修复全部由脚本 `scripts/lib/apply-fixes.js` 真实写盘并复检；**LLM 不得重复落盘**（见禁止行为 7）。

> **增量基线刷新**：`--auto-fix`（非 `--dry-run`）且 `fixes_applied > 0` 时，脚本自动刷新 `prototype/.last-check.json` 中被修复页面的条目（重新 `statSync` 落盘后的 mtime+size），随后 refresh 不再把这些页视为变化页；基线不存在/损坏 → 静默跳过**不创建**（避免掩盖未知变化），输出 JSON 的 `baseline_updated.pages` 为 0。

> **回写纪律**：刷新只改 `pages` 里被修复页的条目，**必须原样保留基线中的其他顶层字段**（例如 build-prototype 写在同一文件里的 `review` 评审攒批块）——整块重写会抹掉别人的痕迹（build-prototype 禁止行为 19 同款约束）。

以下 HIGH 问题**不**支持自动修复（需 PM 确认）：
- 跳转路径断裂：无法确定正确的跳转目标
- 元素重叠：无法判断正确的布局顺序
- 对比度不足：根因在 design-system.css 的 token 配对（var() 架构），页面内字符串替换不成立——报告建议调整 `--color-text` 与 `--color-background` 取值至满足 4.5:1

维度 7 标注层 4 项（assets/json/anchor/rules-covered）与维度 8 状态演示层 5 项（assets/order/json/anchor/coverage）均为 MEDIUM，不属于自动修复范围——按模板 C 报告建议，提示按对应维度检查表"替代方案"列处理（维度 7：重新执行 annotate-prototype build/refresh 等；维度 8：重新执行演示入口生成 / annotate refresh 重派生）。

## 输出模板

本技能不产出独立文件，所有输出在对话中展示。

### 模板 A：存在可自动修复的问题

```text
检测到 {high_count} 个问题，已自动修复：

{fix_details}
```

- `{high_count}`：实际写入成功的修复数量（`fixes_applied`，整数；含 MEDIUM 级 focus-visible 修复）
- `{fix_details}`：逐条列出自动修复的问题详情（`fixes` 数组中 `status: applied` 的条目），格式为 `- [{页面文件名}] {检查项}: {修复内容}（预期 {替代方案}）`，每行一条。替代方案从对应维度检查表的"替代方案"列获取（维度 1-5 检查表无该列，按检查项语义与备注列给出具体预期行为）。
- 修复由脚本真实写盘并复检，不向 PM 二次确认

### 模板 B：存在无法自动修复的 HIGH 问题

```text
发现 {unfixable_count} 个无法自动修复的 HIGH 问题，请确认：
{issue_list}
```

- `{unfixable_count}`：剩余 HIGH 问题数量（含 `status: failed` 的修复失败项，整数）
- `{issue_list}`：逐条列出剩余 HIGH 问题及原因，格式为 `- [{页面文件名}] {检查项}: {原因}`，每行一条

### 模板 C：仅存在 MEDIUM/LOW 问题

```text
检测到 {suggestion_count} 个细节建议：
{suggestion_list}
{overflow_hint}
```

- `{suggestion_count}`：MEDIUM/LOW 问题总数（整数）
- `{suggestion_list}`：问题摘要列表，格式为 `- [{页面文件名}] {检查项}。预期 {替代方案}（{严重度}）`，最多列出前 10 条。替代方案从对应维度检查表的"替代方案"列获取（维度 1-5 检查表无该列，按检查项语义与备注列给出具体预期行为）。
- `{overflow_hint}`：当 `suggestion_count` > 10 时输出"还有 {剩余数量} 项，需要全部列出吗？"，否则输出空字符串

### 模板 D：全部通过

（无输出，安静完成）

### 模板 E：特殊情况

```text
{special_message}
```

- 所有文件为空时：`special_message` = `"页面内容为空，无法检查"`
- 其余无法处理情形（路径无效 / 无法读取，含与空文件混合覆盖全部）时：`special_message` = `"无法读取页面内容，请确认文件可访问"`

## 禁止行为

1. **禁止独立触发** — 不能被 PM 直接调用。收到直接调用请求时回复："check-quality 由 CLAUDE.md 编排层路由调用，无需手动触发。"
2. **禁止产出独立报告文件** — 检查结果在对话中展示，不写入新文件；自动修复直接修改被检查的页面文件，不额外创建文件
3. **禁止修改用户意图** — 只检查技术质量问题，不评判设计选择（如"这个颜色不好看"）
4. **禁止跳过"替代方案"报告** — MEDIUM/LOW 问题必须按"禁止 XXX，预期用 YYY"格式给出具体预期行为，替代方案从对应维度检查表的"替代方案"列获取（维度 1-5 检查表无该列，按检查项语义与备注列给出具体预期行为）
5. **禁止自行过滤信号** — 检出问题后不得以"框架约束不可修改"为由跳过报告，过滤是 PM 的职责
6. **禁止阻塞 build-prototype 流程** — 脚本为同步执行、内部无逐页超时机制，整体超时由调用方 build-prototype 以 30 秒兜底降级（视为通过）；致命错误返回空结果而非崩溃，逐页异常全部捕获并计入统计
7. **禁止 LLM 重复落盘修复** — 自动修复由脚本 `scripts/lib/apply-fixes.js` 一次性完成并真实写盘（`fixes` 中 `status=applied` 即已落盘）；LLM 不得再按 fixes 内容手工编辑页面，除非条目标记 `failed`

## 约束

1. **不独立触发** — 同「禁止行为 1」：不能被 PM 直接调用，收到直接调用请求时回复固定话术。
2. **不产出独立报告文件** — 同「禁止行为 2」：检查结果在对话中展示，自动修复直接修改被检查的页面文件，不额外创建文件。
3. **问题自动修复** — **仅在调用方带 `--auto-fix` 且非 `--dry-run` 时**，配色偏离、标签缺失、无 focus-visible（MEDIUM 级）等可自动修复的问题由脚本直接修并写盘，不询问 PM；对比度不足属设计系统级问题不自动修，按模板 B 报告。按"自动修复规则"章节执行。
4. **MEDIUM/LOW 问题使用"禁止 XXX，预期用 YYY"格式报告** — 同「禁止行为 4/5」：MEDIUM/LOW 问题列出但不阻塞，由 PM 决定是否处理；不得以"框架约束不可修改"为由跳过报告——checker 的职责是报出所有信号，过滤是 PM 的职责。
5. **不修改用户意图** — 同「禁止行为 3」：只检查技术质量问题，不评判设计选择。
6. **文件不存在时跳过不报错** — 单个文件找不到不影响其他文件的检查。
7. **不阻塞 build-prototype 流程** — 同「禁止行为 6」：致命错误返回空结果而非崩溃，逐页异常捕获并计入统计；整体超时由调用方 build-prototype 以 30 秒兜底，脚本内部不做超时。
8. **基线回写保留未知字段** — `--auto-fix` 刷新 `.last-check.json` 时只改 `pages` 中被修复页的条目，其余顶层字段（含 build-prototype 的 `review` 块）原样保留，禁止整块重写。

## 正误示例

### 正确示例

**示例 1**：build-prototype 批量生成页面后由编排层触发检查，全部通过。
```
build-prototype build all HTML → CLAUDE.md 编排层自动触发 check-quality
```
预期：检查所有页面，无任何问题 → 安静完成，无输出。

**示例 2**：build-prototype 编辑页面后由编排层触发检查，发现配色偏离 HIGH 问题。
```
build-prototype edit P1 加按钮 → CLAUDE.md 编排层自动触发 check-quality
```
预期：检查页面，发现 1 个配色偏离 HIGH 问题 → 自动修复 → 报告"检测到 1 个问题，已自动修复：- [P1] 配色一致性: 将 #FF6600 替换为色板 primary 色 #1976D2"。

**示例 3**：混合严重度检查，自动修复 + 建议列表。
```
build-prototype build 2 pages → CLAUDE.md 编排层自动触发 check-quality
```
预期：修复 1 处 HIGH 问题 + 列出 3 条 MEDIUM 建议 → 报告两部分内容。

**示例 4**：含标注注入标签的页面触发检查，标注层锚点失效。
```
build-prototype edit 标注页面 → CLAUDE.md 编排层自动触发 check-quality
```
预期：维度 1-6 检查通过；维度 7 报告 1 条 MEDIUM 建议"标注锚点可解析"（提示重新执行 annotate-prototype refresh）→ 按模板 C 输出。

**示例 5**：含 demo 注入标签的页面触发检查，演示层注入顺序错误。
```
build-prototype edit 演示页面 → CLAUDE.md 编排层自动触发 check-quality
```
预期：维度 1-6 检查通过；维度 8 报告 1 条 MEDIUM 建议"注入顺序"（`demo/{page}.js` 引用位于 `demo-panel-runtime.js` 之后）→ 按模板 C 输出，提示调整 head 注入行序。

### 错误示例

**错误 1**：PM 直接调用 check-quality。
```
PM: "运行质量检查"
```
问题：本技能不独立触发，只能通过 CLAUDE.md 编排层路由调用。正确做法：通过 `build-prototype build` 或 `build-prototype edit` 由编排层自动触发。

**错误 2**：检查时评判设计选择而非技术问题。
```
"这个配色不好看，建议换一个"
```
问题：越界评判设计选择。正确做法：只检查技术问题（状态缺失、颜色偏离色板、交互不可用、对比度不足）。

**错误 3**：自动修复后不提供修复详情。
```
"检测到 2 个问题，已自动修复。"
```
问题：修复内容不透明，PM 无法知道改了哪里。正确做法：按模板 A 逐条列出修复详情。

**错误 4**：对存量无标注页面也报告维度 7 标注层问题。
```
"检测到 3 个细节建议：[P2] 标注资产齐全。预期 重新执行 annotate-prototype..."
```
问题：维度 7 仅对含标注注入标签的页面启用，存量页面应静默跳过。正确做法：先判断页面是否含 `../annotations.css` 与 `../annotations-runtime.js` 引用，无引用则跳过维度 7，只执行维度 1-6。

**错误 5**：对存量无 demo 引用页面也报告维度 8 演示层问题。
```
"检测到 2 个细节建议：[P3] 演示资产齐全。预期 重新执行演示入口生成..."
```
问题：维度 8 仅对含 demo 注入标签的页面启用，存量无 demo 引用页面应静默跳过（同错误 4 的维度 7 逻辑）。正确做法：先判断页面是否含 `../demo-panel.css` 与 `../demo-panel-runtime.js` 引用，无引用则跳过维度 8，只执行维度 1-6。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 | 输出路由 |
| :--- | :--- | :--- | :--- |
| 检查目标文件不存在 | build-prototype 传入的路径无效 | 跳过，计入 `pages_skipped` | "（静默跳过）" |
| 文件存在但内容为空 | 文件可读但内容长度为 0 | 跳过，计入 `pages_empty` | "（静默跳过）" |
| 文件无法读取 | 权限不足 / 编码不兼容 / 二进制非 HTML | 跳过，计入 `pages_error`（脚本异常捕获路径） | "（静默跳过）" |
| 所有文件都被跳过 | 路径无效 / 无法读取 / 为空 覆盖全部文件，无任何页面进入实际检查 | 按模板 E（消息按模板 E 章节规则） | "页面内容为空，无法检查"（全部为空）/ "无法读取页面内容，请确认文件可访问"（其余） |
| 所有文件通过检查 | 无任何 HIGH/MEDIUM/LOW 问题 | 安静完成（模板 D） | "（无输出）" |
| HIGH 问题无法自动修复 | 如页面跳转断裂 | 按模板 B 报告 | "发现 {N} 个无法自动修复的 HIGH 问题，请确认：{列表}" |
| MEDIUM 问题超过 10 项 | 细节建议太多 | 只展示前 10 条 + 提示 | "检测到 {N} 个细节建议：[10条]。还有 {M} 项，需要全部列出吗？" |
| 所有页面文件均为空 | 文件存在但内容为空 | 按模板 E | "页面内容为空，无法检查" |
| 脚本整体超时（>30s） | 页面过多或文件异常导致脚本长时间未返回 | 由调用方 build-prototype 兜底视为通过，提示"质量检查超时，建议手动复查关键页面"；脚本本身同步执行无内部超时 | "（由 build-prototype 兜底）" |
| Node.js 不可用 / 脚本执行失败 | 环境无 `node`，或脚本非 0 退出且未输出可解析 JSON，或输出 `status: "error"`（参数错误等，退出 1 但 JSON 可解析） | 返回空结果、静默结束，不阻塞 build-prototype（同禁止行为 6，不报错不外抛） | "（静默结束，不阻塞）" |
| 检查项抛出意外异常 | HTML 畸形、CSS 解析失败 | 静默跳过该页，计入 `pages_error`（不产出检查项） | "（静默跳过）" |
| 输入列表为空或无效 | build-prototype 传入空数组或非数组 | 直接返回 control | "（无输出，返回 control）" |
| quick 模式 | build-prototype 传入 `mode: quick` | 跳过对比度和溢出检测 | "（静默切换模式）" |
| 标注页面资产缺失 | 页面含标注注入标签但 `annotations.css` / `annotations-runtime.js` / `annotations/{page}.js` 任一不存在 | 报告 MEDIUM 建议 | 模板 C，提示重新执行 annotate-prototype build/refresh |
| 标注数据 JSON 无效 | 页面含标注注入标签但 `window.PM_ANNOTATIONS_DATA = ({...})` 无法 `JSON.parse`（含注释/尾逗号） | 报告 MEDIUM 建议 | 模板 C，提示数据文件须为严格 JSON，重新生成 |
| 标注锚点失效 | 标注 item 的 `#id` / `.class` 在页面中无对应元素 | 报告 MEDIUM 建议 | 模板 C，提示重新执行 annotate-prototype refresh（item 级锚最接近元素，不编造；**步骤级锚点失效时省略 anchor 即可**，不做近似锚定） |
| 存量页面无标注标签 | 页面不含标注注入标签（`../annotations.css` / `../annotations-runtime.js` 引用） | 维度 7 静默跳过，仅执行维度 1-6 | "（静默跳过，向后兼容）" |
| 存量页面无 demo 引用 | 页面不含 demo 注入标签（`../demo-panel.css` / `../demo-panel-runtime.js` 引用） | 维度 8 静默跳过，仅执行维度 1-6 | "（静默跳过，向后兼容）" |
| 演示资产缺失 | 页面含 demo 注入标签但 `demo-panel.css` / `demo-panel-runtime.js` / `demo/{page}.js` 任一不存在或数据引用缺失 | 报告 MEDIUM 建议 | 模板 C，提示重新执行演示入口生成（build-prototype 第八步B / extend-html Phase 5） |
| 演示注入顺序错误 | `demo/{page}.js` 引用位于 `demo-panel-runtime.js` 之后（运行时读 `PM_DEMO_DATA` 依赖顺序） | 报告 MEDIUM 建议 | 模板 C，提示调整 head 注入行序 |
| 演示数据 JSON 无效 | 页面含 demo 注入标签但 `window.PM_DEMO_DATA = ({...})` 无法 `JSON.parse` | 报告 MEDIUM 建议 | 模板 C，提示数据文件须为严格 JSON，重新派生 |
| 演示锚点失效 | demo item 的 `#id` / `.class` 在页面中无对应元素（page 恒过） | 报告 MEDIUM 建议 | 模板 C，提示重新派生演示数据 |
| 演示数据与标注不一致 | 有标注层页面：标注 state 项 label 集 ⊋ demo items label 集（标注已更新） | 报告 MEDIUM 建议 | 模板 C，提示重新执行 annotate-prototype refresh（第十步A 自动重派生） |
| 页面路径含 shell 元字符（`'`、`"`、`$`、`;`、`&`、`|` 等） | `--pages` / `--design-system` / `--page-inventory` 路径拼入 Bash 命令前含非法字符 | 剔除元字符后以剔除版路径提交，不中断流程，并在结果展示中注明 | "（转述操作结果，并注明已剔除非法字符）" |
| 增量模式（变化页子集） | edit 模式 `--pages` 只传实际修改页（调用方按基线比对） | 维度 1-6 只检查传入子集；维度 7 规则覆盖仍从全部 `annotations/*.js` 聚合；基线缺失时调用方回退全量传入 | "（正常检查，pages_checked = 传入子集数）" |
| auto-fix 后基线不存在/损坏 | `--auto-fix` 修复落盘但 `prototype/.last-check.json` 缺失或 JSON 损坏 | 静默跳过不创建基线（避免掩盖未知变化），输出 `baseline_updated.pages = 0` | "（不阻塞，基线由 build-prototype 第十一步A 重建）" |
| 基线含未知顶层字段 | 基线里有本技能未定义的字段（如 build-prototype 的 `review` 评审攒批块） | **原样保留**——回写只改 `pages` 中被修复页的条目，不整块重写（整块重写会丢失评审队列痕迹） | "（不提示，静默保留）" |

## 评估测试用例

### 正向触发（11 条）

1. **全量生成后全部通过**：build-prototype 生成 3 个页面，所有检查项均符合 → 预期：安静完成，无输出
2. **发现可修复的 HIGH 问题**：build-prototype 编辑页面后，发现 2 处配色偏离色板 → 预期：自动修复配色，按模板 A 报告修复详情
3. **发现 MEDIUM 问题**：build-prototype 生成页面后，发现 1 处缺少加载态 → 预期：输出"检测到 1 个细节建议：{页面A}缺少加载态"
4. **混合严重度问题**：生成后检出 1 个 HIGH（配色偏离）+ 3 个 MEDIUM（状态缺失） → 预期：HIGH 自动修复并列出详情，MEDIUM 列出报告
5. **多页面文件检查**：传入 5 个页面路径 → 预期：逐页完成检查，汇总输出（或安静完成）
6. **自动修复后列出详情**：自动修复 2 处 HIGH 问题 → 预期：模板 A 输出含 `fix_details` 逐条列出修复内容
7. **标注层 4 项全部通过**：含标注注入标签的页面，assets/json/anchor/rules-covered 均通过 → 预期：维度 7 不产生 MEDIUM 建议，按其余判定正常结束
8. **标注规则覆盖完整**：spec.md 全部 `R{n}` 均有页面落点且已标注 → 预期：规则覆盖检查通过，无 MEDIUM 建议
9. **增量检查**：edit 只改 1 页，`--pages` 只传该页（基线存在） → 预期：维度 1-6 只检查该页（pages_checked=1），维度 7 规则覆盖仍从全部 `annotations/*.js` 聚合；自动修复作用于该页后基线条目自动刷新
10. **演示层 5 项全部通过**：含 demo 注入标签的页面，assets/order/json/anchor/coverage 均通过 → 预期：维度 8 不产生 MEDIUM 建议，按其余判定正常结束
11. **演示数据与标注一致**：有标注层且标注 state 项与 demo items 完全一致 → 预期：数据一致性检查通过，无 MEDIUM 建议

### 负向触发（20 条）

1. **PM 直接调用**：输入"运行质量检查" → 预期：回复"check-quality 由 CLAUDE.md 编排层路由调用，无需手动触发"
2. **路径无效**：传入路径中有 2 个文件不存在 → 预期：跳过这 2 个，检查其余有效文件
3. **HIGH 问题无法自动修复**：页面跳转断裂，无法确定正确跳转目标 → 预期：按模板 B 输出
4. **MEDIUM 问题超过 10 条**：共检出 13 条 MEDIUM 建议 → 预期：展示前 10 条，提示"还有 3 项，需要全部列出吗？"
5. **所有页面为空文件**：文件存在但内容为空 → 预期：按模板 E 输出"页面内容为空，无法检查"
6. **文件无法读取**：文件权限不足或为非 HTML 二进制 → 预期：跳过该文件，计入 `pages_error`
7. **所有文件都无法处理**：全部 3 个文件均为空 → 预期：按模板 E 输出
8. **标注锚点失效**：标注 item 的 `#id` 在页面中无对应元素 → 预期：维度 7 报告 MEDIUM 建议（模板 C），提示重新执行 annotate-prototype refresh
9. **标注数据 JSON 无效**：`window.PM_ANNOTATIONS_DATA` 含注释/尾逗号无法解析 → 预期：报告 MEDIUM 建议"标注数据 JSON 有效"，提示重新生成数据文件
10. **标注资产缺失**：页面含标注注入标签但 `annotations/{page}.js` 文件不存在 → 预期：报告 MEDIUM 建议"标注资产齐全"，提示重新执行 annotate-prototype build/refresh
11. **标注规则覆盖缺失**：spec.md 存在 `R12`（有页面落点）但所有页面标注 specRef 并集不含 `R12` → 预期：报告 MEDIUM 建议"规则覆盖完整"，提示在对应页面补充标注
12. **基线缺失回退**：调用方基线缺失 → 回退全量传入 `--pages`（pages_checked=N），行为与现状一致；auto-fix 修复落盘后基线不存在/损坏 → 不创建基线，输出 `baseline_updated.pages=0`
13. **纯图标按钮检出**：页面含无文字且无 aria-label/title 的 `<button>`（仅内嵌 SVG） → 预期：维度 6 报 MEDIUM"纯图标按钮"；按钮带 `aria-label` 或文字时静默通过
14. **黑挤标题检出**：页面 h1 样式 48px/900/line-height 1.1 且标题文本超 8 字符 → 预期：维度 6 报 MEDIUM"黑挤标题"；短标题（<8 字符）或行高 >1.2 时不触发
15. **假身份字段检出**：列表行含 `ID: 1024` 或 UUID（550e8400-e29b-41d4-a716-446655440000） → 预期：维度 6 报 MEDIUM"假身份字段"；行身份为"张伟 · 财务部"或"工单 #WX-240828-01"时不触发
16. **筛选空态未区分检出**：列表页含搜索框且空态文案仅"暂无数据" → 预期：维度 2 报 MEDIUM"空态区分"；空态含"没有符合条件的订单，清空筛选"或页面无筛选控件时不触发
17. **演示注入顺序错误**：`demo/{page}.js` 引用在 `demo-panel-runtime.js` 之后 → 预期：维度 8 报 MEDIUM"注入顺序"；顺序正确时不触发
18. **演示锚点失效**：demo item 的 `#id` 在页面中无对应元素 → 预期：维度 8 报 MEDIUM"演示锚点可解析"；page 级锚点恒过
19. **演示数据与标注不一致**：标注新增 state 项 S4 但 demo items 无 S4 → 预期：维度 8 报 MEDIUM"数据一致性"，提示重新执行 annotate refresh 重派生
20. **demo 引用存在但标注数据缺失**：页面含 demo 引用但 `annotations/{page}.js` 不存在（维度 7 跳过场景）→ 预期：维度 8 数据文件独立校验照常执行（`demo/{page}.js` 存在且 JSON 有效则通过，不依赖维度 7）

### 边界查询（12 条）

1. **单页面检查**：仅传入 1 个页面路径 → 预期：正常单页检查，不影响流程
2. **零问题场景**：检查过程中发现 0 个问题 → 预期：安静完成，无输出
3. **同一页面多次修改**：同一 session 中同一页面被修改并检查 3 次 → 预期：每次修改后独立检查，结果不累积
4. **quick 模式**：传入 `mode: quick` → 预期：跳过对比度计算和溢出检测，仅执行快速判定项
5. **输入列表为空**：build-prototype 传入空数组 → 预期：直接返回 control，不做任何检查
6. **存量页面无标注标签**：页面不含标注注入标签 → 预期：维度 7 静默跳过，仅执行维度 1-6，不报告标注层问题
7. **部分页面含标注**：5 个页面中 2 个含标注注入标签 → 预期：仅这 2 页执行维度 7，其余 3 页静默跳过，统计与报告互不混淆
8. **R 规则无页面落点**：spec.md 存在 `R8` 但没有任何页面适合承载该规则 → 预期：不报缺失（"R 规则无页面落点时除外"），其余规则照常聚合
9. **存量页面无 demo 引用**：页面不含 demo 注入标签 → 预期：维度 8 静默跳过，仅执行维度 1-6，不报告演示层问题
10. **部分页面含 demo 引用**：5 个页面中 2 个含 demo 注入标签 → 预期：仅这 2 页执行维度 8，其余 3 页静默跳过，统计与报告互不混淆
11. **dry-run 优先于 auto-fix**：同时传入 `--auto-fix --dry-run` → 预期：不写盘、基线不刷新（`baseline_updated.pages=0`），`fixes` 无 `applied` 条目、`fixes_applied=0`；可修复 HIGH 按模板 B 口径提示
12. **Node 不可用降级**：环境无 `node`（Bash 调用失败、无 JSON 输出），或脚本输出 `status: "error"` → 预期：返回空结果、静默结束，不阻塞 build-prototype，不产出模板 A-E 报告
