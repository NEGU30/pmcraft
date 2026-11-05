---
name: set-style
description: 根据产品类型或设计参考报告，推荐视觉风格方向并生成 DESIGN.md、design-system.css 和 preview.html 样板页，供产品经理确认视觉效果。当产品经理说"设定风格"、"简洁风"、"好看一点"、"配色"、"温暖自然"、"沿用现有风格"时触发。
type: skill
tags:
  - 视觉风格
  - 设计系统
  - 配色
  - style
  - design-system
  - design
  - prototype
allowed-tools: [Read, Write, Glob, Bash, AskUserQuestion, Skill, WebSearch, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_click, mcp__playwright__browser_wait_for, mcp__playwright__browser_evaluate, mcp__playwright__browser_close]
dependencies:
  - Node.js（LTS，scripts/render-style.js 运行所需；缺失时按 output-templates.md 要点手工生成，走脚本执行失败兜底）
argument-hint: '[风格关键词]'
prompt: 设定风格|简洁风|好看一点|配色|温暖自然|沿用现有风格|set-style
---

# 风格设定 (set-style)

## 概述

根据产品类型（来自 `prototype/working/spec.md`）或设计参考报告（来自 extract-design），推荐视觉风格方向，输出三份设计系统产物。PM 通过样板页确认视觉效果，满意后锁定设计系统。

决策简则：
- 有设计参考报告 → 以报告中的配色、字体为核心
- 无报告但有 spec.md → 按产品类型匹配默认风格
- PM 说"沿用现有风格" → 检测 DESIGN.md + design-system.css **+ preview.html** 是否已存在，三者齐（视觉已确认）则退出（无需重新生成）；DESIGN.md + css 在但 preview.html 缺（视觉未经本版本确认）→ 补出 preview.html 走确认（可豁免）；DESIGN.md/css 不存在则降级默认推荐
- DESIGN.md + design-system.css 已存在 → **调整模式**：不复原三件套，直接读取已有设计系统，按 PM 的新方向修改相应参数（如换色、调圆角、换字体），然后更新 DESIGN.md + design-system.css + preview.html
- 以上均不满足 → 提示缺失并退出

所有产物写入 `{功能顶级文件夹}/{版本}/prototype/working/`，路径从 CLAUDE.md 上下文获取，如无法确定则询问 PM。

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-proto/skills/set-style/`），脚本路径一律由此锚定解析，不依赖 cwd。

**内置参考资源**：`../../_shared/reference/font-pairings.md`（57 组字体配对）、`../../_shared/reference/color-palettes.md`（96 组配色方案）和 `../../_shared/reference/icon-libraries.md`（6 库图标选型指南）可作为推荐风格的补充数据源，需要时读取。**如果读取失败** → 依据默认风格映射表 + 通用字体配对（衬线/无衬线各一）与中性配色（品牌色相偏移 2-5°）自行推荐，不阻塞流程。

### 全局基准参考资源 + 权威规范

**全局基准**（`pmcraft/baseline/`）提供跨版本的基线设计系统。**权威规范**（`pmcraft/specs/`）是 ground truth——specs 有值时 reference 中同字段必须对齐。

检测逻辑（注意：本技能检测门槛比 initialize-structure 宽松——initialize-structure 要求四件套齐全才触发继承，本技能仅需设计令牌）：
- 如果 `pmcraft/baseline/design-reference.md` **或** `pmcraft/baseline/DESIGN.md` + `pmcraft/baseline/design-system.css` 同时存在 → 标记 `GLOBAL_BASELINE_AVAILABLE = true`
  - 优先使用 `design-reference.md`（含完整的 7 维设计分析）
  - 如仅有 DESIGN.md + design-system.css → 直接读取其中色值/字体作为数据源，标注"基于全局基准设计令牌（无完整设计报告）"
- 如果目录为空或以上文件均不存在 → 标记 `GLOBAL_BASELINE_AVAILABLE = false`
- 如果 `pmcraft/specs/` 存在且非空 → 标记 `SPECS_AVAILABLE = true`，以 specs 中品牌色/字体/圆角/间距作为 ground truth
- specs 有值的字段，reference 中同字段必须对齐 specs（不是"优先"，是"必须"）
- 读取 `design-reference.md` 中每条提取结果的「来源类型」，权威级（设计师视觉稿）覆盖参考级（竞品参考）

全局基准的角色：
- set-style 在版本特定参考报告缺失时，以全局基准为默认数据源
- 如果 PM 说"沿用现有风格"且全局基准存在但版本 DESIGN.md 不存在 → 可以从全局基准快速生成设计系统
- **注意**：本技能检测全局基准的门槛与 initialize-structure 不同——initialize-structure 要求四件套齐全（source/ + framework/ + DESIGN.md + design-system.css）才触发继承；本技能仅需设计令牌（design-reference.md 或 DESIGN.md + design-system.css）即可作为推荐数据源。这是因为 set-style 只消费设计令牌，不需要框架壳或原始素材备份。
- specs 非空时，specs 中的品牌色/字体/间距/圆角优先于全局基准，且对齐是硬性要求

### 加载策略总览

| 资源 | 加载时机 | fallback |
|:---|:---|:---|
| `references/output-templates.md`（产出 1/2/3 完整模板） | 第三步进入时 | 依据第三步各产出结构要点与填充规则自行构建，不阻塞流程 |
| `../../_shared/reference/font-pairings.md`（57 组字体配对） | 第二步推荐字体时按需 | 通用字体配对（衬线/无衬线各一） |
| `../../_shared/reference/color-palettes.md`（96 组配色方案） | 第二步推荐配色时按需 | 中性配色（品牌色相偏移 2-5°） |
| `../../_shared/reference/icon-libraries.md`（6 库图标选型指南） | 第二步选择图标库时按需 | 依据默认风格映射表图标库列 |
| `../../_shared/reference/playwright-verify-guide.md`（浏览器验证规范） | 第零步使用 Playwright 时按需 | 遵循 SKILL.md 内截图与归档规则 |

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| 风格关键词 | 自然语言 | 否 | PM 指定的风格方向。不传则根据上下文自动判断 | `简洁效率风`、`温暖自然`、`沿用现有风格` |

设计参考报告由 extract-design 产出，自动检测 `{项目路径}/` 下的 `prototype/reference/design-reference.md`，PM 不需要手动指定。

## 调用方式

```
set-style [风格关键词]
```

**示例：**

```
set-style
set-style 简洁效率风
set-style 温暖自然风
set-style 沿用现有风格
```

## 工作流程

### 模式判断

在进入常规流程之前，先检测当前状态：

- 如果 `prototype/working/DESIGN.md` + `prototype/working/design-system.css` 均已存在 → **走调整模式**（见下方[调整模式](#调整模式)），跳过常规流程。
  - **例外（视觉确认门）**：如果 DESIGN.md + css 已存在**但 `prototype/working/preview.html` 不存在**（设计系统系继承/存量/上版带来，本版本 PM 尚未确认视觉）→ 仍走调整模式，但**必须补出 preview.html 并走[第四步](#第四步pm-确认)确认**，不得静默退出。可豁免：PM 明确说"沿用上版风格"/"不用看了"→ 生成 preview.html 后不阻塞。
- 否则 → 走以下常规流程（第零步到第四步）。

### 第零步：收集设计素材

在正常模式的 Step 1 之前，先收集设计素材。（**调整模式跳过此步**——存量导入场景素材已在 extract-design --apply 时处理完毕。）

1. **检测已有素材**：
   - 检查 `pmcraft/baseline/` 是否有基准数据（design-reference.md 或 DESIGN.md + design-system.css）
   - 检查 `pmcraft/specs/` 是否有规范数据
   - 检查 `prototype/reference/` 是否有版本参考数据
   - 检查 `prototype/reference/design-reference.md` 是否已有 extract-design 产出

2. **根据检测结果提示 PM**：
   - 全部无数据 → "设定风格之前先收集一些参考素材。① 有品牌页/老系统作为全局基准？拖到 pmcraft/baseline/source/ ② 有品牌手册/组件规范？拖到 pmcraft/specs/ ③ 有竞品参考截图/链接？拖到 prototype/reference/ 或给网址/竞品名称 ④ 都没有就说继续。"
   - 部分有数据 → "检测到已有 XX 素材，还需要补充其他参考吗？"
   - 全部有数据 → 跳过此步，直接进入 Step 1。

3. **PM 提供素材时的处理**：
   - 拖文件到 `pmcraft/baseline/source/` → `extract-design --apply-global`
   - 拖文件到 `prototype/reference/` → 先问来源类型（竞品参考/存量系统/视觉稿）→ `extract-design`
   - 提供 URL → `extract-design` 分析
     - 使用 Playwright MCP 打开 URL 时，`browser_take_screenshot` 的 `filename` 必须带 `.playwright-mcp/` 前缀（如 `.playwright-mcp/ref-screenshot.png`），**禁止**裸文件名落在项目根目录
     - 使用 `browser_evaluate` 提取设计令牌或做交互验证时，遵循 `../../_shared/reference/playwright-verify-guide.md`（异步用 async IIFE + sleep，禁止 setTimeout 回调调用外部 resolve / window.__xxx 全局残留）
     - 截图仅用于视觉分析和信息提取，分析完成后代理应将截图复制到 `prototype/reference/source/` 归档（原始临时文件从 `.playwright-mcp/` 中清理）
   - 说竞品名称 → 搜索并分析
   - 拖文件到 `pmcraft/specs/` → 存入规范目录，标记可用

4. **PM 说"继续" → 进入 Step 1**。

5. **对后续步骤的影响**：素材收集完成后，Step 1 的全局基准检测（步骤 4）和规范检测（步骤 5）自然读到新数据，按 7 级优先级推荐。

### 第一步：读取上下文

1. **确定项目路径**：从 CLAUDE.md 或 `prototype/` 目录结构推断 `{项目路径}`。如果无法确定，询问 PM 指定。
2. **读取 spec.md 获取产品类型**：读取 `prototype/working/spec.md`，提取"产品类型"字段。
   - 如果 spec.md 不存在且 DESIGN.md 也不存在 → 提示"需求上下文还未生成，请先运行 `write-spec`"，然后退出。
   - 如果 DESIGN.md 存在但 spec.md 不存在，且 `prototype/reference/source/` 目录存在（存量导入场景）→ 跳过 spec.md 检查，以已有设计系统为参考。
   - 如果存在但缺少产品类型字段 → 根据功能名和背景推断产品类型，在产出中标注"已推测"。
3. **检测设计参考报告**：搜索路径 `prototype/reference/design-reference.md`。
   - 如果存在 → 读取配色方案、字体方案、组件风格章节，作为主要推荐依据。
   - 如果不存在 → 按产品类型默认推荐。
4. **检测全局基准**：检查 `pmcraft/baseline/design-reference.md` 是否存在。
   - 如果存在 → 读取配色、字体、组件风格章节，作为 P4 和 P5 的**备用数据源**。
   - 如果不存在 → 无影响，行为不变。
5. **检测权威规范**：检查 `pmcraft/specs/` 是否存在且非空。
   - 如果存在 → 读取其中品牌色/字体/圆角/间距作为 ground truth，reference 中同字段必须对齐。
   - 如果不存在 → 无影响，静默跳过。
6. **检测页面结构信息**：检查 `prototype/working/page-inventory.md` 是否存在。
   - 如果存在 → 提取页面类型分布（表单页为主/展示页为主/混合型）、关键页面（P1/首页/核心流程页）、所需组件列表（表单、卡片、列表、图表等）。这些信息用于 Step 2 辅助风格推荐和 Step 3 关键页试制。
   - 如果不存在 → 跳过，提示建议："当前没有页面结构信息。你可以先去规划页面结构（调 plan-pages），这样推荐的配色方案会更贴合你的页面类型；也可以直接先看抽象风格方案。" 不影响后续流程。

### 第二步：推荐风格方案

按以下优先级逐级决策。从优先级 1 开始检查，匹配则执行并跳过后续优先级：

- **优先级 1**：如果 PM 指定了"沿用现有风格"**且** `prototype/working/DESIGN.md` + `prototype/working/design-system.css` + `prototype/working/preview.html` 均已存在 → 无需重新生成，提示"设计系统已存在且视觉已确认，无需调整"，退出。
  - **例外**：如果 DESIGN.md + css 存在**但 preview.html 不存在**（视觉未经本版本确认）→ 不得退出。默认补出 preview.html 走[第四步](#第四步pm-确认)确认；PM 明确说"沿用上版风格"/"不用看了"→ 生成 preview.html 后放行、不阻塞（记录"已给过查看机会"）。
- **优先级 2**：如果 PM 指定了"沿用现有风格"**但** 版本 DESIGN.md/design-system.css 不都存在 **且** specs/ 或全局基准存在 → 以 specs > 全局基准为核心生成设计系统，标注数据来源。
- **优先级 3**：如果 PM 指定了"沿用现有风格"**但** 版本 DESIGN.md、specs、全局基准都不存在 → 提示"无存量设计系统，按默认推荐"，降级执行优先级 7。
- **优先级 4**：如果版本特定 `prototype/reference/design-reference.md` 存在且包含**设计师视觉稿**（权威级）→ 以设计师稿提取结果为核心生成，specs 中同字段对齐。
  - 如果 PM 关键词与设计师稿冲突，以 PM 关键词为准。
- **优先级 5**：如果版本特定 `prototype/reference/design-reference.md` 存在但仅为**存量系统/竞品参考**（非权威级）→ 以报告为推荐依据，specs 有值时对齐 specs。
  - 如果 PM 关键词与报告冲突，以 PM 关键词为准，保留字体等非冲突信息。
- **优先级 6**：如果无版本报告，但 specs/ 或全局基准存在 → 以 specs > 全局基准为数据源，标注来源。
- **优先级 7**：如果无报告、无存量、无 specs，但具有 spec.md → 根据产品类型从「默认风格映射表」推荐风格。
  - **子分支：page-inventory 存在时的微调** — 如果 Step 1 已读取 page-inventory，根据页面类型分布微调推荐倾向：

    | 页面类型分布 | 推荐倾向 |
    |------------|---------|
    | 表单页为主 | 清晰/高对比/信息层级分明 |
    | 展示页为主 | 留白足/排版灵活/视觉优先 |
    | 混合型 | 中性方案，兼顾功能与视觉 |

    不改变主映射表的产品类型匹配，仅在此基础上做微调。
- **兜底**：以上均不满足 → 提示"未找到任何需求文档，请先运行 `write-spec` 或通过 extract-design 提供参考"，退出。

**默认风格映射表：**

| 产品类型 | 推荐风格 | 视觉特征 | 图标库 |
|:---|:---|:---|:---|
| 管理后台 | 简洁效率风 | 中性色为主，信息密度高，直角/小圆角，多表格 | tabler |
| SaaS/企业服务 | 品牌效率风 | 品牌色+中性色混合，中等密度，专业清晰 | tabler |
| 消费产品 | 品牌调性风 | 品牌色驱动，大圆角，强视觉节奏，有活力 | feather |
| 内容平台 | 编辑杂志风 | 大标题、图文交错、宽幅留白，字体层级丰富 | iconoir |
| 电商 | 转化引导风 | 暖色强调（橙/红），CTA 突出，图片主导，价格醒目 | lucide |
| 工具类 | 极简工具风 | 克制用色，功能优先，低视觉干扰，高效率操作 | feather |
| 数据产品 | 数据可视化风 | 图表主导，暗色/亮色双模式，高密度网格 | tabler |
| 金融产品 | 信任安全风 | 蓝色/绿色为主，清晰层级，安全提示元素丰富 | bootstrap |
| 社交/社区 | 氛围互动风 | 品牌氛围驱动，Feed 流结构，轻量交互，个性化强 | phosphor |
| 无法判断、"未知"或其他 | 简洁效率风（通用） | 中性色为主，小圆角，不易出错 | lucide |

> 图标库选择读取 `../../_shared/reference/icon-libraries.md` 获取详细信息。PM 可覆盖默认推荐，最终值记录在 DESIGN.md 的 `icon_library` 字段。

**未识别的风格关键词处理规则：**
- 如果 PM 输入的关键词不在映射表内（如"未来科技风"）→ 以 PM 关键词为准生成，不自动映射到默认推荐。
- 如果 PM 说"随便"或意图极度模糊 → 按产品类型推荐默认风格。

**常见模糊场景判断逻辑：**

| 场景 | 判断逻辑 | 推荐归类 | 风格倾向 |
|------|---------|---------|---------|
| 游戏的用户中心/充值中心 | 面向 C 端但功能聚焦，交易安全敏感 | 消费产品 | 品牌色驱动 + 蓝绿色系暗示安全性，余额/状态信息醒目，CTA 突出 |
| 云服务/开发者控制台 | 技术用户为主，功能复杂但追求效率 | SaaS/企业服务 | 中性色为主，高密度网格，侧边栏导航，暗色模式优先 |
| 物流/快递查件页面 | 单功能查询页，用户停留短，目标明确 | 工具类 | 极简克制，搜索框+结果展示，减少干扰元素 |
| 企业内部 HR/OA 系统 | 员工高频使用，功能菜单多，信息量大 | 管理后台 | 浅色背景，清晰导航层级，多表格/表单，降低视觉疲劳 |
| 内容社区 + 电商混合（如小红书） | 浏览和购买并存，两个功能比重相当 | 以品牌整体定位为准：如果内容和电商分属不同功能模块，内容部分按内容平台、购买部分按电商分别处理 |
| 直播 + 电商（如抖音购物） | 强实时互动 + 转化 | 消费产品 | 强视觉节奏，暖色 CTA，动态元素丰富，注重移动端体验 |

### 第三步：输出设计系统

**机械部分由 `scripts/render-style.js` 完成**——根据第二步确定的配色/字体/圆角配置，渲染核心四件套（design-system.css + preview.html + DESIGN.md 骨架 + 复制 _common.css），page-inventory 存在时额外渲染关键页 preview-key-page.html。LLM 只需组装 JSON 配置并运行脚本：

```bash
node "{本技能源码目录}/scripts/render-style.js" \
  --config='{"style_name":"<风格名>","colors":{"primary":"#...","accent":"#...","background":"#...","surface":"#...","text":"#...","border":"#...","danger":"#...","success":"#...","warning":"#..."},"typography":{"heading_font":"...","heading_weight":700,"body_font":"...","body_weight":400},"radius":{"sm":2,"md":4,"lg":8}}' \
  --output-dir="<版本目录>/prototype/working" \
  [--page-inventory="<page-inventory.md 路径>"]  # 传则额外生成 preview-key-page.html
```

> **参数安全（Bash 注入防护）**：`--config` 中的 `style_name` 若直接采用 PM 表述中的风格关键词（如"未来科技风"），该值属于用户输入，构造 Bash 命令前必须剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 修改表述）；`--config` 整体用单引号包裹，内含单引号会截断参数字符串。含非法字符时以剔除后的内容提交并在结果展示中注明，不中断流程。

脚本输出 `{output_files: [{path, size}], has_key_page, common_copied}`。**DESIGN.md 的文字段落（Overview/Colors/Typography/Components 的说明文字）由 LLM 填写**（脚本生成骨架 + tokens，留 `（AI 填写：...）` 占位）。preview-key-page.html 仅当 page-inventory 存在时生成。

**脚本执行失败兜底（node 缺失 / 退出非 0 / 输出非 JSON）** → 依据 `references/output-templates.md` 各产出结构要点手工生成设计系统文件，并提示 PM"渲染脚本不可用，已按模板要点手工生成"，不阻塞流程。

以下为产物结构说明（脚本已按此渲染，LLM 无需手动重写模板）。**进入本步时执行 `Read references/output-templates.md`，加载产出 1/2/3 的完整模板。如果 Read 失败 → 依据下方各产出的结构要点与填充规则自行构建模板，不阻塞流程。**

#### 产出 1：DESIGN.md

在 `prototype/working/DESIGN.md` 写入设计规范文档。YAML 头包含 Primitive tokens 和 Semantic tokens 两个区块；Markdown 正文含 Overview / Colors / Typography / Components / Do's and Don'ts 章节（Do's and Don'ts 为 13 条风格红线，每条禁止项均配有替代方案表，附推荐项清单）。**完整模板（含 YAML 骨架、章节结构与红线表）见 `references/output-templates.md`。**

**填充规则**：将 `{hex}` 替换为实际色值（如 `#4A5568`），将 `{font}` 替换为字体名称（如 `Karla`），将 `{n}` 替换为字重数字（如 `700`）。

#### 产出 2：design-system.css

在 `prototype/working/design-system.css` 写入 CSS 变量文件，按类别分组（颜色/字体/间距/圆角/阴影）。**完整模板见 `references/output-templates.md`。**

**填充规则**：将 `{hex}` 替换为与 DESIGN.md 一致的色值，将 `{font}` 替换为字体名称，将 `{n}` 替换为圆角像素值。

#### 产出 2.5：_common.css（组件样式）

从 pmcraft-proto 插件目录读取 `../../_shared/_common.css`，将其原样写入 `prototype/working/_common.css`。该文件提供跨平台通用组件样式（btn/card/table/badge/field/stat/typography/modal/toast 等 class）。

#### 产出 3：preview.html

在 `prototype/working/preview.html` 写入样板页，展示所有设计要素的视觉效果。

**组件样式来源**：样板页的按钮、卡片、表单、徽章等组件样式引用同目录下的 `_common.css`（由 产出 2.5 写入 `prototype/working/_common.css`），不重复写组件 CSS。set-style 只负责注入 `:root` token 值（颜色/字体/圆角/阴影数值）和 tweaks 面板 JS。

**结构要求**（完整模板见 `references/output-templates.md`）：样板页必须包含字体层级展示区、调色板展示区、按钮样式区、卡片样式区、状态标签区、表单输入框区 6 个展示区块，外加右下角可收起的 Tweaks 面板；`<head>` 中引用字体 CDN 与 `_common.css`，`:root` 注入全部 CSS 变量。

**填充规则**：将 `{风格名称}`、`{hex}`、`{font}`、`{n}`、`{font-size}`、`{HeadingFont}`、`{BodyFont}` 等占位符替换为实际值。所有 CSS 变量与 DESIGN.md 和 design-system.css 保持一致。

**Tweaks 面板要求**：浮在页面右下角，可收起/展开；包含 6 个调节项——主题色（3 选 1）、圆角（3 选 1）、字号（3 选 1）、明暗模式（亮色/暗色）、密度（舒适/紧凑/宽松）、动效（开启/关闭）；纯内联实现（HTML + CSS + JavaScript，不依赖外部库）；面板参数必须可被 `getComputedStyle(document.documentElement).getPropertyValue('--color-primary')` 等方式读取，供 PM 说"按这个"时提取当前值。

**暗色模式实现**：在 `<style>` 块末尾追加 `[data-theme="dark"]` 属性选择器，覆盖 `:root` 变量——`--color-background` → 深色、`--color-surface` → 深色、`--color-text` → 浅色、`--color-text-secondary` → 中灰、`--color-border` → 暗色。亮色为默认（无 `data-theme` 时生效）。

**动效关闭实现**：在 `<style>` 块末尾追加 `.reduce-motion * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }`。

**密度实现**：间距变量使用 `calc(var(--space-lg, 24px) * var(--spacing-scale, 1))` 写法，切换 `--spacing-scale` 即可整体缩放间距。

#### 产出 4（条件产出）：preview-key-page.html

如果 Step 1 中 page-inventory.md 存在，在产出 1~3 之外额外生成关键页风格试制页。写入 `prototype/working/preview-key-page.html`。

**生成规则：**
- 从 page-inventory 中选取 P1（第一个流程页/首页），作为风格预览页
- 只做 **1 个页面**，不多做
- 使用已产出的 DESIGN.md / design-system.css 的值进行风格化（内联写入，不引用外部文件）
- 内容用 lorem ipsum 占位文案（如"标题占位"、"描述文字占位"），不实现真实交互
- 页面顶部必须显示警告横幅（带浅黄背景色）：
  ```html
  <div style="background: #fff3cd; padding: 12px; text-align: center; font-size: 14px;">
    &#x26a0;&#xfe0f; 本页仅用于评估配色、间距、字体、布局比例等视觉风格，
    不包含功能交互。正式原型由 build-prototype 后续生成。
  </div>
  ```

**交互约束**（等同于 preview.html）：
- 不实现点击跳转、表单提交、按钮点按等功能交互
- 不实现 Tweaks 面板实时调整（preview.html 的 tweaks 面板已足够）

**变更联动**：
- PM 在 preview.html 的 Tweaks 面板调整参数后，preview-key-page.html 不需要实时联动更新
- PM 说"换颜色后想看关键页面效果" → 重新生成 preview-key-page.html
- PM 在第四步说"按这个"确认后，preview-key-page.html 不再更新

**preview-key-page.html 不是必产文件。** 当 page-inventory.md 不存在时不生成，不阻塞流程。

### 第四步：PM 确认

展示预览产物并等待 PM 明确确认。

先主动提醒 PM 查看预览产物：

> "请打开查看以下预览文件：
> - **preview.html** → 查看色板、字体层级、按钮/卡片/表单等原子风格
> {preview-key-page 提醒}
>
> 看完后告诉我是否满意，或者需要怎么调整。"
>
> {preview-key-page 提醒占位}：如果 preview-key-page.html 已产出 → "**preview-key-page.html** → 查看风格在关键页面中的整体效果（只看配色、间距、布局比例，不包含功能交互）"
> 如果未产出 → 去掉此行。

**停顿**：必须等待 PM 明确说"看了，没问题"或类似确认。PM 确认前不继续后续流程。

之后展示概括信息并将样板页呈现给 PM 确认。使用以下消息模板：

> "设计系统已生成，这是样板页效果：
> - 主色：[色值] 辅色：[色值] 强调色：[色值]
> - 字体：[字体名]
> - 卡片圆角：[px]
>
> ⚠️ 样板页仅用于确认配色、字体、圆角等视觉风格，按钮点不动、链接不跳转是正常的——这是风格样板，不是可以交互的原型页面。
> 右下角的 Tweaks 面板可以实时调整配色和圆角试效果。
> 请确认是否满意？不满意可以调整。

如果使用了全局基准，在确认消息中追加一行：
> "（设计系统基于全局基准 pmcraft/baseline/design-reference.md 生成）"

风格确认完成后，**调用 `AskUserQuestion` 工具**（如可用）：

- `question`: "需要同时出暗色模式效果参考吗？会单独生成一份暗色版样板页供对比。"
- `header`: "暗色模式"
- `options`:
  - `{label: "需要", description: "同时输出暗色模式样板页，方便对比亮色/暗色效果"}`
  - `{label: "不需要", description: "只需当前亮色模式，无需暗色版"}`
- `multiSelect`: false

PM 选"需要" → 生成暗色模式样板并存为 preview-dark.html 供参考。

**备选（工具不可用时）**：> "需要同时出暗色模式效果参考吗？"

根据 PM 的回应执行以下流转：

| PM 回应 | 处理方式 |
|:---|:---|
| 确认满意 | 锁定设计系统，退出 |
| 不满意，提出调整方向 | 修改参数 → 重新生成样板页 → 再次展示确认 |
| "按这个"（Tweaks 面板调整后） | 通过 `getComputedStyle(document.documentElement)` 读取当前 CSS 变量值，写回 `DESIGN.md` 和 `design-system.css`，退出 |
| 要求跳过样板页 | 回复："必须出样板页确认，否则无法锁定设计系统"，坚持输出 |

PM 的调整次数无上限，每次调整后重新生成样板即可。回复 **退出** 可随时终止调整流程（与 write-brief/compact-prd 等确认循环的退出约定一致）；PM 确认满意即锁定设计系统并退出，不进入自动重试循环。

### 调整模式

当 `DESIGN.md` + `design-system.css` 已存在时走此模式。不复原三件套，增量修改已有设计系统。

**视觉确认门**：进入调整模式时，如果 `prototype/working/preview.html` 不存在（设计系统系继承/存量/上版带来，本版本 PM 未确认视觉），即便 PM 没有提出任何调整方向，也**必须从已有 DESIGN.md/css 生成 preview.html 并走第四步确认**。可豁免：PM 明确说"沿用上版风格"/"不用看了"→ 仍生成 preview.html，但跳过等待确认、不阻塞。

1. 读取已有 `prototype/working/DESIGN.md` 和 `prototype/working/design-system.css`。
2. 根据 PM 的调整方向修改对应参数：
   - "换颜色"/"配色调暖一点" → 修改 DESIGN.md 中 colors 章节的对应色值，同步更新 design-system.css 中的 CSS 变量
   - "圆角加大"/"直角一点" → 修改 radius 章节和 CSS 变量
   - "换个字体" → 修改 typography 章节，更新 CDN 链接
3. 生成或更新 `prototype/working/preview.html` 反映新参数。
4. 展示样板页让 PM 确认（同第四步确认模板）。

## 输出

| 文件 | 路径 | 用途 | 谁看 | 必产 |
|------|------|------|------|------|
| `DESIGN.md` | `prototype/working/DESIGN.md` | 设计规范（YAML + Markdown） | Agent + 开发参考 | 是 |
| `design-system.css` | `prototype/working/design-system.css` | CSS 变量文件 | 开发直接引用 | 是 |
| `_common.css` | `prototype/working/_common.css` | 跨平台通用组件样式 | preview.html 引用 | 是 |
| `preview.html` | `prototype/working/preview.html` | 样板页（原子风格） | PM 确认视觉效果 | 是 |
| `preview-key-page.html` | `prototype/working/preview-key-page.html` | 关键页风格试制页（页面级效果预览） | PM 看整体风格 | 否（page-inventory 存在时产） |

## 与上下游的衔接

**上游依赖：**

| 来源 | 读取路径 | 读取的字段 |
|------|---------|-----------|
| spec.md | `prototype/working/spec.md` | 产品类型（9 类：管理后台/SaaS/消费产品/内容平台/电商/工具类/数据产品/金融产品/社交社区） |
| 设计参考报告 | `prototype/reference/design-reference.md` | 配色方案、字体方案、组件风格（可选） |
| 全局基准 | `pmcraft/baseline/design-reference.md` | 配色方案、字体方案、组件风格（备用数据源，低于版本特定报告和 specs） |
| 权威规范 | `pmcraft/specs/` | 品牌色、字体、圆角、间距（ground truth，有值时 reference 必须对齐） |

**下游消费：**

| 下游 | 读取路径 | 所提供的字段 |
|------|---------|-----------|
| plan-pages | — | 无直接依赖 |
| build-prototype | `prototype/working/DESIGN.md` + `prototype/working/design-system.css` | 语义令牌（DESIGN.md）→ CSS 变量值（design-system.css）|

## 禁止行为

1. **禁止修改 spec.md** — 只读取不写入
2. **禁止使用纯黑 `#000` 或纯白 `#fff`** — 所有色值必须带色相倾向，深色文本向品牌色相方向偏移
3. **禁止 AI 特征配色组合** — 如深色背景+蓝紫渐变+霓虹强调色
4. **禁止随意编造配色** — 无设计参考报告时必须按产品类型默认推荐，确保风格匹配
5. **禁止截图裸文件名落在项目根目录** — Playwright `browser_take_screenshot` 的 `filename` 必须带 `.playwright-mcp/` 前缀，分析后截图归档至 `prototype/reference/source/`
6. **禁止只输出文字让 PM 想象效果** — 必须出样板页（preview.html）让 PM 确认；存量场景根据 PM 调整方向更新已有样板页而非创建新文件
7. **禁止把草稿标记为最终版本** — 设计系统第三步产出为草稿，PM 确认后方锁定

## 约束

1. **preview-key-page.html 不是必产文件** — 仅 Step 1 检测到 page-inventory.md 存在时才生成。page-inventory 不存在时跳过，不阻塞流程。
2. **preview-key-page.html 只展示风格，不实现交互** — 不替代 build-prototype，不作为 build-prototype 的输入。build-prototype 后续会从零生成正式页面。
3. **有设计参考报告时必须优先采用** — 报告中的配色和字体高于默认推荐。
4. **存量场景沿用现有风格时无需重新生成** — 检测到 DESIGN.md + design-system.css **且 preview.html** 均已存在则退出。若 DESIGN.md + css 存在但 preview.html 缺失（视觉未经本版本确认）→ 必须补出 preview.html 走确认，不得静默退出（可豁免：PM 说"沿用上版"/"不用看了"→ 生成后不阻塞）。
5. **Tweaks 调整后的参数必须写回设计系统文件** — PM 说"按这个"时，通过 JS 读取当前 CSS 变量值更新 DESIGN.md 和 CSS。
6. **设计参考报告中的非冲突信息应保留** — 关键词冲突时只覆盖冲突部分（如色系），字体、组件风格等仍可沿用。

## 正误示例

### 正确示例

1. `set-style 简洁效率风`（有 spec.md 和设计参考报告）
   - 预期行为：读取设计参考报告，以报告中的配色和字体为核心。"简洁效率风"是风格类型关键词（非颜色关键词），不覆盖报告中的配色方案。如果 PM 的关键词与报告配色直接冲突（如报告推荐暖色但 PM 说"冷色风"），则以 PM 关键词覆盖冲突部分，保留字体等非冲突信息。输出 DESIGN.md、design-system.css、_common.css、preview.html 到 prototype/working/，展示确认消息。

2. `set-style 沿用现有风格`（DESIGN.md + design-system.css + preview.html 均已存在）
   - 预期行为：检测到 `prototype/working/DESIGN.md` + `design-system.css` + `preview.html` 均已存在（视觉已确认），提示"设计系统已存在且视觉已确认，无需调整"，退出。
   - 变体：若 DESIGN.md + css 存在但 preview.html 缺失（继承/存量场景视觉未确认）→ 补出 preview.html 走第四步确认，不退出（可豁免）。

3. `set-style`（spec.md 产品类型为消费产品，无设计参考报告，无存量）
   - 预期行为：从 spec.md 提取产品类型"消费产品"，按映射表推荐"品牌调性风"，输出四份文件。

### 错误示例

**错误 1**：无设计参考报告时编造与产品类型不匹配的配色
```
（产品类型是管理后台，但推荐了紫色渐变+毛玻璃）
```
- 问题：管理后台应推荐中性色系。应严格按产品类型匹配。

**错误 2**：样板页不展示直接让 PM 确认
```
"配色 #D4A574 + 字体 Karla，OK吗？"
```
- 问题：PM 无法通过文字确认视觉效果。必须出样板页。

**错误 3**：PM 说"按这个"时未回写 DESIGN.md
```
（Tweaks 调整后只保存了预览效果，未更新设计系统文件）
```
- 问题：Tweaks 调整的效果必须写回 DESIGN.md 和 CSS 才能持久化。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 | 回复模板 |
| :--- | :--- | :--- | :--- |
| spec.md 不存在，DESIGN.md 也不存在 | 调 set-style 但无任何上下文 | 提示后退出 | "需求上下文还未生成，请先运行 write-spec" |
| spec.md 不存在，但 DESIGN.md 存在且 `prototype/reference/source/` 存在（存量导入） | 存量导入后调 set-style | 跳过 spec.md 检查，以已有设计系统为参考 | "（静默跳过 spec.md 检查）" |
| spec.md 缺少产品类型字段 | spec.md 存在但无产品类型 | 根据功能名和背景推断，在产出中标注"已推测" | "（静默推断，产出示警标注）" |
| 设计参考报告与 PM 关键词冲突 | 报告推荐暖色但 PM 说"冷色" | 以 PM 关键词为准，报告中字体等非冲突信息仍保留 | "（静默融合）" |
| PM 通过 Tweaks 调完后说"按这个" | PM 在样板页上试了不同参数 | 读取当前 CSS 变量值，写回 DESIGN.md 和 CSS | "已按当前 Tweaks 参数更新设计系统文件。" |
| 多张参考图风格不一致 | 设计参考报告中标注了矛盾点 | 在推荐时标注"参考图中存在风格不一致"，让 PM 确认方向 | "参考图中存在风格不一致，以哪个为准？" |
| 无 spec.md 也无设计参考报告 | 两者均不存在 | 提示后退出 | "未找到任何需求文档，请先运行 `write-spec` 或通过 extract-design 提供参考" |
| PM 调整超过 3 次 | 重复修改 | 不限制次数，每次调整重新生成样板 | "（静默重新生成）" |
| PM 输入关键词无法识别 | 如"未来科技风" | 以 PM 关键词为准生成，不自动映射到默认推荐 | "（静默以 PM 关键词为准）" |
| 风格关键词含 shell 元字符（`'`、`"`、`$`、`;`、`&`、`|` 等） | 第三步构造 render-style.js 命令时 style_name 来自 PM 表述 | 剔除元字符后以剔除版提交，不中断流程，并在结果展示中注明 | "（转述操作结果，并注明已剔除非法字符）" |
| PM 说"随便" | 意图极度模糊 | 按产品类型推荐默认风格 | "好的，根据产品类型推荐 {风格名}。" |
| 项目路径无法自动推断 | 无 CLAUDE.md 且无 assets 目录 | 询问 PM 指定项目目录 | "无法确定项目路径，请指定项目目录。" |
| 设计参考报告存在但缺少配色/字体章节 | 报告内容不完整 | 补以产品类型默认推荐，标注"报告内容不完整，配色/字体已回退为默认" | "报告内容不完整，配色/字体已回退为默认推荐。" |
| 全局基准存在但版本设计参考报告也同时存在 | 两个 reference.md 都存在 | 使用版本报告，冲突字段以版本为准 | "（静默融合，版本优先）" |
| 全局基准与版本报告在多个维度上完全冲突 | 两个 reference.md 对配色、字体、圆角、间距均给出相反建议 | 在确认消息中逐项列出所有冲突维度，显式告知 PM 冲突内容，由 PM 选择以哪个为准 | "全局基准与版本参考报告在以下维度存在冲突：{维度及各自取值列表}。请确认以哪个为准？" |
| 全局基准存在但 spec.md 缺失 | 无产品类型字段，但有全局基准 | 使用全局基准中的风格判断作为产品类型推断依据；在 DESIGN.md 中标注"产品类型: 已推测（来源于全局基准风格归类）" | "（静默推断）" |
| PM 关键词与全局基准冲突 | PM 说"冷色"但全局基准为暖色 | 以 PM 关键词为准，静默覆盖相关色值 | "（静默以 PM 关键词为准）" |
| 全局基准存在 + PM 说"沿用现有风格" + 版本无 DESIGN.md | 新版本文档缺失但有全局基准 | P2 触发：以全局基准生成设计系统 | "基于全局基准生成设计系统。" |
| specs 存在且与全局基准同字段冲突 | specs 和 reference 对品牌色/字体给出不同值 | 以 specs 为准，reference 中同字段对齐 specs | "已按 pmcraft/specs/ 品牌规范对齐，{N} 个令牌从全局基准调整。" |
| specs 存在但与 PM 关键词冲突 | PM 说"暖色"但 specs 指定冷色 | 以 PM 关键词为准，标注偏离 specs | "品牌规范指定为冷色，已按你的要求调整为暖色。" |
| design-reference.md 含设计师视觉稿（权威级）与竞品参考（参考级）混合 | 同一报告含多种来源类型 | 设计师稿覆盖竞品参考的同字段，在确认摘要中标注来源 | "设计师视觉稿提供 {N} 个令牌，竞品参考 {M} 个令牌（仅记录）。" |
| URL 分析截图落在项目根 | 第零步 Playwright 截图时 filename 未加 `.playwright-mcp/` 前缀 | 代理自查：截图完成后确认文件在 `.playwright-mcp/` 下，发现裸文件名时立即移至 `.playwright-mcp/` 或删除 | "（静默清理，不提示）" |

## 快速参考

| 操作 | 命令 |
|:---|:---|
| 自动判断风格（有 spec.md） | `set-style` |
| 指定风格方向 | `set-style 简洁效率风` |
| 沿用上一版本 | `set-style 沿用现有风格` |
| 设计参考报告 + PM 关键词 | `set-style 冷色风`（自动融合报告与关键词） |

## 评价测试用例

### 正向触发（5条）

1. `set-style`（有 spec.md 和设计参考报告）— 预期：以设计参考报告为准输出设计系统
2. `set-style 简洁效率风`（有 spec.md，无设计参考报告）— 预期：根据产品类型推荐风格
3. `set-style 沿用现有风格`（DESIGN.md + design-system.css + preview.html 均已存在）— 预期：提示"设计系统已存在且视觉已确认，无需调整"，退出。（若 preview.html 缺失 → 补出样板走确认，不退出）
4. PM 通过 Tweaks 调完后说"按这个" — 预期：Tweaks 参数写回 DESIGN.md 和 CSS
5. `set-style`（spec.md 产品类型为消费产品）— 预期：推荐"品牌调性风"而非"简洁效率风"

### 负向触发（5条）

1. `set-style`（spec.md 不存在）— 预期：提示先运行 write-spec
2. `set-style 沿用现有风格`（DESIGN.md 或 design-system.css 任一不存在，全局基准可用）— 预期：以全局基准生成设计系统；全部不存在则降级到默认推荐
3. `set-style`（spec.md 和 brief 都不存在）— 预期：提示"未找到任何需求文档"
4. PM 在确认前要求跳过样板页 — 预期：不同意跳过，坚持输出样板页
5. PM 说"随便"（意图模糊）— 预期：根据产品类型推荐默认风格

### 边界查询（3条）

1. 设计参考报告与 PM 关键词冲突（报告推荐暖色但 PM 说冷色）— 预期：以 PM 为准，保留非冲突信息
2. PM 反复调整 3 次以上 — 预期：每次调整重新生成样板，无次数限制
3. `set-style`（spec.md 产品类型为"未知"或无法判断）— 预期：默认推荐"简洁效率风"

### 合约测试项（拆分后）

1. **加载链测试** — 第三步的 `Read references/output-templates.md` 指令引用的文件存在。
2. **单向性测试** — `references/output-templates.md` 中不含任何 Read 指令（禁止嵌套加载）。
3. **fallback 测试** — 第三步 Read 指令后紧跟"如果 Read 失败"回退指引，可依据各产出结构要点与填充规则独立构建模板。

## 参考文档

| 文件 | 路径 | 加载时机 |
|:---|:---|:---|
| 输出模板 | `references/output-templates.md` | 第三步进入时 |
| 字体配对 / 配色方案 / 图标库指南 / Playwright 验证指南 | `../../_shared/reference/`（font-pairings.md / color-palettes.md / icon-libraries.md / playwright-verify-guide.md） | 见上文「加载策略总览」表 |
