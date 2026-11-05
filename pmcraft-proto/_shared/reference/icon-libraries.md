# 图标库选型指南

build-prototype 生成原型时，按 PM 选择的设计风格自动匹配图标库。所有图标以本地内联 SVG 方式嵌入 HTML，零 CDN 依赖。

## 可用图标库

| 库 | 图标数 | 许可 | 风格特征 | 资产路径 |
|----|--------|------|---------|---------|
| **Tabler Icons** | 5,130 | MIT | 几何化统一，2px 描边，24×24 grid | `_shared/icons/tabler/` |
| **Bootstrap Icons** | 2,078 | MIT | 粗线稳重，企业级友好 | `_shared/icons/bootstrap/` |
| **Lucide** | 1,768 | ISC | 细线圆角，stroke 风格，24×24 | `_shared/icons/lucide/` |
| **Phosphor** | 1,512 | MIT | 中等粗细，灵活可变（regular weight） | `_shared/icons/phosphor/` |
| **Iconoir** | 1,383 | MIT | 极简线性，现代感强 | `_shared/icons/iconoir/` |
| **Feather** | 287 | MIT | 柔和圆角端点，经典极简 | `_shared/icons/feather/` |

> Phosphor 完整版含 6 种粗细（thin/light/regular/bold/fill/duotone），当前仅导入 regular weight。如需其他粗细，从 [phosphor-icons/core](https://github.com/phosphor-icons/core) 的 `assets/{weight}/` 目录补下载。

## 风格 → 图标库映射

| 设计风格 | 推荐库 | 原因 |
|---------|--------|------|
| 企业后台 / SaaS | **Tabler** | 量大面广，几何化统一，适合密集信息界面 |
| 管理后台 / 运维平台 | **Tabler** 或 **Bootstrap** | 粗线在表格和工具栏中辨识度高 |
| 极简 / 现代 / 品牌站 | **Iconoir** 或 **Feather** | 线条干净，留白感强，不抢内容 |
| Material 系 | **Bootstrap Icons** | 粗线与 Material 组件风格协调 |
| 灵活 / 不确定 | **Lucide**（默认） | 100 个图标速查已就绪，当前项目默认 |
| 移动端 App | **Feather** 或 **Lucide** | 细线在触摸屏密集 UI 中不显笨重 |

set-style 在推荐风格时一并推荐图标库，PM 可覆盖。最终选定的库记录在 `DESIGN.md` 的 YAML frontmatter 中：

```yaml
icon_library: tabler   # lucide | tabler | bootstrap | phosphor | iconoir | feather
```

## 内联用法

build-prototype 生成 HTML 页面时，从本地资产目录读取 SVG 并内联写入。

### 读取流程

```
1. 从 DESIGN.md 读取 icon_library 字段 → 确定图标库
2. 需要图标时 → 运行 node _shared/scripts/icon-get.js {lib} {图标名} → stdout 得到 SVG 正文
3. 包上 <svg class="icon icon-{size}" ...> 根标签内联写入 HTML（bundle 已去顶部注释）
4. SVG 保留 fill="none" stroke="currentColor" — 颜色跟随 CSS 变量
```

### 图标库间通用名称对照（单点维护：`_shared/icons/aliases.json`）

跨库名称映射的**唯一权威来源是 `_shared/icons/aliases.json`**（62 个常用语义 × 6 库，全部名称已与各库 `icons.json` 验证一致）。**禁止在此文档内联映射表**——历史内联表已因双写漂移产生错误（如菜单行 tabler 曾写 `menu-2`、编辑行 iconoir 曾写 `edit-pencil`），已废弃。

映射原则（示例）：

| 语义 | Lucide | Tabler | Bootstrap | Phosphor | Iconoir | Feather |
|------|--------|--------|-----------|----------|---------|---------|
| 搜索 | search | search | search | magnifying-glass | search | search |
| 用户 | user | user | person | user | user | user |
| 菜单 | menu | menu | list | list | menu | menu |
| 箭头下 | chevron-down | chevron-down | chevron-down | caret-down | nav-arrow-down | chevron-down |
| 家 | house | home | house | house | home | home |

> 完整 62 个语义映射见 `aliases.json`；需要图标时先查表得名称，再运行 `_shared/scripts/icon-get.js` 取内容（build-prototype 第八步三级查找链）。各库命名存在真实差异（如 Phosphor 的 `magnifying-glass`、Bootstrap 的 `person`/`gear`、Iconoir 的 `nav-arrow-down`/`label`），自由联想必然出错——查表是唯一确定路径。

### 缺省回退

如果指定图标在库中不存在（三级查找链：aliases.json 查名 → icon-get.js 取内容 → 相近别名，均落空）：
1. 用**虚线占位框 + 图标名**替代（`<svg>` 虚线圆角矩形 + 文字标签），标注"图标 {名称} 缺失，已使用虚线占位"
2. **禁止**用 emoji/UTF-8 符号替代功能图标——check-quality 将 emoji 报为缺陷（MEDIUM），且符号不跟随 `currentColor` 样式

## 内联 SVG 格式标准

所有库的 SVG 内联时统一处理：

```html
<svg class="icon icon-md item-icon" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round"
     stroke-linejoin="round" aria-hidden="true">
  <path d="..."/>
</svg>
```

- `class="icon"` — 统一的图标尺寸 class（见 `_common.css`）
- `stroke="currentColor"` — 颜色跟随父级 CSS
- `aria-hidden="true"` — 图标为装饰性元素，对屏幕阅读器隐藏
- `role="img"` + `<title>` — 如果图标有语义含义则添加（如操作按钮中的图标）

## 种子模板迁移

5 个种子模板从 `<i data-lucide>` + CDN 迁移为内联 `<svg>`：

### 旧写法（CDN）
```html
<script src="https://unpkg.com/lucide@latest"></script>
...
<i data-lucide="home" class="item-icon"></i>
...
<script>lucide.createIcons();</script>
```

### 新写法（内联）
```html
<svg class="icon icon-md item-icon" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2">
  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  <polyline points="9 22 9 12 15 12 15 22"/>
</svg>
```

## 图标打包（bundle）

图标源文件不直接随项目分发——每库合并为 1 个 `bundle.json`（键集与 `icons.json` 完全一致，每条记录一行），生成原型时经 `_shared/scripts/icon-get.js` 从 bundle 读取内容。**禁止直接 Read/Grep bundle.json**（tabler 包约 2MB、按行存储）。

- **`{lib}/bundle.json`** — 打包产物，随项目分发；键 = 图标名，值 = SVG 正文（打包时已剔除顶部注释）
- **`{lib}/icons.json`** — 名称索引，随项目分发；其中路径值（`svg/xxx.svg`）仅作历史记录，**读取一律走脚本**
- **svg 源文件** — 备份在项目外 `C:\dev\pmcraft\_icon\{lib}\svg\`，不随项目分发；是重新打包的唯一输入源（删除后将无法重新打包，bundle 不可逆生成）

命令：

```bash
node _shared/scripts/bundle-icons.js              # 打包全部 6 库
node _shared/scripts/bundle-icons.js tabler       # 只打指定库（更新某库后）
node _shared/scripts/bundle-icons.js --verify     # 全量校验（键集相等 + 逐条内容比对）

node _shared/scripts/icon-get.js {lib} {图标名}        # 取 SVG 正文（stdout，可直接内联）
node _shared/scripts/icon-get.js {lib} --list {子串}   # 名称模糊查
node _shared/scripts/icon-get.js --libs                # 列出 6 库及图标数
```

打包脚本源目录双路径探测：项目内 `{lib}/svg/` 存在则用之（迁移过渡期），否则读备份目录 `C:\dev\pmcraft\_icon\{lib}\svg\`。

## 下载与维护

### 当前版本（2026-08-17 更新）

| 库 | 上游版本 | 备注 |
|----|---------|------|
| Tabler | v3.46.0（2026-07-28） | outline 变体全量 |
| Lucide | 1.31.0（2026-08-09） | icons/ 目录全量 |
| Iconoir | v7.12.1（2026-08-12） | 仅 regular 变体（solid 288 个未导入） |
| Bootstrap / Phosphor / Feather | 上游自 2024-2025 年起未发版 | 本地已是最新 |

### 初始下载

每个库从 GitHub 浅克隆后提取 SVG 目录：

```bash
# 以 Lucide 为例
git clone --depth=1 --filter=blob:none https://github.com/lucide-icons/lucide.git /tmp/lucide
cp /tmp/lucide/icons/*.svg "C:\dev\pmcraft\_icon\lucide\svg\"   # 源文件放备份目录（项目外）
rm -rf /tmp/lucide
node -e "..." > _shared/icons/lucide/icons.json   # 生成映射表
node _shared/scripts/bundle-icons.js lucide       # 打包 bundle
```

### 更新图标库

1. 删除备份目录 `C:\dev\pmcraft\_icon\{lib}\svg\` 下所有 SVG
2. 重新浅克隆最新版本
3. 复制 SVG 文件到备份目录 `C:\dev\pmcraft\_icon\{lib}\svg\`
4. 重新生成 `icons.json`
5. **重新打包**：`node _shared/scripts/bundle-icons.js {lib}`（只重打该库，其余库 bundle 不受影响）
6. **重验 `aliases.json`**——上游可能改名/删除图标（实测 Lucide 曾把 `filter` 改名 `funnel`）。对更新过的库，逐条核对 aliases.json 中该库名称仍存在于新 `icons.json`；失效名称改映射或置 `null`（表示该库无此语义），并在 build-prototype 走相近别名回退

### 添加新库

1. 在备份目录 `C:\dev\pmcraft\_icon\{new-lib}\svg\` 下放入 SVG 文件
2. 生成 `icons.json`
3. 运行 `node _shared/scripts/bundle-icons.js {new-lib}` 打包（并把新库名加入 bundle-icons.js / icon-get.js 的 `LIBS` 常量）
4. 本文档的「可用图标库」表格中新增一行
5. 本文档的「风格→图标库映射」中增补推荐规则
6. set-style 的格式选项中增补 `icon_library` 可选值
