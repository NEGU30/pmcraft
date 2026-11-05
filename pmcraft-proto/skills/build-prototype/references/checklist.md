# Proto-builder 生成质量自检清单

每次生成/编辑页面后执行。P0 = 必须通过；P1 = 应该通过；P2 = 加分项。

## P0 — 必须通过

- [ ] **无裸色值**：所有 `color`/`background`/`border-color` 均为 `var(--color-*)` 或 `color-mix()` 派生。grep `#[0-9a-fA-F]{3,8}` 在页面文件内（`<style>` 块外和块内）应返回空。
- [ ] **所有 CSS class 来自种子**：页面中的每个 class 必须存在于对应平台的种子模板 `../assets/seeds/{platform}.html` 或 `../../../_shared/_common.css` 中。无凭空创建的全局 class。
- [ ] **引用 design-system.css**：每个页面 `<link rel="stylesheet" href="../design-system.css">` 路径正确（页面位于 `prototype/working/pages/`，`../` 指向 working/ 根目录下的 design-system.css）。
- [ ] **`[REPLACE]` 占位符全部替换**：grep `\[REPLACE\]` 在页面文件内应返回空。
- [ ] **页面导航连通**：所有链接/按钮指向的页面均存在（单页应用除外）。
- [ ] **每页至少 2 个状态**：默认状态 + 至少一个（空数据/加载中/错误/成功）。
- [ ] **内联 SVG 图标正常渲染**：所有图标为 `<svg class="icon">` 内联元素，无 `<i data-lucide>` 或 CDN 依赖，无 emoji 用作功能图标。
- [ ] **图标尺寸符合场景**：按钮/输入框图标用 `icon-sm`，导航/工具栏用 `icon-md`，空状态用 `icon-lg`；无 `icon-xl`/`icon-2xl` 滥用（非登录页品牌/主 KPI 等明确场景）。
- [ ] **framework/ 覆盖正确**（如适用）：存在 `prototype/working/framework/` 时，种子 chrome 被跳过，`_common.css` 组件样式保留。
- [ ] **按钮形态对照组件规格**：主操作按钮显式 `border-radius: var(--radius-lg)`（胶囊），次操作按钮 `var(--radius-md)`（小圆角矩形）。**禁止依赖 `.btn` 默认值或自创数值**——`.btn` 基础圆角是 `var(--radius-md, 6px)`，主按钮的胶囊规格只存在于 DESIGN.md Components 章节（文字契约），必须显式引用 `--radius-lg` 落实。生成时对照 DESIGN.md Components 逐项核对（圆角/高度/颜色/层级），grep `border-radius` 确认每个按钮都有显式令牌引用。
- [ ] **可交互元素带 id**：所有 `button`/`a`/`input`/`select`/`textarea` 均有语义化 id（如 `smsLoginBtn`、`agreeCheck`）。id 是标注层锚点与自动化测试定位的基础——无 id 时标注只能退锚 `page`、测试只能靠文本定位。grep `<(button|a|input|select|textarea)\b(?![^>]*\bid=)[^>]*>` 应返回空。

## P1 — 应该通过

- [ ] **按钮层级正确**：每屏至多 1 个 primary，其余用 secondary/ghost/danger。
- [ ] **触屏点击区域 ≥ 44px**（移动端）：移动平台所有交互元素 `min-height` ≥ 44px（或通过 padding 达到）。
- [ ] **无 emoji 做功能图标**：用内联 SVG 图标（经 `_shared/scripts/icon-get.js` 从 `../../../_shared/icons/` bundle 取），不用 ✨🚀🎯 等。
- [ ] **表单有 label**：所有 `<input>`/`<select>`/`<textarea>` 有关联 `<label>`。
- [ ] **表格列头对齐正确**：`.num-col` 用于数值列（右对齐），`.col-actions` 用于操作列。
- [ ] **页面标题与 page-inventory.md 一致**：`<title>` 和 `.page-title` 匹配 page-inventory 中的页面名。
- [ ] **焦点样式存在**：`:focus-visible` 样式在按钮和输入框上可见。

## P2 — 加分项

- [ ] **Hover 状态**：所有 `.btn` 和 `a` 有 hover 样式（种子已覆盖）。
- [ ] **空状态引导行动**：空状态不只是"暂无数据"，包含下一步操作的 CTA。
- [ ] **无 card 嵌套 card**：不使用 `.card` 内嵌 `.card`。
- [ ] **过渡动画 150-300ms**：所有 `transition` 时长在此范围内。
- [ ] **`text-wrap: pretty/balance`**：长文本和标题已应用（种子已覆盖）。

## Anti-slop 快速扫视

看页面两秒，如果感觉：

- "这配色/排版和之前生成的完全一样 — 像是个模板" → 好的，这就是模板。种子确保了质量一致性。
- "有个 class 不在种子里但被用了" → 回到种子补充，或在页面 `<style>` 中添加并记录到 `feedback.md`。
- "按钮颜色不对 / 卡片间距奇怪" → 检查 `design-system.css` 对应的 token 值，种子只是引用者。
