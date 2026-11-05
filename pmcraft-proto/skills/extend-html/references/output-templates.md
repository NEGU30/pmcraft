# 输出模板（Phase 2 产物）

本文件是 extend-html Phase 2 的冷材料参考：DESIGN.md / design-system.css / page-inventory.md / index.html 入口四类产物的完整输出模板。由 SKILL.md Phase 2 入口加载，用于确认产物结构与手动填写文字段落。

## 产出 1：DESIGN.md（存量延续红线版）

沿用 set-style DESIGN.md 的 YAML + Markdown 结构，Do's and Don'ts 简化为「存量延续红线」——面向"在存量页面上增量扩展"场景。

```markdown
# 设计声明（extend-html）

> 本设计声明由存量 HTML 提取生成，服务于**就地增量扩展**：存量页面是主角，新增内容必须延续其既有体系。

## 来源

- 导入页面：{页面名1.html、页面名2.html}（原稿 `prototype/reference/source/`，永不改动）
- 提取时间：{YYYY-MM-DD HH:mm}
- 提取方式：extract-css.js 结构化提取 + LLM 语义归类

## 语义令牌

| 角色 | 值 | 使用场景 | 来源页 |
|------|-----|---------|--------|
| Primary | {hex} | {主操作/强调} | {页面名} |
| Accent | {hex} | {次强调/链接} | {页面名} |
| Background | {hex} | {页面背景} | {页面名} |
| Surface | {hex} | {卡片/内容容器} | {页面名} |
| Text | {hex} | {正文} | {页面名} |
| Border | {hex} | {分隔/描边} | {页面名} |
| Success | {hex} | {成功态} | {页面名} |
| Danger | {hex} | {错误/删除} | {页面名} |

## 字体

- 标题字体：{字体名}
- 正文字体：{字体名}
- 字号层级：{h1/h2/h3/body/small 实际值}

## 间距与圆角

- 间距节奏：{取整后的典型值，如 8/16/24px}
- 圆角：{取整后的典型值，如 4/8px}

## Overview

存量页面的设计哲学简述（从实际 CSS 归纳，不臆造）。

## Colors / Typography / Components

语义色使用场景、字阶字重、典型组件（按钮/表格/输入框）的存量规格。

## Do's and Don'ts（存量延续红线）

新增内容的硬性边界。每条禁止项均配验证过的替代方案。

| # | 禁止项 | 替代方案 |
|---|--------|---------|
| 1 | 破坏存量视觉习惯（突然换配色/字体体系） | 新元素优先复用页面已有 class；新样式用 `var(--xxx)` 令牌或页面一致字面值（R3） |
| 2 | 引入外部 CSS/JS/CDN | 新样式追加进页面自身 `<style>`（R2） |
| 3 | 引入框架（Vue/React 等） | 沿用页面内联 `<script>` + addEventListener 惯例（R4） |
| 4 | 改动存量元素/样式/脚本 | 只动 PM 明确提及的部分，逐条确认（R1） |
| 5 | AI 味文案（夸大的象征意义、宣传性语言、破折号过度） | 中文、语气与页面一致（R5） |
```

## 产出 2：design-system.css（:root 语义令牌）

聚合去重后的令牌文件。LLM 对 extract-css.js 输出做语义归类（主/强调/语义色），字体取 top2，间距/圆角取整。若页面已有同名 CSS 变量，取页面值作为令牌值（页面优先）。

```css
/* === pmcraft tokens (extend-html) 聚合版 === */
:root {
  /* 颜色（语义归类） */
  --color-primary: {hex};
  --color-accent: {hex};
  --color-background: {hex};
  --color-surface: {hex};
  --color-text: {hex};
  --color-border: {hex};
  --color-danger: {hex};
  --color-success: {hex};
  --color-warning: {hex};

  /* 字体（top2） */
  --font-heading: '{字体名}', sans-serif;
  --font-body: '{字体名}', sans-serif;

  /* 间距（取整） */
  --space-sm: {n}px;
  --space-md: {n}px;
  --space-lg: {n}px;
  --space-xl: {n}px;

  /* 圆角（取整） */
  --radius-sm: {n}px;
  --radius-md: {n}px;
  --radius-lg: {n}px;
}
/* === pmcraft tokens (extend-html) 结束 === */
```

## 产出 3：每页 `<style>` 顶部的幂等注入块

注入到**每页自身** `<style>` 顶部（页面自包含）。再次运行已含标记 → 跳过。页面已有同名 CSS 变量 → 复用其值。

```css
/* === pmcraft tokens (extend-html) === */
:root {
  --color-primary: {hex};
  /* …与聚合版一致，仅该页实际用到的令牌… */
}
/* === pmcraft tokens (extend-html) 结束 === */
```

## 产出 4：page-inventory.md（多页条目 + 外链标注）

每个导入页一条，元素=DOM 可交互元素、状态=已实现状态、跳转=页内锚点 + 外链标注。

```markdown
# 页面清单（extend-html）

> 由存量 HTML 导入生成。跨页链接保持原 href，外链标注「外链」。

## {页面名1.html}（来源：single-file / 项目代码转换）

- **元素**：{可交互元素清单，如：订单表格（按单号筛选）、订单行操作列（详情/发货）、顶部导航（首页/订单/客户）}
- **状态**：{已实现状态清单，如：表格为空时显示"暂无订单"；筛选无结果显示"无匹配订单"；加载为同步渲染（无骨架屏）}
- **跳转**：{页内锚点，如：#order-detail 订单详情锚点；外链，如：帮助中心 → https://help.example.com（外链）}
- **备注**：{存量交互说明，如：下单按钮跳转外链；SPA 转换页交互为快照级}

## {页面名2.html}（来源：single-file / 项目代码转换）

- **元素**：…
- **状态**：…
- **跳转**：…
```

## 产出 5：index.html 入口（单页 stub / 多页导航）

由 `scripts/init-extend.js` 机械生成（单点收敛，LLM 不手工重写）。两种形态：

### 单页 → meta refresh 重定向 stub

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>extend-html 原型入口</title>
  <meta http-equiv="refresh" content="0; url=pages/{页面名}.html">
</head>
<body>
  <p>跳转中… <a href="pages/{页面名}.html">点击进入 {页面名}</a></p>
</body>
</html>
```

### 多页 → 页面列表导航入口

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>extend-html 原型入口</title>
  <style>/* 简单列表样式，不引入外部资源 */</style>
</head>
<body>
  <h1>extend-html 导入页面</h1>
  <p>以下页面由存量 HTML 导入，点击进入（外部链接保持原 href 并标注「外链」）。</p>
  <ul>
    <li><a href="pages/{页面名1}.html">{页面名1}</a></li>
    <li><a href="pages/{页面名2}.html">{页面名2}</a></li>
  </ul>
</body>
</html>
```
