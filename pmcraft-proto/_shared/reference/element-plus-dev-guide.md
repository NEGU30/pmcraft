# Element Plus 浏览器端开发指南

> 来源：`element-plus@2.14.2` + `@element-plus/icons-vue@2.3.1` npm 包提取，官方文档站不可达时的本地参考。
> 覆盖版本：Element Plus 2.x + Vue 3（注意：`locale/zh-cn.min.js` 取自 `element-plus@2.14.4`，语言包为纯数据文件、跨 patch 兼容，其余 vendor 文件均为 2.14.2）
> 
> **注意**：本指南针对 Element Plus 场景。非 Element Plus 的参考资源包（如自定义 CSS/字体/图标）走 extract-design 自动提取流程（→ `design-reference.md` 资源清单 → build-prototype 按清单引用）。

---

## 一、浏览器端加载方式

### 必需文件

| 文件 | 来源 | 用途 |
|------|------|------|
| `vue.global.prod.js` | 项目离线包 `assets/vendor/element-plus/`（**本地副本，已随插件分发**） | Vue 3 运行时（v3.5.x，~166KB） |
| `index.css` | 项目离线包 `assets/vendor/element-plus/` | 所有组件样式 |
| `index.full.min.js` | 项目离线包 `assets/vendor/element-plus/` | 完整组件库（UMD IIFE，~1MB） |
| `icons-global.iife.min.js` | 项目离线包 `assets/vendor/element-plus/` | 图标库（全局 IIFE，~215KB） |
| `zh-cn.min.js` | 项目离线包 `assets/vendor/element-plus/locale/`（**已随插件分发**） | 中文语言包 |

### HTML 引入示例（全部本地路径，禁止 unpkg/CDN）

```html
<link rel="stylesheet" href="assets/vendor/element-plus/index.css">
<script src="assets/vendor/element-plus/vue.global.prod.js"></script>
<script src="assets/vendor/element-plus/index.full.min.js"></script>
<script src="assets/vendor/element-plus/icons-global.iife.min.js"></script>
<script src="assets/vendor/element-plus/locale/zh-cn.min.js"></script>
```

> **优先级规则**：本地 vendor > 项目 vendor > npm 下载 > CDN 回退。不允许在 vendor 齐全的情况下走 CDN。Vue 3 运行时已有本地副本，**页面一律走本地路径**。

---

## 二、组件注册

### Element Plus 组件

`index.full.min.js` 在 `window.ElementPlus` 下暴露所有组件、指令和服务。使用 `app.use()` 一次性安装：

```js
const app = createApp({ /* ... */ })
app.use(ElementPlus)           // 安装所有组件（约85个） + 指令（InfiniteScroll/Loading/Popover） + 服务（Message/MessageBox/Notification）
app.mount('#app')
```

也可按需注册单个组件：

```js
app.component('ElButton', ElementPlus.ElButton)
```

### Element Plus 图标

`icons-global.iife.min.js` 在 `window.ElementPlusIconsVue` 下暴露所有图标组件（`PascalCase` 对象键）。**IIFE 不会自动注册**，必须手动遍历注册：

```js
for (const [, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(comp.__name, comp)  // __name 即 kebab-case 组件名
}
```

注册后模板中使用 kebab-case：

```html
<el-icon><home-filled></home-filled></el-icon>
<el-icon><search></search></el-icon>
<el-icon size="14"><edit></edit></el-icon>
```

**禁止自闭合**：`<home-filled />` 在 DOM 模板中无效，必须 `<home-filled></home-filled>`。

### 中文语言包

```html
<script src="assets/vendor/element-plus/locale/zh-cn.min.js"></script>
<script>
  app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })
</script>
```

---

## 三、DOM 模板约束

Vue 3 通过 `<script>` 标签直接引入时，模板写在 HTML 的 `<div id="app">` 中，由浏览器原生 HTML 解析器处理后再交给 Vue 编译。这带来了三个关键约束：

### 3.1 自定义组件必须成对闭合

```html
<!-- ❌ 错误：自闭合，浏览器解析后嵌套混乱 -->
<el-table-column label="名称" prop="name" />

<!-- ✅ 正确：成对闭合 -->
<el-table-column label="名称" prop="name"></el-table-column>
```

此规则适用于所有非原生 HTML 元素：`el-table-column`、`el-option`、`el-menu-item`、图标组件等。

### 3.2 表格相关约束

- 表格父容器**不得**设置 `overflow-x: hidden`，否则 `el-table` 列宽计算异常
- `fixed="right"` 要求表格和列均有明确 `width`，否则改用不固定列
- 全局 `box-sizing: border-box` 不能排除 `el-table` 内部元素

### 3.3 HTML 标签冲突

部分图标组件名与原生 HTML 元素同名。浏览器解析时会把它们当原生元素，Vue 无法识别为自定义组件：

| 图标名 | HTML 元素 | 替代方案 |
|--------|----------|---------|
| `Link` | `<link>` | 换用 `Connection` |
| `Style` | `<style>` | 换用其他图标 |
| `Script` | `<script>` | 换用其他图标 |
| `Title` | `<title>` | 换用其他图标 |

---

## 四、组件使用规范

### 4.1 表单

表单字段必须用 `el-form` + `el-form-item` 包裹。inline 排列时用 `el-form inline`：

```html
<el-form :model="form" inline>
  <el-form-item label="域名">
    <el-select v-model="form.domain" .../>
  </el-form-item>
  <el-form-item label="路径">
    <el-input v-model="form.path" .../>
  </el-form-item>
  <el-form-item>
    <el-button type="primary">查询</el-button>
  </el-form-item>
</el-form>
```

**禁止**用裸 `<div>` 包裹表单控件替代 `el-form-item`——会丢失标签对齐、校验反馈等框架能力。

### 4.2 按钮间距

`el-button` 自带内置 margin。同一容器内并排放多个按钮时，**不要**在容器上加 flex `gap`，否则间距双倍叠加。改用单按钮 `margin-left`：

```html
<!-- ❌ 错误：gap + 内置 margin = 双倍间距 -->
<div style="display:flex;gap:12px">
  <el-button>查询</el-button>
  <el-button>重置</el-button>
</div>

<!-- ✅ 正确 -->
<span>
  <el-button>查询</el-button>
  <el-button style="margin-left:12px">重置</el-button>
</span>
```

### 4.3 表格文本 + 操作并列

表格列中长文本与操作按钮（如复制）并排时，用 flex 布局让文本自动换行、按钮始终可见：

```html
<div style="display:flex;align-items:flex-start;gap:4px">
  <span style="flex:1;min-width:0;word-break:break-all">{{ longText }}</span>
  <button style="flex-shrink:0">复制</button>
</div>
```

**禁止**用 `show-overflow-tooltip` 截断文本——按钮会被挤出可视区。

### 4.4 多卡片布局一致性

同一页面内多张卡片（如"生成表单"+"搜索列表"）必须使用相同布局模式：全部 `el-form inline` 或全部纯 flex，字段与按钮同行/分行规则也必须一致。

### 4.5 存量场景通用组件

如果 `prototype/working/framework/` 存在，优先沿用源码的通用组件约束。例如 IMS 系统要求使用 `SearchCard` / `ResultTable` / `FormBlock` / `Pagination`，**禁止**在页面中自建搜索/表格/分页逻辑。

---

## 五、完整组件速查

Element Plus 2.14.2 包含约 85 个组件（PascalCase → kebab-case 映射）：

| 分类 | 组件 | 模板名 |
|------|------|--------|
| 布局 | Row, Col, Container, Header, Aside, Main, Footer | `el-row`, `el-col`, `el-container`... |
| 表单 | Form, FormItem, Input, InputNumber, Select, Option, Cascader, DatePicker, TimePicker, Checkbox, Radio, Switch, Slider, Rate, Upload, Transfer | `el-form`, `el-input`... |
| 数据 | Table, TableColumn, Pagination, Tag, Progress, Tree, Badge, Empty, Result, Descriptions, Statistic | `el-table`... |
| 导航 | Menu, MenuItem, SubMenu, Tabs, TabPane, Breadcrumb, PageHeader, Steps, Dropdown | `el-menu`... |
| 反馈 | Dialog, Drawer, Message, MessageBox, Notification, Popover, Popconfirm, Tooltip, Loading | `el-dialog`... |
| 其他 | Button, Icon, Link, Card, Divider, Collapse, Scrollbar, Backtop, Affix, Anchor, Calendar, Avatar, Image, Watermark | `el-button`... |

完整列表：`ElAffix, ElAlert, ElAutocomplete, ElAutoResizer, ElAvatar, ElAvatarGroup, ElBacktop, ElBadge, ElBreadcrumb, ElBreadcrumbItem, ElButton, ElButtonGroup, ElCalendar, ElCard, ElCarousel, ElCarouselItem, ElCascader, ElCascaderPanel, ElCheckTag, ElCheckbox, ElCheckboxButton, ElCheckboxGroup, ElCol, ElCollapse, ElCollapseItem, ElCollapseTransition, ElColorPicker, ElConfigProvider, ElContainer, ElAside, ElFooter, ElHeader, ElMain, ElDatePicker, ElDescriptions, ElDescriptionsItem, ElDialog, ElDivider, ElDrawer, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty, ElForm, ElFormItem, ElIcon, ElImage, ElImageViewer, ElInput, ElInputNumber, ElInputTag, ElInputOtp, ElLink, ElMenu, ElMenuItem, ElMenuItemGroup, ElSubMenu, ElPageHeader, ElPagination, ElPopconfirm, ElPopover, ElPopper, ElProgress, ElRadio, ElRadioButton, ElRadioGroup, ElRate, ElResult, ElRow, ElScrollbar, ElSelect, ElOption, ElOptionGroup, ElSelectV2, ElSkeleton, ElSkeletonItem, ElSlider, ElSpace, ElStatistic, ElCountdown, ElSteps, ElStep, ElSwitch, ElTable, ElTableColumn, ElTableV2, ElTabs, ElTabPane, ElTag, ElText, ElTimePicker, ElTimeSelect, ElTimeline, ElTimelineItem, ElTooltip, ElTransfer, ElTree, ElTreeSelect, ElTreeV2, ElUpload, ElWatermark, ElTour, ElTourStep, ElAnchor, ElAnchorLink, ElSegmented, ElMention, ElSplitter, ElSplitterPanel`

---

## 六、项目离线包文件结构

```
_shared/vendor/element-plus/
├── VERSION                      ← 版本号（如 2.14.2）
├── index.css                    ← 组件样式（357KB）
├── index.full.min.js            ← 组件库 UMD IIFE（1,039KB）
├── icons-global.iife.min.js     ← 图标库全局 IIFE（215KB）
├── vue.global.prod.js           ← Vue 3 运行时本地副本（166KB）
└── locale/
    └── zh-cn.min.js             ← 中文语言包
```

---

## 七、与 element-plus-pitfalls.md 的关系

| 本文 | element-plus-pitfalls.md |
|------|--------------------------|
| 怎么用对（best practices） | 怎么不踩坑（bug-avoidance） |
| 加载方式、注册机制、组件规范 | 自检 checklist（自闭合、gap、fixed 等） |

生成前先读 pitfalls 做自检，遇到不确定的用法再查本文。
