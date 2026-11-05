# Element Plus 原型生成 Checklist

> 在写第一行代码之前，逐条执行以下检查。每条都对应一次实际踩过的坑。
> 
> **配套文件**：`element-plus-dev-guide.md` — 怎么用对（加载方式、注册机制、组件规范），本文专注怎么不踩坑。

---

## 一、本地素材扫描与补齐

### Element Plus 素材

1. 扫描 `_shared/vendor/element-plus/`（pmcraft-proto 插件离线包目录，VERSION 文件标记版本号）：
   - `index.css` — Element Plus 样式
   - `index.full.min.js` — Element Plus 组件库
   - `icons-global.iife.min.js` — Element Plus 图标库（全局 IIFE，带 `ElementPlusIconsVue` 全局变量）
   - `vue.global.prod.js` — Vue 3 运行时（本地副本，v3.5.x，~166KB）
   - `locale/zh-cn.min.js` — 中文语言包
2. 如果缺文件 → 通过 `npm install` 下载对应的 npm 包，提取所需文件到 vendor 目录，清理 npm 临时文件（`node_modules`、`package.json` 等）。
3. 将 vendor 目录完整复制到 `prototype/working/assets/vendor/element-plus/`（**全部 5 个文件**）。
4. Vue 3 运行时已有本地副本 → 页面走本地 `assets/vendor/element-plus/vue.global.prod.js`，**禁止 unpkg CDN**。

### 外来资源包

如果 `prototype/working/assets/vendor/` 下有非 element-plus 的子目录（extract-design 从参考材料中提取），也一并扫描：

1. 读取 `prototype/reference/design-reference.md` 的「资源清单」章节。
2. 按资源清单中的路径，将对应的 `<link>` / `<style>` / `@font-face` / `<img>` 声明注入页面。
3. **约束级别**：清单顶部标注了"强制"或"可选"。
   - 强制 → 必须逐一引入所有资源
   - 可选 → 以 DESIGN.md 为准，资源清单仅作参考，可自行决定是否引用

---

## 二、本地素材优先原则

| 资源 | 来源 |
|------|------|
| Element Plus 组件 | 本地 `assets/vendor/element-plus/index.full.min.js` |
| Element Plus 样式 | 本地 `assets/vendor/element-plus/index.css` |
| Element Plus 图标 | 本地 `assets/vendor/element-plus/icons-global.iife.min.js` |
| Vue 3 运行时 | 本地 `assets/vendor/element-plus/vue.global.prod.js`（已随插件分发） |
| 中文语言包 | 本地 `assets/vendor/element-plus/locale/zh-cn.min.js`（已随插件分发） |

优先级：本地 vendor > 项目 vendor > npm 下载 > CDN 回退。不允许在 vendor 齐全的情况下走 CDN。

---

## 三、图标系统确认

1. 如果存量场景 → 读取 `prototype/reference/design-reference.md` 的「图标风格」章节，确定源码用的图标库。
2. 如果源码用 Element Plus Icons → 检查 `icons-global.iife.min.js` 已就绪 → 通过 `ElementPlusIconsVue` 全局变量手动注册（`icons-global.iife.min.js` 的 `__name` 属性即 kebab-case 名称，如 `comp.__name === 'home-filled'`）。
3. 禁止用 emoji 代替功能图标（✅❌📋✓ 等一律不行）。
4. 禁止用 Lucide CDN 代替 Element Plus Icons（两个图标库视觉效果不同，存量场景下混用会导致风格不一致）。
5. 图标组件在 DOM 模板中用 kebab-case：`<home-filled></home-filled>`，**禁止自闭合**。

### HTML 标签冲突警告

部分图标名与原生 HTML 元素同名，Vue 浏览器端编译时会把它们解析为原生元素而非自定义组件，图标显示为空：

| 图标名 | HTML 元素 | 影响 |
|--------|----------|------|
| `Link` | `<link>` | 图标空白 |
| `Style` | `<style>` | 图标空白 |
| `Script` | `<script>` | 图标空白 |
| `Title` | `<title>` | 图标空白 |

选图标时对照此表避开。已知 `Link` 换 `Connection`。

---

## 四、Element UI 约束自检

- [ ] `el-table-column` 全部成对闭合 `</el-table-column>`，无自闭合 `/>`
- [ ] 表格父容器无 `overflow-x: hidden`
- [ ] `fixed="right"` 仅当表格和列均有明确 width 时才用，否则去固定列
- [ ] 全局 `box-sizing: border-box` 不排除 el-table 内部
- [ ] Element Plus 按钮自带内置 margin，容器勿叠 flex `gap`（间距 = gap + 内置 margin = 双倍）。用单个按钮 `margin-left` 控间距

---

## 五、设计令牌自检

- [ ] 所有颜色值来自 design-system.css 的 CSS 变量（`var(--color-*)`），无硬编码 hex
- [ ] 字体来自 design-system.css 的 `var(--font-*)`
- [ ] 圆角、间距、阴影来自 design-system.css（`var(--radius-*)`、`var(--space-*)`、`var(--shadow-*)`）
- [ ] 同一页面内多张卡片（如"生成表单"卡片 + "搜索列表"卡片）必须使用相同的布局模式（全部 `el-form inline` 或全部纯 flex），表单字段与操作按钮同行/分行规则也必须一致

---

## 六、表格文本 + 操作并列规则

表格列中同时包含长文本和操作按钮（如短链 + 复制、路径 + 复制）时：

- 容器用 `display:flex; align-items:flex-start` 布局
- 文本 `flex:1; min-width:0; word-break:break-all` 自动换行
- 按钮 `flex-shrink:0` 始终可见

**禁止**用 `show-overflow-tooltip` 截断文本导致按钮被挤出可视区。
