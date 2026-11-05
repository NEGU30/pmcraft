# 可视化讲解细则（"做成网页"/"画个图讲"）

> 触发：用户说 "做成网页" / "画个图讲" / "给我个可视化的" / "做个图解释" 等。
>
> 视觉基准取自官方范例集 `anthropics/html-effectiveness`（20 个成品 HTML，其中 `15-research-concept-explainer.html` 是概念讲解、`10-svg-illustrations.html` 是 SVG 插图）。第 1 节的令牌是那批范例逐位核对过的公共值——8 个文件的 `--clay/--ivory/--slate/--oat/--olive` 十六进制完全一致。

## 三条核心约束

1. **零背景读者锚点**：这张卡是给一个完全不懂这话题的人看的。零背景不等于零智商——术语照杀，句子照短，但内容不幼稚化。
2. **单文件 HTML 载体**：内联 CSS + 内联 SVG + 内联 JS（若需交互），禁外部 CSS/JS/CDN/框架（沿用 extend-html R2/R4 纪律）。断网、换电脑、发给别人，双击都能看。**字体走系统栈，不引 Web 字体**——官方范例证明零外链照样有层次，层次靠栈的分工，不靠字体文件。
3. **图多字少**：默认 **2–3 个视觉块**（概念图 + 对比图 + 流程/结构图），不是"1 幅主视觉 + 两段文字"。画关系（流程/对比/结构），不画装饰。每个视觉块文字 ≤2 短句。

## 1. 设计令牌（内联进每张卡的 `:root`，禁自创配色）

```css
:root{
  --ivory:#FAF9F5;  --slate:#141413;  --clay:#D97757;  --oat:#E3DACC;  --olive:#788C5D;
  --gray-150:#F0EEE6; --gray-300:#D1CFC5; --gray-500:#87867F; --gray-700:#3D3D3A;
  --serif:ui-serif,Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
```

- 页面底色 `--ivory`，正文 `--gray-700`，标题 `--slate`。**不用纯黑 `#000` / 纯白 `#fff` 做文字或底**
- 面板/侧栏等表面用 `#fff`（压在 ivory 上形成层次，这是范例做法）
- `--clay` 是**唯一强调色**，只出现在三处：关键节点、`.term` 虚线、控件 `accent-color`。整页不超过一个强调色
- `--olive` 表"对/好"，暗红 `#B04A3F` 表"错/差"，仅用于对比表格的 `td.good` / `td.bad`
- **卡片背景一律 `--ivory`**。辨识度靠图，不靠换配色

## 2. 字体三栈分工（层次的第一来源）

| 用途 | 栈 | 规格 |
|:---|:---|:---|
| 大标题 h1 | `--serif` | 33px / weight 500 / `letter-spacing:-.01em` / `--slate` |
| 小节标题 h2 | `--serif` | 22px / weight 500 / `--slate` / 上边距 40px |
| 正文 p | `--sans` | 15px / `line-height:1.65` / `--gray-700` / `max-width:680px` |
| 导语 .lead | `--sans` | 14px / `--gray-700` / `max-width:640px` |
| 眉标 .eyebrow | `--mono` | 11px / `letter-spacing:.08em` / `text-transform:uppercase` / `--gray-500` |
| 表头 th | `--mono` | 11px / `letter-spacing:.06em` / uppercase / `--gray-500` / weight 500 |
| 数值/状态 | `--mono` | 12px |

**关键：层次靠切换字体族 + mono 大写字距，不靠放大字号。** 不要全页一个 sans、一档字号铺到底——那是平的根因。也不要为了"字大"把正文顶到 20px 以上。

## 3. 布局：两栏 + sticky 侧栏

```css
.page{max-width:1100px;margin:0 auto;display:grid;
      grid-template-columns:minmax(0,1fr) 240px;gap:48px}
body{background:var(--ivory);color:var(--gray-700);font-family:var(--sans);
     font-size:15px;line-height:1.65;padding:56px 24px 120px;
     -webkit-font-smoothing:antialiased}
aside{position:sticky;top:32px;align-self:start;background:#fff;
      border:1.5px solid var(--gray-300);border-radius:12px;padding:18px 18px 8px}
@media (max-width:960px){.page{grid-template-columns:1fr}aside{order:2;position:static}}
```

左栏 [概念图 / 定义 / 对比 / 场景]，右栏 sticky：**glossary（术语表）+ 一句话版本 + 邻居概念**。
移动端塌成单栏，侧栏排到正文之后。

## 4. 术语出口：`.term` + 侧栏 glossary

```css
.term{border-bottom:1.5px dotted var(--clay);cursor:help;color:var(--slate)}
```

第 5 层规则 2「杀术语」的**唯一例外**：某词实在替换不掉（"环"、"检索"、"哈希"这类专业概念的核心词），**保留它，但必须双挂**——

1. 正文/图内的该词包成 `<span class="term" data-term="ring">环</span>`
2. 侧栏 glossary 里有对应条目 `<dt data-g="ring">环</dt>` + 一句白话 `<dd>`

这是"保留 + 虚线标注 + 侧栏随时查"，不是"留着不解释"。**能替换的词仍然必须替换**，`.term` 只兜底。

> 注意：本细则**解除**此前"图上每个词也受杀术语约束"的硬约束——那条会把图注压到 11px 还不敢写字。图内文字与正文同一把尺子指的是**白话程度**，不是禁止出现专业词；出现即挂 `.term`。

## 5. 可动控件（关键概念必须有一个）

官方 `15-research-concept-explainer` 不是静态图：SVG 环 + 两个 `<input type=range>`（nodes 2–8 / keys 10–60）+ 三个按钮（add / remove / reset）+ 实时 readout，SVG 属性带 `transition`。

**讲一个概念，让人动一下比画一张更有效。** 概念天然带"可调参数"时（数量 / 规模 / 层级 / 开关 / 前后对比），配一个滑块或按钮，用 20–40 行原生 JS，不引框架。参数不明显的概念（如"什么是哈希"）可以省，但对比/流程类概念默认要有。

```css
.controls input[type=range]{accent-color:var(--clay)}
.ring .node{transition:cx 300ms,cy 300ms,opacity 200ms}
```

## 6. 页面结构（必备最小集，非固定骨架）

```html
<div class="page">
  <main>
    <div class="eyebrow"><!-- 分类 · 类型 --></div>
    <h1>[概念]，[一句钩子]</h1>
    <p class="lead">[零背景读者的问题：为什么这事值得看]</p>
    <h2>[类比的标题]</h2>  <p>…</p>
    <div class="demo">…</div>          <!-- 视觉块 1：类比主视觉 / 可动控件 -->
    <h2>[对比的标题]</h2>              <!-- 视觉块 2：对比表格，td.bad / td.good -->
    <h2>[在哪会遇到]</h2>              <!-- 视觉块 3：用户视角场景 -->
  </main>
  <aside><div class="label">Glossary</div><dl>…</dl></aside>
</div>
```

必备：**eyebrow + h1 + lead + 侧栏 glossary + 一句话版本**。
不做固定五格。视觉块按概念需要增补到 2–3 个，`h2` 标题用类比语言写（"把钥匙放圆圈上，而不是排一队"），不用"它实际是什么"这类标签式小标题。

**顺序仍然受第 5 层规则 1 约束：类比先行。** 第一个 `h2` 必须是类比，定义放在类比之后。

## 7. 输出前 AI 味门禁（与 SKILL.md 步骤 5 的 6 条并列过一遍）

1. 有没有用纯黑 `#000` / 纯白 `#fff` **做文字或底**？→ 换 `--slate` / `--ivory`（面板/侧栏表面的 `#fff` 是第 1 节规定的例外，不在此列）
2. 有没有全页一个 sans、一档字号？→ 上三栈 + mono 眉标
3. 有没有用大圆角 + 通用投影？→ 去掉（原话：*safe, forgettable, could be any AI output*）
4. 有没有居中一切、同间距铺满？→ 改左对齐 + 变间距
5. 有没有暗底青 / 紫蓝渐变 / 霓虹？→ 禁
6. 有没有自创配色？→ 回第 1 节令牌
7. **终检**：如果告诉别人"这是 AI 做的"，对方会立刻信吗？会 → 返工

## 8. 强度分级

| 强度 | 页面 |
|:---|:---|
| 🌱 新人 | 3 个视觉块（概念图 + 邻居概念图 + 对比）；侧栏 glossary 条目更全；控件可省 |
| 🌿 进阶（默认） | 2–3 个视觉块 + 1 个可动控件；侧栏 glossary + 一句话版本 |
| 🌳 实战 | 1 屏：1 个视觉块 + 一句话版本；侧栏只留 glossary |

## 9. 规则

1. **至少 2 个视觉块**（进阶及以上）——全文字卡片不合格，单图 + 两段字同样不合格。画不出来 → 说明概念还没被讲透，回到类比重想。
2. **图内事实同受 accuracy-rules 约束**：数字/时间/公司查不到就不画或标"不确定"，绝不编造——**图里画错的事实传得比讲错的话远**。
3. **图内标签同受白话约束**：能用白话就用白话；非用专业词不可时挂 `.term` + glossary（见第 4 节）。
4. **文件名净化**：概念名含 Windows 非法字符（`/ \ : * ? " < > |`）替换为 `_`，落 `$MEM_DIR/cards/{概念}.html`。
5. **同概念覆盖更新**：已学过的概念重做卡片 → 直接覆盖旧文件，不建序号、不建索引（`_concepts.md` 条目即索引）。
6. **落盘前 Guard-Chat purify**：`structure_safe=false` 时按原文处理，不破坏 HTML 标签。
7. 输出前过门禁：SKILL.md 步骤 5 的 6 条 + 本细则第 7 节的 7 条，两遍都过。

## 触发生成与落盘

生成前先建目录：

```bash
MEM_DIR="$HOME/.claude/user-data/pmcraft-coach"
mkdir -p "$MEM_DIR/cards"
```

卡片写入 `$MEM_DIR/cards/{概念}.html`（概念名为空的极端情况用 `untitled` 兜底）。

- 讲解请求自带「做成网页」（如"讲讲 RAG 做成网页"）→ 讲完直接生成，不再问一次。
- 讲解完成后说「做成网页」→ 用已讲内容直接生成，不重讲。
- 生成后告知卡片路径，一行即可，不追加推销。
