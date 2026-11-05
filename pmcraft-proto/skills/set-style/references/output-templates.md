# 输出模板（产出 1/2/3）

本文件是 set-style 第三步的冷材料参考：产出 1（DESIGN.md）/ 产出 2（design-system.css）/ 产出 3（preview.html）的完整输出模板。由 SKILL.md 第三步入口加载。以下模板内容自 SKILL.md 原文逐字移出，与 `../scripts/render-style.js` 的 `../scripts/templates/` 运行时模板共同构成输出契约；render-style.js 已负责机械渲染，本模板用于确认产物结构与手动填写 DESIGN.md 文字段落时的参照。

## 产出 1：DESIGN.md 完整模板

```markdown
---
# Primitive tokens
colors:
  gray-600: "{hex}"
  gray-200: "{hex}"
  gray-100: "{hex}"
  blue-500: "{hex}"
  red-500: "{hex}"
  green-500: "{hex}"
  orange-500: "{hex}"
  white: "#FFFFFF"
typography:
  heading-font: { family: "{font}", weight: {n} }
  body-font: { family: "{font}", weight: {n} }
spacing: { unit: 8px, sm: 4px, md: 8px, lg: 16px, xl: 24px, xxl: 32px }
radius: { sm: 2px, md: 4px, lg: 8px }
icon_library: lucide
---
# Semantic tokens
colors:
  primary: {colors.gray-600}
  accent: {colors.blue-500}
  danger: {colors.red-500}
  success: {colors.green-500}
  warning: {colors.orange-500}
  background: {colors.gray-100}
  surface: {colors.white}
  text: {colors.gray-600}
  border: {colors.gray-200}
typography:
  h1: { fontFamily: {typography.heading-font.family}, fontSize: 1.75rem, fontWeight: {typography.heading-font.weight} }
  body: { fontFamily: {typography.body-font.family}, fontSize: 1rem, fontWeight: {typography.body-font.weight}, lineHeight: 1.6 }
components:
  button: { backgroundColor: {colors.accent}, textColor: {colors.white}, rounded: {radius.md}, padding: "8px 16px" }
  card: { backgroundColor: {colors.surface}, rounded: {radius.lg}, padding: "16px", shadow: "0 1px 3px rgba(0,0,0,0.1)" }

## Overview
设计哲学和情感调性简述。

## Colors
语义色的使用场景说明。

## Typography
字阶、字重、行距说明。

## Components
按钮、卡片、输入框的规格说明。

## Do's and Don'ts

风格红线。每条禁止项均配有验证过的替代方案——不只是"不要"，而是"要什么"。

| # | 禁止项 | 替代方案 |
|---|--------|---------|
| 1 | 纯黑 `#000` 或纯白 `#fff` | 带色相倾向的深浅色：深色文本用 `#1A1A2E` 系（偏冷）或 `#1E1D1A` 系（偏暖）；浅色背景用 `#F8F9FA` 系（偏冷）或 `#FAF9F7` 系（偏暖）。方向由品牌色相决定——冷色品牌用冷调灰，暖色品牌用暖调灰 |
| 2 | AI 特征配色：深色背景 + 蓝紫渐变 + 霓虹强调色 | 背景用单色或微妙的色温渐变（同色相、亮度差 < 15%）。强调色仅用于 hover/active 状态，不作大面积背景。如果品牌色本身就是蓝紫系 → 用降低饱和度的变体，不叠加渐变 |
| 3 | 渐变文字装饰标题或指标 | 标题和指标用纯色 `var(--color-text)`。如需突出，用字重（700/800）或字间距（-0.02em）区分，不依赖渐变 |
| 4 | 玻璃拟态（毛玻璃/glow 边框）作为默认装饰 | 毛玻璃效果仅在粘性导航栏中使用（`backdrop-filter: blur(12px)` + `background: color-mix(…) 92% transparency`），且仅限 PC 端。表单、卡片、弹窗不使用 glass |
| 5 | 圆角卡片 + 一侧粗色边框（`border-radius` + `border-left: 4px solid`） | 用背景对比区分层级（主区用 `var(--color-background)`，子区用 `var(--color-surface)` 或 `color-mix(…, 4%, transparent)` 微调）。或用极细分隔线（`1px solid var(--color-border)`）代替粗色边框。需要强调的信息用字重或间距突出，不加左边框 |
| 6 | 卡片嵌套卡片 | 用背景色区分层级——子区域用比父区亮 2-5% 的 surface 色。或用分隔线（`border-bottom: 1px solid var(--color-border)`）代替内层卡片。如果确实是信息分组，用无边框的分组标题 + 间距代替卡片包裹 |
| 7 | 每个交互区域都塞入卡片容器 | 卡片仅用于需要视觉隔离的独立信息块（如仪表盘指标卡、独立表单区块）。列表行、导航项、标签组、操作栏等不需要卡片——用间距和分隔线区分即可 |
| 8 | 相同尺寸卡片 + 图标 + 标题 + 文案的重复网格 | 按内容类型变化布局密度：数值用 stat 卡（大字+标签），列表用表或行，详情用键值对。如果确实需要等大网格，至少让其中一块视觉不同（如一个卡片用 accent 背景、一个用图片占位）打破单调 |
| 9 | Inter / Roboto / Arial / Open Sans / system-ui 作为唯一字体 | 作为 body font 可以，但不作为 display/heading 字体。display 用特征衬线（Instrument Serif / Cormorant / 思源宋体）或特征无衬线（Bricolage Grotesque / DM Sans / 思源黑体）。两个字体必须有足够的视觉对比——如果一个页面去掉 Inter 就认不出品牌，说明字体选择太通用 |
| 10 | 滥用模态框——优先考虑内联编辑或展开区域 | 模态框仅用于必须中断用户流程的场景（确认删除、重要警告）。编辑用内联表单或侧边抽屉（slide-over panel）。多步骤操作用分步表单而非多个连续弹窗 |
| 11 | 黑挤标题：大字号 + 重字重 + 紧行高组合（如 64px/900/line-height ≤ 1.2）作默认标题规格 | 标题字号/字重/行高由 token 管理，h1 用 `clamp(28px, 4vw, 44px)` 级流体规格、行高 ≥ 1.25。中文长标题换行后先保证字面清楚（手机宽度检查），再决定视觉冲击。短标题或展示字体场景可适当突破，但必须验证换行可读 |
| 12 | 入场/悬浮/脉冲动画作为默认风格（每区块滚动淡入、卡片悬停统一上浮、按钮持续脉冲） | 动效预算留给状态与操作反馈（页面切换、对象来源、操作结果），时长 150-300ms，支持 `prefers-reduced-motion`。装饰性动效全部移除 |
| 13 | 移动端无布局策略（只保证"不溢出"，桌面侧栏/宽表格/工具栏单列堆到底） | DESIGN.md 必须声明移动端重排策略：折叠次要导航、表格列裁剪或改卡片呈现、内容顺序按手机任务重排、触控目标 ≥ 44px |

### 推荐项

- 中性色倾向品牌色相（轻微色相偏移创造潜意识统一感）：背景灰在品牌色方向上偏移 2-5°，肉眼不可辨但整体更协调
- 使用模块化字阶配合 `clamp()` 实现流体排版：`--fs-h1: clamp(28px, 4vw, 44px)` 而非固定 `36px`
- 用间距疏密创造视觉节奏，而非处处相同间距：信息组内部紧凑（8-12px），信息组之间宽松（24-32px）
- 不对称布局比居中布局更有设计感：左对齐标题 + 右对齐操作，2:1 分栏而非 1:1
- accent 色预算制：每屏 accent 使用不超过 2 处（如 eyebrow + 主按钮）。第三处降级为 `var(--color-text)` 或 `var(--color-text-secondary)`
```

## 产出 2：design-system.css 完整模板

```css
:root {
  /* 颜色 */
  --color-primary: {hex};
  --color-accent: {hex};
  --color-background: {hex};
  --color-surface: {hex};
  --color-text: {hex};
  --color-border: {hex};
  --color-danger: {hex};
  --color-success: {hex};
  --color-warning: {hex};

  /* 字体 */
  --font-heading: '{font}', sans-serif;
  --font-body: '{font}', sans-serif;

  /* 间距 */
  --space-sm: 4px;
  --space-md: 8px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-xxl: 32px;

  /* 圆角 */
  --radius-sm: {n}px;
  --radius-md: {n}px;
  --radius-lg: {n}px;

  /* 阴影 */
  --shadow-md: 0 1px 3px rgba(0,0,0,0.1);
}
```

## 产出 3：preview.html 完整模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>设计系统样板 - {风格名称}</title>
  <link href="https://fonts.googleapis.com/css2?family={HeadingFont}:wght@{HeadingWeight}&family={BodyFont}:wght@{BodyWeight}&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="_common.css">
  <style>
    :root {
      --color-primary: {hex};
      --color-accent: {hex};
      --color-background: {hex};
      --color-surface: {hex};
      --color-text: {hex};
      --color-border: {hex};
      --color-danger: {hex};
      --color-success: {hex};
      --color-warning: {hex};
      --font-heading: '{font}', sans-serif;
      --font-body: '{font}', sans-serif;
      --space-md: 8px;
      --space-lg: 16px;
      --radius-sm: {n}px;
      --radius-md: {n}px;
      --radius-lg: {n}px;
      --shadow-md: 0 1px 3px rgba(0,0,0,0.1);
    }
    /* 全局样式、Typography 层级、调色板展示、按钮、卡片、标签、表单 */
  </style>
</head>
<body>
  <!-- 以下每个区块必须包含 -->

  <!-- 1. 字体层级展示区 -->
  <section class="section typography-section">
    <h1>标题 H1（{font-size}）</h1>
    <h2>标题 H2（{font-size}）</h2>
    <h3>标题 H3（{font-size}）</h3>
    <p class="body">正文文本，用于段落内容展示（{font-size}）</p>
    <p class="small">小号文本，用于辅助说明（{font-size}）</p>
  </section>

  <!-- 2. 调色板展示区 -->
  <section class="section palette-section">
    <div class="color-swatch" style="background: var(--color-primary)">主色</div>
    <div class="color-swatch" style="background: var(--color-accent)">辅色</div>
    <div class="color-swatch" style="background: var(--color-success)">成功</div>
    <div class="color-swatch" style="background: var(--color-danger)">危险</div>
    <div class="color-swatch" style="background: var(--color-warning)">警告</div>
    <div class="color-swatch" style="background: var(--color-background); color: var(--color-text); border: 1px solid var(--color-border)">背景</div>
  </section>

  <!-- 3. 按钮样式区 -->
  <section class="section buttons-section">
    <button class="btn btn-primary">主按钮</button>
    <button class="btn btn-secondary">次按钮</button>
    <button class="btn btn-ghost">幽灵按钮</button>
    <!-- 每种按钮展示 normal 和 :hover 两种状态 -->
  </section>

  <!-- 4. 卡片样式区 -->
  <section class="section cards-section">
    <div class="card">卡片内容，展示圆角、阴影、内边距效果</div>
  </section>

  <!-- 5. 状态标签区 -->
  <section class="section badges-section">
    <span class="badge badge-success">成功</span>
    <span class="badge badge-danger">危险</span>
    <span class="badge badge-warning">警告</span>
  </section>

  <!-- 6. 表单输入框区 -->
  <section class="section forms-section">
    <input type="text" class="input" placeholder="默认态输入框">
    <input type="text" class="input input-focus" placeholder="聚焦态输入框（模拟）">
    <input type="text" class="input" placeholder="禁用态输入框" disabled>
  </section>

  <!-- 7. Tweaks 面板（浮动右下角，可收起） -->
  <div id="tweaks-panel">
    <div class="tweaks-header">
      <span>Tweaks</span>
      <button onclick="toggleTweaks()">收起/展开</button>
    </div>
    <div class="tweaks-body">
      <label>主题色：
        <select onchange="applyTheme(this.value)">
          <option value="blue">灰蓝</option>
          <option value="green">墨绿</option>
          <option value="orange">暖橙</option>
        </select>
      </label>
      <label>圆角：
        <select onchange="applyRadius(this.value)">
          <option value="0">直角</option>
          <option value="4">小圆角</option>
          <option value="12">大圆角</option>
        </select>
      </label>
      <label>字号：
        <select onchange="applyFontSize(this.value)">
          <option value="16">标准</option>
          <option value="18">大</option>
          <option value="20">超大</option>
        </select>
      </label>
      <label>明暗模式：
        <select onchange="applyThemeMode(this.value)">
          <option value="light">亮色</option>
          <option value="dark">暗色</option>
        </select>
      </label>
      <label>密度：
        <select onchange="applyDensity(this.value)">
          <option value="1">舒适</option>
          <option value="0.75">紧凑</option>
          <option value="1.25">宽松</option>
        </select>
      </label>
      <label>动效：
        <select onchange="applyMotion(this.value)">
          <option value="on">开启</option>
          <option value="off">关闭</option>
        </select>
      </label>
    </div>
  </div>

  <script>
    // (自包含的 Tweaks JS 逻辑)
    // 必须实现：toggleTweaks(), applyTheme(), applyRadius(), applyFontSize()
    //           applyThemeMode(), applyDensity(), applyMotion()
    // 必须通过 getComputedStyle(document.documentElement) 可读取当前 CSS 变量值
    function applyThemeMode(mode) { document.body.setAttribute('data-theme', mode); }
    function applyDensity(scale) { document.documentElement.style.setProperty('--spacing-scale', scale); }
    function applyMotion(mode) { document.documentElement.classList.toggle('reduce-motion', mode === 'off'); }
  </script>
</body>
</html>
```
