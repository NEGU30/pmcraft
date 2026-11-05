---
name: setup-tests
description: >
  当需要为 Web 自动化测试生成可执行的 Playwright 测试脚本与数据文件时使用。
  从项目的 PRD 和测试用例出发，自动探索页面 DOM、生成脚本与数据、完成断言覆盖检查与阻塞预检。
  可由 pmcraft 路由大脑自动串联调用（完整测试流程入口），也可单独使用。
type: skill
argument-hint: 无参数
tags:
  - 测试脚本生成
  - Playwright
  - test
  - setup
  - test-generation
  - automation
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Skill, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_press_key, mcp__playwright__browser_wait_for, mcp__playwright__browser_run_code_unsafe]
prompt: 跑测试|验收测试|自动化测试|重新生成脚本|setup-tests
dependencies:
  - Node.js（LTS，脚本层与 Playwright 运行所需）
  - Playwright CLI + @playwright/test 包（Phase 1 内联检测）
  - 浏览器引擎：Playwright Chromium 或本地 Chrome（Phase 1.1 检测，未安装时询问 PM 安装）
  - Playwright MCP（页面侦察/数据预采集/auth 探测的 browser_run_code_unsafe 依赖；Phase 1 环境预检内联检测）
---

# setup-tests — 测试前准备

## 路径约定

- **版本目录**：pmcraft 自动从 cwd 向上查找 `[Vv]?\d+\.\d+\.\d+` 版本目录，本技能在其下工作
- **测试域根**：`{版本目录}/e2e/`（与 `brief/`、`prd/`、`testcase/` 并列）
- **本技能源码目录**：当前 SKILL.md 所在目录（`.../pmcraft-test/skills/setup-tests/`）
- **插件根目录**：从本 SKILL.md 向上 2 级（`../../` → `pmcraft-test/`）
- **用户数据根**：`%USERPROFILE%\.claude\user-data`（Bash 下 `$HOME/.claude/user-data`，路径一律写正斜杠）
- **用户级累积 traps**：`{用户数据根}/pmcraft-test/traps.json`（PM 确认的跨项目通用累积经验，升级不覆盖；本技能目录下**无** traps.json——已知陷阱内嵌本 SKILL.md"工厂陷阱（内置）"章节，用户累积全部外置）

## 概述

从项目中发现并自动选择 PRD 和测试用例（多份时 PRD 取 E 编号最大、测试用例取高质量中 E 编号最大；无高质量先补生成），经 PM 确认后用选中的文档分析被测页面 DOM 结构，生成可执行的 Playwright 脚本与数据文件（数据与脚本分离），并完成阻塞预检。

## 输入

| 参数 | 来源 |
|------|------|
| 项目路径 | Phase 0 询问用户 |
| 功能名称 | `.feature-name` 文件 |
| 版本号 | 版本目录名（取最大） |
| PRD | `{版本}/prd/` 下 E 编号最大的 PRD（选择规则见 Phase 0 步骤 5） |
| 测试用例 | `{版本}/testcase/` 下高质量中 E 编号最大的一份；无高质量先调用 pmcraft-req:generate-testcase 补生成（选择规则见 Phase 0 步骤 5） |
| 目标 URL | Phase 0 询问用户 |

---

## 加载地图

| 文件 | 加载时机 | fallback |
|------|---------|----------|
| `references/selector-lib-template.ts` | Phase 3.3 生成 selector-lib.ts 时 | 依据 page-map.json 自行构建同结构模板 |
| `references/spec-template.ts` | Phase 3.5/3.6 生成脚本时 | 依据"模板骨架关键结构"清单自行构建同构模板 |
| `references/page-recon-snippets.md` | Phase 3.3 页面侦察（c 步一体化 payload / e 步 auth）时；Phase 3.6 步骤 1 数据预采集（第 3 节一体化 payload）时 | 依据文中规则自行实现同构 MCP 代码 |
| `references/gate-check-commands.md` | Phase 3.7 机械检查时（P0-1/2/3/10 grep 命令） | 依据文中规则自行构建等价检查命令 |
| `assets/scripts/gate-check.cjs` | Phase 3.7 P0-8 trap 复发检查时（node 直接执行） | 脚本缺失时依据 gate-check-commands.md 规则自行构建等价检查命令 |

---

## Phase 0：确认项目路径 & 探索

1. **读取项目配置**（`$PRJ/$VER/e2e/config.json`，跨时间戳共享）：
   - 若存在 → 读取并展示摘要（projectPath / targetUrl / featureName / version），询问 PM："检测到已保存的项目配置：{摘要}。是否沿用？① 沿用（跳过下列询问） ② 修改（重新询问对应单项）"
   - 若不存在 → 执行下列询问流程（步骤 2-8），完成后写入 config.json（步骤 9）
2. **询问项目路径**（如未提供）→ "请提供项目路径（如 C:\\dev\\ToolBox\\1.0.0 或 ./）："
3. **切换到项目路径**
4. **读取 `.feature-name`** → 功能名称。如不存在，从项目顶层目录名推断并自动创建。
5. **扫描并选择输入文件**（从项目路径即版本目录执行，多层兜底）：

   **5a. 扫描**（按优先级逐级尝试，命中即停）：
   - 优先级 1：Glob `prd/*.md` + `testcase/*`（标准结构）
   - 优先级 2：Glob `*/prd/*.md` + `*/testcase/*`（一层嵌套）
   - 优先级 3：根目录 `*需求文档*.md` + `*测试用例*.md`（松散存放）
   - 优先级 4：用户手动指定文件路径（跳过下方自动选择，直接使用指定文件）

   **5b. 多份文件选择规则**（优先级 1-3 命中后执行）：
   - **文件分类**：规范命名文件（匹配 `*_PRD_E(\d+).md` 或 `*_测试用例(_中|_高)?_E(\d+).md`，`_中`/`_高` 为质量后缀，无后缀 = 标准）、规范命名的拆分文件（匹配 `*_测试用例*E(\d+).md` 但不属于三套标准序列的差集，如模块名插入式 `*_测试用例_{模块名}_高_E(\d+).md`，口径同 save-doc 第五阶段步骤 6 兜底组）与非规范命名文件（不匹配，如手放的《需求文档.md》）。规范文件存在时忽略非规范文件并提示："检测到 {N} 个非规范命名的文档文件（{文件名列表}），已忽略。"；拆分文件属规范命名，不提示忽略，但**不参与下方选择**；仅存在非规范文件时展示清单让 PM 手动选。
   - **PRD 选择**：取 `prd/` 下匹配 `*_PRD_E(\d+).md` 中 **E 编号最大**的一份（最新定稿）。
   - **测试用例选择**：取 `testcase/` 下匹配 `*_测试用例_高_E(\d+).md` 中 **E 编号最大**的一份（高质量序列最新修订）；若无任何高质量文件（存量项目旧流程产物）→ 先调用 `Skill(pmcraft-req:generate-testcase)`（不带 `--quality`，默认 both 产出中+高两份）补生成 → 再取高质量。标准/中质量序列不参与选择（E 编号三套独立，跨质量不可比）。**拆分文件（模块名插入式）同样不参与选择**——内容与汇总版重复，消费会造成脚本重复生成；testcase/ 仅存在拆分文件而无标准高系列时视为"无任何高质量文件"，照常走补生成分支产出汇总版（勿因拆分文件存在而跳过）。
6. **提取版本号**：从路径匹配 `\d+\.\d+\.\d+`
7. **询问目标 URL** → "被测系统的 URL？"
8. **判断目标类型**（方法论来源：webapp-testing 决策树）：
   - `file://` 或 `.html` 文件路径 → `target_type: static_html`
   - `localhost` / `127.0.0.1` → `target_type: local_server`
   - 其他 → `target_type: remote_server`
9. **写入 config.json**（`mkdir -p "$PRJ/$VER/e2e"` 后）：
   ```json
   {
     "projectPath": "C:\\dev\\ToolBox\\1.0.0",
     "targetUrl": "https://...",
     "browserChannel": "chrome",
     "authType": "standard",
     "featureName": "枪火WeGame迁移查询",
     "version": "1.0.0",
     "target_type": "remote_server",
     "lastUpdated": "2026-07-30T17:15:00.000Z"
   }
   ```
   输出 "✅ 已保存项目配置到 `$PRJ/$VER/e2e/config.json`，后续测试流程自动读取。"

## Phase 1：环境预检

按以下顺序逐项检查环境依赖并报告（检测逻辑内联在各子步骤中，不依赖外部文档）。

### 1.1 浏览器引擎检测（关键决策点）

检测逻辑（优先级从高到低）：

```
1. 检测本地 Chrome：
   Bash: ls -d "C:/Program Files/Google/Chrome/Application/chrome.exe" 2>/dev/null
        (或 "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe")

2. 如果 Chrome 可用 → 策略 = "channel:chrome"
   → 跳过 Playwright Chromium 检测，直接使用本地 Chrome
   → 无需下载额外浏览器引擎（节省 ~300MB + 安装时间）

3. 如果 Chrome 不可用 → 检测 Playwright Chromium 引擎：
   Bash: ls -d "$LOCALAPPDATA/ms-playwright"/chromium-* 2>/dev/null
   如果也不可用 → 询问 PM："未检测到可用浏览器引擎。需要我安装 Playwright Chromium 吗？"
   如果已安装 → 策略 = "default"（使用 Playwright 自带 Chromium）
```

各依赖检测方法详见本 Phase 1.1-1.3（浏览器引擎、Playwright MCP、Node.js、@playwright/test 均在内联检测逻辑中）。CLAUDE.md 为路由大脑，不包含工具自检章节，此处不重复列述。

### 1.2 浏览器引擎策略输出

检测完成后，保存策略文件供 `run-tests` Phase 5.1 使用：

```bash
mkdir -p "$PRJ/$VER/e2e"
```

写入 `$PRJ/$VER/e2e/.browser-channel`，内容为 `chrome` 或 `default`（单行文本）。
**同步 config.json**：若 `$PRJ/$VER/e2e/config.json` 存在，同步更新其 `browserChannel` 字段保持一致（`.browser-channel` 供 smoke.cjs / playwright.config.ts 直接读取，config.json 供流程读取）。

### 1.3 报告输出

全部可用 → `✅ 环境就绪：Chrome（浏览器引擎）/ Playwright MCP / Node.js / @playwright/test`
使用本地 Chrome 时额外输出 → `ℹ️ 使用本地 Chrome 作为浏览器引擎（跳过 Playwright Chromium 下载）。`
有缺失 → 列出缺失项 + 安装指引，暂停

## Phase 2：解析输入

0. **PM 确认回合**：展示选定的两份输入文档，PM 确认后再开始解析。

   > 📄 准备使用以下两份文档开始测试：
   > | 文档类型 | 选中文件 | E 编号 | 质量 |
   > |---------|---------|--------|------|
   > | PRD | {功能名}_{版本号}_PRD_E{N}.md | E{N} | — |
   > | 测试用例 | {功能名}_{版本号}_测试用例_高_E{N}.md | E{N} | 高 |
   > 确认使用这两份？① 确认，开始 ② 手动指定文件 ③ 重新生成测试用例

   - 选 ① → 进入下方解析。
   - 选 ② → 回到 Phase 0 步骤 5 优先级 4（用户手动指定文件路径）。
   - 选 ③ → 调用 `Skill(pmcraft-req:generate-testcase)` 重新生成测试用例（默认 both）后，重新展示本确认回合。

1. **读 PRD**：提取用户故事、核心业务规则、验收标准
2. **读测试用例**：解析为 TestCase 列表

测试用例列结构：`测试模块 | 测试项 | 预期结果`。如结构不同，先确认映射关系。

## Phase 3：生成脚本与数据

### 3.1 输出目录

`$PRJ/$VER/e2e/{ts}/`（`{ts}` = `YYYYMMDD_HHmmss` 格式时间戳）

**目录结构**（Phase 3 创建，Phase 5/6 填充）：

```
e2e/{ts}/
├── scripts/          ← Phase 3: 测试脚本 + 数据
│   ├── *.spec.ts
│   ├── data/         ← TCxx.json
│   └── assets/       ← checkpoint framework (从 {插件根}/_shared/assets/checkpoint/ 拷贝: framework.ts + reporter.ts + shared.ts)
├── logs/             ← Phase 5: 运行时证据（mkdir -p 预创建）
│   ├── checkpoint/
│   ├── page-map/     ← page-map.json + sample-data.json（Phase 3.3/3.6 主 agent 预采集的数据值）
│   └── results/
└── report/           ← Phase 6: 最终报告（mkdir -p 预创建）
```

Phase 3.1 创建以上全部目录（`mkdir -p scripts/data scripts/assets logs/checkpoint logs/page-map logs/results report`）。

跨时间戳共享（Phase 3.1 同时确保 `$PRJ/$VER/e2e/auth/` 存在）：
```
$PRJ/$VER/e2e/auth/storage.json    ← 登录态持久化
```

`@playwright/test` 已全局安装（Phase 1），执行测试时通过 `NODE_PATH` 环境变量指向全局模块目录即可解析，**无需在项目或 e2e 目录中重复安装**：

```bash
NODE_PATH="$APPDATA/npm/node_modules" npx playwright test ...
```

**文件放置原则**（任何阶段产出物只能放在以下位置）：

| 产出类型 | 允许路径 | 禁止 |
|---------|---------|------|
| 脚本 + 数据 | `scripts/` 及 `scripts/data/` | — |
| 日志 + 证据 | `logs/` | — |
| 报告 | `report/` | — |
| 全局共享 | `$PRJ/$VER/e2e/auth/`（storage.json）<br>`$PRJ/$VER/e2e/`（仅限 `.browser-channel`） | ❌ 禁止在 `auth/` 下存脚本 |
| 运行时临时文件 | 系统 `$TMP`，用完即删 | ❌ 禁止写入项目根目录 |
| 跳过的 TC | **不生成** `.spec.ts` 文件，只记录在 `run_state.json` | ❌ 禁止生成空 `.spec.ts` |

### 3.2 强制约束：数据与脚本分离

`TCxx.json` ← 数据（页面快照的具体值：关键词、行号、字段值）
`TCxx.spec.ts` ← 逻辑（引用 JSON key，不含硬编码数据值）

**选择器类型区分规则**（根据 DOM 元素类型选择正确的 Playwright locator）：

| DOM 模式（从 snapshot 中识别） | 正确 selector | 严禁 | 说明 |
|:---|:---|:---|:---|
| `textbox /placeholder: 请输入XX` | `getByPlaceholder('请输入XX')` | `getByText(...)` | placeholder 是 input 属性，不在 DOM 文本节点中 |
| `generic` / `paragraph` / `StaticText` | `getByText('可见文本')` | `getByPlaceholder(...)` | 文本节点才走 `getByText` |
| `textbox` + `label` 文本关联 | `getByLabel('标签文本')` 优先 | — | label 语义更准确 |
| `el-date-picker`（日期范围选择器） | `loc(page,'.el-range-input').nth(0)` / `.nth(1)` → `click()` → `fill('')` → `fill(日期值)` → `keyboard.press('Escape')` 关闭面板。⚠️ **CSS 字符串中禁止 `:nth()` 伪类**（Playwright CSS 不支持，trap: playwright_css_nth_invalid），用 `.nth()` 方法 chain | `getByRole('combobox')` 上的 `fill()` ——命中 `el-date-editor` 外层 wrapper（`<div>`），写入的节点不对，Vue 响应式绑定不认，`fill()` 是静默 no-op | 必须定位到内部 `<input class="el-range-input">`，fill 前先 `fill('')` 清空再填值，fill 后 `Escape` 关闭面板避免遮挡其他元素。**(截至 2026-07, Element Plus 2.x 实测；DOM 结构可能随版本变化)** |

**误用检查**（Phase 3.7 自检）：
- `getByText` 的参数以 `请输入` / `请选择` 开头，且关联元素为 `textbox` → ⚠️ **自动替换** 为 `getByPlaceholder`

### 3.3 页面地图（Page Map）— 页面侦察

**决策树（复用分流）**：
```
页面侦察 → 上轮 page-map.json 存在？
 ├─ 否 → 完整侦察（步骤 1-3）→ 产出 page-map.json + selector-lib.ts
 └─ 是 → 3.3.0 询问 PM:
          ├─ ① 复用     → 基于上轮 map 重生成 selector-lib.ts（跳过 MCP 侦察）
          │               └─ 生成时实测发现选择器失效 → 标记 selector_stale → 回退重新侦察
          ├─ ② 重新侦察 → 完整侦察（同上）
          └─ ③ 增量更新 → 保留旧地图 + 只侦察新页面 → 合并（推荐）
```

#### 3.3.0 跨轮次复用检测

1. 在 `$PRJ/$VER/e2e/` 下列出时间戳目录，查找最新的 `logs/page-map.json`
2. 存在 → 展示："检测到上轮 ({ts}) 生成的页面地图，含 {N} 个页面。是否复用？（复用可跳过 MCP 页面侦察，直接重生成 selector-lib.ts）① 复用 ② 重新侦察 ③ 增量更新（保留现有地图，仅侦察新 TC 引入的新页面）"
3. 不存在 → 正常执行下方完整侦察
4. **复用/增量产出的 page-map.json 记录**：`generatedAt`、`basedOnPreviousRun`（首轮为 null）、`selectorStalenessChecked`（Phase 3.7 后更新）
5. **复用兜底**：Phase 3.6 子 agent 生成时实测发现选择器失效 → 标记 `selector_stale` → 父 agent 在 Phase 3.7 前汇总，对这些页面回退重新侦察（更新 page-map.json 后重生成 selector-lib.ts）

方法论来源：webapp-testing 第二阶段。在逐 TC 生成脚本之前，先对每个涉及的独立页面做一次性系统侦察。

1. **分析所有 TC，提取涉及的所有独立 URL**（去重）
2. **对每个 URL 执行页面侦察**：
   a. Playwright MCP 导航 → `browser_wait_for('load')` → `browser_wait_for('domcontentloaded')` → 关键元素 `waitFor({ state: 'visible' })`（陷阱: spa_networkidle_timeout — SPA 页面永不满足 networkidle）
   b. **DOM 快照**：`browser_snapshot`（**不传 filename 参数**，让工具返回文本，避免写入 CWD 根目录）— 用于标题/渲染校验与截图依据，**不再作为交互元素枚举来源**
   c. **⚡ 交互元素清单 + matchCount 实测（一体化 payload，每页恰 1 次，MUST）**：执行前 **Read `references/page-recon-snippets.md`** 第 0 节（页面侦察一体化 payload）。**逐字执行**该 payload（禁止改写、禁止拆分为逐选择器/逐元素调用），单页一次 `browser_run_code_unsafe` 同时完成：交互元素枚举（`button` / `input` / `select` / `a[href]`，每元素含 `data-testid`、`id`、`name`、`text`、`role`、`placeholder`）+ 候选选择器全量 matchCount 实测（`getByText`/`getByRole`/`getByPlaceholder`/`getByLabel`/CSS 映射构建 + `count()` 一次循环计数）。如果 Read 失败，依据文中规则自行实现同构代码。
      - 返回 JSON：每元素含最优候选 `selector` + `matchCount`，`matchCount > 1` 的元素带 `needs_disambiguation: true`；单页元素 > 100 → 按元素类型分两批执行（仍 ≤ 2 次/页，优于历史逐选择器 ~30 次/页）
      - `matchCount > 1` → 该元素 **MUST** 填 `disambiguation` 字段（如 `.first()` / `.nth(1)` / `.filter({ hasText: ... })`），实际使用的 selector 必须已消除歧义，否则页面地图该项不通过（Phase 3.7 会检查）。
      - `matchCount === 0` → 该元素从地图移除或修正 selector，禁止保留无效选择器。
   d. **全页截图**：`browser_take_screenshot(full_page=true)` — 立即 Bash: mv 到 `logs/page-map/{page_name}.png` 并 rm 项目根残留。**页面名卫生**：`page_name` 取自 URL 路径段时，先替换非 `[A-Za-z0-9_-]` 字符为 `_`（URL 常含 `?`/`&`/`/` 等 shell 元字符），源/目标路径一律用双引号包裹（`mv "...png" "logs/page-map/..."`），禁止裸插值

   e. **Auth 类型探测（会话级 1 次，非每页）**：全部页面侦察完毕且 PM 已登录后，**仅执行 1 次**：
      1. **Read `references/page-recon-snippets.md`** 第 2 节（cookie 属性提取 + storageState 提取代码）。如果 Read 失败，依据文中规则自行实现同构代码。
      2. 通过 MCP `browser_run_code_unsafe` 提取 cookie 属性（httpOnly 判断 → `http_only_session` / `standard`）
      3. 提取完整 storageState 并写入 `$PRJ/$VER/e2e/auth/storage.json`（httpOnly 也能捕获）
      4. 写入 `logs/page-map.json` 的 `auth` 字段
      5. 告知 PM 认证类型 + 后续执行策略（无头静默 vs 逐条执行）
      **禁止按页面重复探测 auth / 重复提取 storageState。**

   f. **清理临时文件**：`rm -f "$PRJ"/*.png "$PRJ"/.playwright-mcp/page-*.yml 2>/dev/null`
3. **产出 `logs/page-map.json`**：

```json
{
  "pages": {
    "/dashboard": {
      "url": "https://.../dashboard",
      "title": "仪表盘",
      "screenshot": "logs/page-map/dashboard.png",
      "buttons": [{"selector": "[data-testid='add-btn']", "text": "新增", "role": "button", "matchCount": 1}],
      "inputs": [{"selector": "#search", "placeholder": "搜索", "type": "text", "matchCount": 1}],
      "links": [{"selector": "a[href='/settings']", "text": "设置", "matchCount": 1}],
      "disambiguated": [
        {"key": "PAGE_TITLE", "selector": "getByText('枪火WeGame迁移查询').first()", "matchCount": 3, "disambiguation": ".first() — 页面标题在左侧菜单/tab/卡片标题出现3次，取首个可见"}
      ]
    }
  }
}
```

之后 Phase 3.6 逐 TC 生成时，共享此地图。**若 TC 操作了新页面（未在地图中）→ 追加该页面到地图**。所有 TC 共用一份地图，避免反复打开同一页面。

**⚡ 产出 `scripts/assets/selector-lib.ts`（P0-6，MUST）**：页面地图生成后，自动从 page-map.json 生成选择器库，作为所有 `.spec.ts` 选择器的唯一引用来源。

进入本步时，**Read `references/selector-lib-template.ts`**（selector-lib 代码模板）：
- 读取模板代码，将 `DEF` 中的示例选择器替换为 page-map.json 中的实际元素（含消歧义 chain），写入 `scripts/assets/selector-lib.ts`
- 如果 Read 失败，依据 page-map.json 和下方"为何必须有 selector-lib"规则自行构建同结构模板（SEL Proxy + loc() + selDesc()，Method 类型与 SelEntry 结构一致）

> **为何必须有 selector-lib**：spec.ts 只能引用库内已消歧义的选择器；选择器定义集中在 DEF 中，P0-8 机械检查同时扫描 selector-lib.ts 和 spec.ts。**严禁** 将 Playwright API 字符串（如 `"getByText(...)"`）直接传给 `page.locator()`——locator() 只接受 CSS/XPath，选择器必须通过 `loc(page, SEL.X)` 构建。

### 3.4 数据文件格式 (TCxx.json)

```json
{
  "tcId": "TC01",
  "context": { "baseUrl": "https://...", "pageTitle": "..." },
  "steps": [
    {
      "index": 1,
      "operation": "fill_search",
      "value": "赵六",
      "selector": "getByPlaceholder('请输入查找内容')",
      "description": "在搜索框输入关键词"
    },
    {
      "index": 2,
      "operation": "click_edit",
      "rowIndex": 0,
      "rowDescription": "赵六<1004>, 部门:技术中心-...",
      "selector": ".el-table__row >> nth=0 >> getByRole('button', {name:'编辑'})",
      "description": "点击第1行的编辑按钮"
    }
  ]
}
```

`operation` 取值规范：`navigate`, `fill_search`, `click_button`, `fill_form`, `select_dropdown`, `wait_for`, `assert_text`, `assert_visible`, `take_screenshot`

### 3.5 脚本文件格式 (TCxx.spec.ts)

**Read `references/spec-template.ts`**（脚本模板基准，已含 checkpoint/SEL/data 引用骨架、import 规范、断言与门禁约束注释）。生成时以模板为骨架，只填 TC 特有内容（步骤序列 / 操作名 / SEL key / 断言）。如果 Read 失败，依据下方"模板骨架关键结构"清单（import 三件套 / initCapture 前置 / checkpoint 包裹 / finalizeCapture 收尾）自行构建同构模板。

**模板骨架关键结构**（完整代码见 `references/spec-template.ts`，生成时必须满足）：

1. **import 三件套**：`test, expect`（expect 必须导入，陷阱: missing_expect_import）+ checkpoint 框架三函数 + `SEL, loc` 选择器库 + `data`（JSON import）
2. **initCapture 前置**：`initCapture(page, data.tcId)` 必须在 `page.goto` 前调用
3. **导航**：`waitForLoadState('domcontentloaded')`（禁止 networkidle，陷阱: spa_networkidle_timeout）
4. **步骤包裹**：每个操作在 `checkpoint(page, async () => {...}, { tcId, operationIndex, operationName, selector: SEL.X, description })` 中；选择器一律 `SEL.*` + `loc(page, SEL.X)` 引用，禁止硬编码选择器字符串
5. **断言**：可验证预期 → `expect(...)`（映射规则见 Phase 3.7.1）
6. **收尾**：spec 末尾 MUST 调用 `finalizeCapture(data.tcId)`（否则 checkpoint 日志为空）

**选择器引用规范（MUST）**：
- 所有元素选择器从 `SEL.*` 引用（selector-lib.ts 自动生成，已含消歧义处理）
- 禁止在 spec.ts 中直接写 `getByText('...')` / `getByRole(...)` / `getByPlaceholder('...')` 字符串
- 若 selector-lib 中缺少某元素 → 回 Phase 3.3 补充 page-map + 重新生成 selector-lib，**禁止**现场自造选择器

### 3.6 生成流程

对每条 TestCase，你 **MUST** 同时产出两个文件：

| 文件 | 内容 | 不可跳过 |
|------|------|---------|
| `data/TCxx.json` | 该 TC 的步骤数据（value、selector、description） | ❌ |
| `TCxx.spec.ts` | Playwright 测试脚本，引用 `.json` 中的值 | ❌ |

生成顺序：
0. ⚡ **TC 分组（MUST）** — 按测试用例模块划分 TC 组（每组 3-8 条，上限防子 agent 上下文溢出）。陷阱约束（P0-8：工厂规则 + 用户级/项目级/时间戳级 traps.json，按 scope 去重用户级优先）由步骤 2 组装生成包时经 `gate-check.cjs --emitTraps` 统一合并下发（合并逻辑单一权威来源，与 Phase 3.7 扫描共用；用户级数据文件不存在 → 跳过，不影响流程）
1. ⚡ **数据值预采集（主 agent 专属，MUST，按页批量化）** — 用 Playwright MCP 按页面批量实测采集数据值（关键词、行号、字段值、rowDescription），写入 `logs/page-map/sample-data.json`（选择器**不**进此文件，仍在 selector-lib.ts）：
   ① **分组**：从测试用例 + page-map.json 将全部 TC 按涉及的独立页面分组，每页一份采集计划（边界/校验类 TC 的实测项并入对应页面计划）
   ② **执行**：**Read `references/page-recon-snippets.md` 第 3 节**（数据预采集一体化 payload），按页填唯一参数区（PAGE.url / PAGE.ready / QUERIES，sel 一律用 page-map.json 的原始 selector 条目 type+args 结构）后**逐字执行**，每页恰 1 次 `browser_run_code_unsafe`；单页查询计划过大（>10 个 TC 或预估 >60s）时按 TC 组分 ≤ 2 批（仍 ≤ 2 次/页）；仅观测失败的点允许单点补测 1 次（兜底）。如果 Read 失败，依据文中规则自行实现同构代码。
   ③ **回写**：返回 JSON 的 `samples` 转写为 `logs/page-map/sample-data.json`（原有格式不变）：
   ```json
   {
     "TC-F-1": { "fill_search": { "value": "赵六" }, "click_edit": { "rowIndex": 0, "rowDescription": "赵六<1004>..." } },
     "TC-B-10": { "date_range": { "start": "2026-07-01 00:00:00", "end": "2026-07-01 00:00:00" } }
   }
   ```
   返回 JSON 的 `gaps`（命中方向异常记录）并入 run_state.json 的 `prd_vs_live_gaps`（报告直接读取展示，PM 无需翻查脚本源文件）
   - ⚠️ **页面就绪守卫** — payload 内置 goto + `domcontentloaded` + 关键元素 waitFor visible。**禁止 `waitForLoadState('networkidle')` / `browser_wait_for('networkidle')`**（陷阱: spa_networkidle_timeout）。
   - 数据值（关键词、行号、rowDescription）从批量实测返回的观测结果提取；**选择器一律从 page-map.json / selector-lib.ts 取值，禁止凭空构造**（陷阱: spa_page_title_multi_match / element_plus_nested_table）
   - ⚡ **校验类行为实测口径（MUST，P3）** — 校验/提示类行为的实测（如空值校验、非数字校验、拦截提示）在 payload 内以 observe 观测点自动重试等待（≥2000ms）提示元素出现后再下结论，禁止用固定短等待（`waitForTimeout(800)`）判定"无提示"。实测结论与执行口径一致（提示约 1-2s 内出现，短等待会漏判"未实现"，导致与执行结果矛盾）。（trap: validation_message_late_appearance）
   - ⚡ **边界/验收类 TC 数据命中验证（MUST，P1）** — 边界/验收类 TC（跨度0精确时刻、分页边界、空值校验、唯一值匹配等）采集数据时，**必须在 payload 内用该数据值完成一次真实查询**（observe 加 `require: true`），确认能命中 PRD 预期结果方向：
     - 能命中（如精确时刻返回 1 条）→ 断言命中结果（toHaveCount(1) / 具体值），**禁止**写死"共 0 条 / 空状态"式弱化断言
     - 不能命中（如精确时刻返回 0 条，但当天范围可查到）→ 按可验证部分断言（如"查询被接受且不报错"+ 无拦截提示）+ gaps 记 `prd_vs_live_gaps`（注明数据精度限制），**禁止**静默写死"0 条"假装验证了"返回该时刻工单"
     - 判定依据：以 MCP 实测为准（如显示值 `2025-12-22 11:04:34` 精确查 0 条、当天范围查 1 条 → 数据秒级精度受限）。（trap: datepicker_exact_moment_data_precision）
2. ⚡ **组装生成包 gen-bundle.md（MUST）** — Bash cat 拼接（零模型 token），子 agent 的唯一输入：
   ```bash
   { cat "{本技能源码目录}/references/subagent-rules.md"
     echo -e "\n--- selector-lib（SEL key 唯一来源）---\n"; cat "$PRJ/$VER/e2e/{ts}/scripts/assets/selector-lib.ts"
     echo -e "\n--- spec 模板 ---\n"; cat "{本技能源码目录}/references/spec-template.ts"
     echo -e "\n--- 实测数据值 ---\n"; cat "$PRJ/$VER/e2e/{ts}/logs/page-map/sample-data.json"
     echo -e "\n--- 合并去重后的 traps（生成约束，逐条遵守）---\n"
     node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}" --emitTraps
   } > "$PRJ/$VER/e2e/{ts}/logs/page-map/gen-bundle.md"
   ```
   - `--emitTraps` 打印合并去重后的 traps JSON（工厂 FIXED_TRAPS + 用户级/项目级/当次 traps.json，scope 去重用户级优先）后 exit 0，不扫描；拼接前校验 --emitTraps 输出为合法 JSON（经 stdin 校验，命令可逐字执行；--emitTraps 为纯读操作，重复执行无副作用）：
     ```bash
     node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}" --emitTraps | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{JSON.parse(s);console.log('✅ emitTraps 输出为合法 JSON')})"
     ```
     输出 `✅ emitTraps 输出为合法 JSON` 后继续拼接；JSON 解析失败 → 脚本报错退出，排查 traps 数据源后重试 — 合并逻辑单一权威来源（与 Phase 3.7 扫描共用同一脚本）
   - 位置 `logs/page-map/gen-bundle.md` 合规（P0-7 允许 logs/，与 sample-data.json 同级）；spec-template.ts 模板基准随包下发，不再单独读取
3. **按模块分组生成（可并行）**：
   - 每组启动并行子 agent：**输入 = `logs/page-map/gen-bundle.md`（生成包：规约 → selector-lib → 模板 → 实测数据 → traps）+ 组内 TC 行数据（测试用例原文按模块截取，prompt 内嵌）**，不再读散件
   - 为组内每 TC 写 `scripts/TCxx.spec.ts` + `scripts/data/TCxx.json`（不同组写不同文件，无竞争）
   - ⚡ **子 agent 自检（MUST，P0-8）**：每组生成完自己的 spec+data 后，立即执行：
     ```bash
     node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}" --files "{本组 spec 文件名逗号列表}"
     ```
     → 输出 `PASS — 无 trap 复发` = 通过；`BLOCKED — trap 复发` → **只修本组文件** → 重跑，至多 3 次（沿用既有上限）；子 agent 产出汇报中**附 PASS 行**
   - **子 agent 禁止触碰 MCP 浏览器**（浏览器只有主 agent 能碰，MCP 竞争防护）、禁止修改共享文件、禁止读 SKILL.md/散件（约束 7）
   - TC 数量少（≤8）或模块无清晰边界时 → 主 agent 直接串行生成
4. **生成规范（各组/各 TC 统一遵守）** — 子 agent 完整规约见 `references/subagent-rules.md`（随生成包下发，权威单一来源）；以下为生成规范总则：
   - `TCxx.spec.ts` 引用 `data/TCxx.json` 中的所有 `value` 和 `selector`（选择器经 `SEL.*` 引用）
   - **禁止在 .spec.ts 中硬编码数据值** — 所有数据从 `data/TCxx.json` 引用
   - 每组内 JSON + TS **成对产出**（不允许积攒 JSON 后批量生成 TS）
   - 所有 `.spec.ts` 导入 framework：`import { checkpoint, initCapture, finalizeCapture } from './assets/checkpoint/framework.js';` — spec 末尾必须调用 `finalizeCapture(data.tcId);`（否则 checkpoint 日志为空）
   - **test.fail 使用规范（MUST）**：仅当 PRD 定义的行为在当前线上环境**实测确实未实现**时才允许 `test.fail`。使用前必须先用 MCP 实测一次并留存证据（截图到 `logs/page-map/{tc}_fail_evidence.png`）。无实测证据 → 禁止使用 `test.fail`，一律用 `test()` + 注释标记"待确认"。（陷阱: test_fail_without_evidence）
   - **PRD vs 线上差异记录（MUST）**：PRD 定义行为与 MCP 实测不一致时（如 PRD 要求空值校验但线上未实现），在 `run_state.json` 追加 `prd_vs_live_gaps` 列表条目：`{ "tcId": "...", "prdBehavior": "PRD 描述的行为", "liveBehavior": "线上实际观测到的行为" }`（报告直接读取展示，PM 无需翻查脚本源文件）
   - ⚡ **断言弱化禁令（MUST）**：子 agent 指令与 spec 中禁止出现弱化表述——如"结果可能为空或非空，不断言具体行数"、"不验证具体值"。凡有实测数据支撑的预期（如数据存在、行数可推导）→ 必须断言（toHaveCount > 0 / 具体值）。预期结果逐条映射断言，可弱化仅限：页面无稳定选择器 / 数据依赖无法满足（此时记 prd_vs_live_gaps 并标注）
   - ⚡ **断言方向禁止反转（MUST）**：PRD 预期 X（如 loading 期间禁用），禁止改为断言 非X；预期与线上不符时 → 记 `prd_vs_live_gaps` + 标记需 FAILED，不反转断言（TC 实际判定 FAILED 由 run-tests 执行时落实）
5. 父 agent 收集全部产出 → **Phase 3.7 全部门禁**（P0-1~P0-9 为并行生成的质量兜底网，逐条执行；子 agent 已在步骤 3 各自跑过 `--files` 自检，此处全量重跑一次，预期一次通过）

### 3.7 产出物验证（阻塞门）

全部生成完毕后，**MUST** 运行以下自检，缺一不可。这是阻塞门 — 验证不过则不得进入 Phase 3.8。

> ⚡ **子 agent 自检衔接（P0-8 前移）**：子 agent 已在 Phase 3.6 步骤 3 各自跑过 `--files` 自检（只扫本组 .spec.ts，selector-lib.ts 恒扫）。此处父 agent 仍**全量重跑一次** gate-check（预期一次通过）；P0-1/2/3/8/10 机械项命中为 0 时直接放行。**P0-8 的 3.7.1 断言完整性 / 3.7.2 状态空间展开仍归父 agent**（主 agent 必做，不能只靠机械检查）。

```
验证清单：
□ 文件数量：data/ 目录下 .json 文件数 = 测试用例数
□ 文件数量：scripts/ 根目录下 .spec.ts 文件数 = 测试用例数
□ 每个 .spec.ts 都 import 了 checkpoint framework
□ 每个 .spec.ts 都 import 了对应的 data/TCxx.json
□ 每个 .spec.ts 都使用 s('operationName') 引用数据，无硬编码值
□ 每个 .spec.ts 在 page.goto 前调用 initCapture(page, data.tcId)
□ logs/page-map.json 覆盖了所有 TC 涉及的基础 URL（若 URL 不可达按约束 8 标记 ⚠️ 放行，不阻塞）
□ assets/checkpoint/framework.ts、reporter.ts 和 shared.ts 已拷贝到 scripts/assets/checkpoint/ 下
□ ⚡ assets/selector-lib.ts 存在且覆盖 page-map.json 全部元素（P0-6）
□ 选择器类型检查：`getByText` 参数以 `请输入` / `请选择` 开头，且页面地图对应元素为 `textbox` → ⚠️ 自动替换为 `getByPlaceholder`
□ ⚡ 选择器来源检查（P0-1，MUST）：grep 提取所有 spec.ts 中的 getByText(/getByRole(/getByPlaceholder( 选择器字符串，逐一验证在 page-map.json 的 selector 字段中存在（含消歧义后缀）。任一不在地图 → 阻塞。
□ ⚡ networkidle 门禁（P0-2，MUST）：`grep -r 'networkidle' scripts/*.spec.ts` 命中任何文件 → 硬阻塞，强制替换为 `domcontentloaded` + 元素 waitFor 后重新验证。
□ ⚡ test.fail 门禁（P0-3，MUST）：`grep -r 'test\.fail' scripts/*.spec.ts` 命中 → 每条必须引用 `logs/page-map/{tc}_fail_evidence.png` 实测证据；无证据 → 阻塞，强制改为 `test()`。
□ ⚡ trap 复发检查（P0-8，MUST）：执行 `node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}"`（脚本内置工厂陷阱 FIXED_TRAPS + 用户级/项目级/当次 traps.json 按 scope 去重动态合并，同时扫描 scripts/*.spec.ts 与 scripts/assets/selector-lib.ts DEF 定义区）；输出 `BLOCKED — trap 复发: <JSON>` → 修复对应 spec 后重新验证。
□ ⚡ 断言弱化检查（P0-10，MUST）：grep 所有 spec.ts 中弱化模式（"不断言"、"不验证"、"可能为空或非空"、"结果可能"等），命中任一 → 阻塞，回 Phase 3.6 补断言。
□ 预期结果→断言逐条核对（主 agent 必做，不能只靠机械 grep）：从测试用例"预期结果"逐条比对 spec.ts 断言，确认无弱化、无方向反转。
□ ⚡ 产出物路径检查（P0-7，MUST）：所有产出物位于 scripts/、logs/、report/、e2e/auth/ 规范路径；项目根目录无新增目录（$PRJ/ 下仅版本目录、PRD/测试用例源文档、.claude/）。
□ 断言完整性：Phase 3.7.1 通过 — 每条可验证预期结果有对应 expect() 断言
□ 状态空间展开：Phase 3.7.2 通过 — 所有非默认状态路径已覆盖
```

**机械检查命令（MUST 逐条执行）**：执行前 **Read `references/gate-check-commands.md`**（P0-1/P0-2/P0-3/P0-10 grep 命令）。P0-8 trap 复发检查直接执行：

```bash
node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}"
```

脚本内置 FIXED_TRAPS 静态数组 + 用户级/项目级/当次 traps 动态合并（按 scope 去重，用户级优先），同时扫描 scripts/*.spec.ts 与 scripts/assets/selector-lib.ts DEF 定义区；输出 `PASS — 无 trap 复发（共检查 N 条 trap）` = 通过，`BLOCKED — trap 复发: <JSON>` = 阻塞。如果 Read 失败或脚本缺失，依据 gate-check-commands.md 规则自行构建等价检查命令（networkidle / test.fail / 选择器来源 / 弱化表述 grep + 工厂/用户级/项目级/当次 traps grepPattern 复发检查）。

如果任何一项不通过 → 回到对应 Phase（Phase 3.6 补文件 / Phase 3.7.1 补断言 / Phase 3.7.2 补状态路径），不得继续。
**最大重试 3 次**：同一阻塞项修复后重新验证最多 3 次。3 次后仍未通过 → 标记为 `⚠️ 需 PM 介入`，展示未通过的检查项及修复记录，由 PM 决定继续/跳过/手动修复。此上限防止 AI 反复尝试相同修复进入死循环。

通过后输出自检结果表格，格式：
```
| TC | .json | .spec.ts | imports | 断言覆盖 | 状态覆盖 |
|-----|-------|----------|---------|---------|---------|
| TC-F-1 | ✅ | ✅ | ✅ | ✅(9/9) | — |
| TC-B-10 | ✅ | ✅ | ✅ | ✅(3/3) | — |
| TC-UI-I-21 | ✅ | ✅ | ✅ | ✅(3/3) | ✅(3/3) |
| ... |  |  |  |  |  |
```
注：`断言覆盖` 列显示 `已断言数/可验证预期数`；未涉及状态切换的 TC 在 `状态覆盖` 列显示 `—`。

### 3.7.1 断言完整性检查

全部脚本生成完毕后，对每条 TC 执行 **预期结果 → 断言映射校验**，确保测试用例的"预期结果"没有被弱化或遗漏。

**步骤**：

1. **提取预期结果清单**：从测试用例原文中的"预期结果"列，按序号（1. / 2. / 3. / ① / ② / ③）拆分为独立条目。

   示例 — TC-B-10 预期结果：
   ```
   1. "系统接受时间跨度为0的查询条件，不报错"
   2. "查询结果返回该精确时刻的迁移工单"   ← 可验证断言
   3. "不出现'请选择有效时间范围'等拦截提示"
   ```

2. **分类每条预期**：

   | 类型 | 关键词 / 判定 | 处理 |
   |:-----|:-------------|:-----|
   | **可验证断言** | 含"返回"/"展示"/"可见"/"包含"/"禁用"/"清空"/"不可"/"阻止"/"不变"/"输入框"/"提示"等**可观测行为描述** | 必须在 .spec.ts 中有对应 `expect()` |
   | **外观/感观断言** | 含"样式统一"/"层次感"/"美观"/"间距"/"不截断"/"不换行"/"不闪烁"等**主观/视觉描述** | 标记为"人工验证"，不要求 expect() |

3. **断言映射规则** — 对每条"可验证断言"，在 spec.ts 中搜索对应 expect：

   | 预期关键词 | 必须出现的 expect 模式 |
   |:----------|:----------------------|
   | "返回...数据"/"展示...工单"/"展示...记录" | `expect(count).toBeGreaterThan(0)` 或 `expect(...).not.toHaveCount(0)` |
   | "展示'暂无数据'"/"展示...提示" | `expect(...).toContainText('...')` |
   | "...按钮禁用" | `expect(...).toBeDisabled()` |
   | "输入框内容清空" | `expect(value).toBe('')` |
   | "不出现...错误"/"不报错"/"不展示..." | `expect(...).not.toBeVisible()` 或 `expect(...).toHaveCount(0)` |
   | "...可见"/"...存在" | `expect(...).toBeVisible()` |
   | "提示'xxx'" | `expect(...).toContainText('xxx')` |
   | "...被阻止"/"查询...无变化" | 操作前的状态断言在操作后仍然成立 |
   | "保持不变"/"不随...改变"/"仍为" | `expect(newValue).toBe(originalValue)` ← **同时触发 Phase 3.7.2** |

4. **修复与兜底**：

   | 场景 | 处理 |
   |:-----|:-----|
   | 可验证断言被弱化（断言强度低于预期，如 `toHaveCount(0)` 代替存在性断言 `not.toHaveCount(0)`、删除可推导的行数断言） | ⚠️ 阻塞修复：回 Phase 3.6 恢复断言强度。弱化原因若是选择器/数据问题 → 回 Phase 3.3 用 MCP 重新实测后纠正，而非放宽断言 |
   | 可验证断言缺少 expect | ⚠️ 自动修复：修改对应 spec.ts，补充缺失断言后重新验证 |
   | 可验证断言 > 已映射断言（断言弱化） | ⚠️ 阻塞：检查弱化原因。若弱化原因是选择器无法定位（如 `fill()` 不生效导致查不到数据），**回 Phase 3.3 用 MCP 重新实测该元素后纠正选择器，而非放宽断言**。允许放宽断言的情况仅限：页面确实无稳定选择器、数据依赖无法满足、PRD 定义的校验线上未实现（此时同时记录到 run_state.json 的 `prd_vs_live_gaps`） |
   | 自动修复失败（如不熟悉断言写法） | 展示给 PM：`TC-{id} 预期"{原文}"缺少断言，是否接受？` |
   | 外观断言 | ✅ 直接标记为"人工验证"，不阻塞 |

5. **输出断言覆盖矩阵**：

   ```
   | TC | 预期条目 | 可验证 | 已断言 | 缺失 | 状态 |
   |:---|:-------:|:-----:|:-----:|:----:|:----:|
   | TC-B-10 | 3 | 3 | 2 | 1 | ⚠️ 已自动修复 |
   | TC-F-1 | 9 | 9 | 9 | 0 | ✅ |
   | TC-UI-L-14 | 4 | 2 | 2 | 0 | ✅（2条人工验证）|
   ```

   矩阵中有 ⚠️ 且未自动修复的项 → 阻塞，PM 逐条确认后放行。

### 3.7.2 状态空间展开检查

对涉及**状态切换/保持**的 TC（预期结果含"不变"/"保持"/"不随...改变"/"仍为"/"清空"/"重置"/"恢复"/"切换"/"保留"），做多状态路径覆盖检查。

**步骤**：

1. **识别被测控件及其状态空间**：

   从测试用例的操作步骤和页面地图中，提取被测交互控件及其所有可能取值：

   ```
   TC-UI-I-21：条件类型下拉框（el-select）
   状态空间：[通行证id, 渠道账号id, 迁移时间范围]
   判定基准："条件类型不随重置改变" → 预期：重置后类型 == 重置前类型
   ```

2. **枚举实际覆盖的起始状态**：

   检查 spec.ts 中的 checkpoint 序列，列出实际测试了哪些起始状态 → 操作的路径：

   ```
   起始状态        已在 spec.ts 中？  操作    预期
   ─────────────  ────────────────  ──────  ──────
   通行证id(默认)       ✅            → 重置  → 仍为通行证id
   渠道账号id           ❌            → 重置  → 仍为渠道账号id
   迁移时间范围         ❌            → 重置  → 仍为迁移时间范围
   ```

3. **判定与修复**：

   | 条件 | 判定 | 处理 |
   |:-----|:----:|:-----|
   | 所有非默认状态均覆盖 | ✅ 通过 | — |
   | 存在缺失路径 | ⚠️ | 自动扩展：为每个缺失起始状态增加 checkpoint（切换到该状态 → 执行操作 → 断言不变） |
   | 控件仅 2 个状态 | 放宽 | 覆盖 1 个非默认状态即可 |
   | 预期是"清空"（而非"不变"） | 注意 | 预期是值变为空，不是保持不变 |
   | 状态数 > 5 | 抽检 | 覆盖默认 + 2 个非默认即可，不全量穷举 |

4. **输出状态覆盖矩阵**：

   ```
   | TC | 控件 | 状态数 | 已覆盖 | 缺失 | 状态 |
   |:---|:-----|:-----:|:-----:|:----:|:----:|
   | TC-UI-I-21 | 条件类型 | 3 | 1 | 2 | ⚠️ 已自动扩展 |
   | TC-E-8 | 条件类型 | 3 | 3 | 0 | ✅ |
   ```

   矩阵中有 ⚠️ 且未自动扩展的项 → 阻塞，PM 逐条确认后放行。

## Phase 3.8：阻塞预检

全部脚本生成完毕后，扫描脚本和用例内容，识别以下阻塞类型：

| 阻塞类型 | 关键词 |
|---------|--------|
| 🔴 审批流 | 审批、审核、批准、approve |
| 🟡 外部平台 | 其他系统、控制台、后台、在 XX 中操作 |
| 🟡 异步任务 | 等待、稍后、异步、队列、回调 |
| 🟡 数据依赖 | 已有、前置条件、确保存在、预置 |
| 🟢 多角色 | 管理员、审核员、不同角色、切换账号 |

展示阻塞预检清单，每条标注：阻塞类型、涉及 TC、具体原因、需要 PM 做什么。

**跳过的 TC 不生成文件**：标记为跳过（如无角色账号、需开发协助）的 TC，只记录在 `run_state.json` 的 `skipped` 列表中，**不生成** 对应的 `.spec.ts` 文件。

**⚡ 需人工复核字段定义（run_state.json）**：
- `needs_manual_verification: string[]` — 需人工复核的 TC 列表
  （来源：Phase 3.8 阻塞预检判定"数据填值不可靠"（如 datepicker 自动化填值 headless 不可靠）、PM 确认标记 PARTIAL 的 TC）
- `manual_verification_reason: string` — 复核原因（报告展示用，如"el-date-picker datetimerange 填值 headless 不可靠，需人工确认真实数据"）
- 这些 TC 正常生成 `.spec.ts` 参与执行，但执行后结果标记 NEEDS_MANUAL（见 run-tests Phase 5.5），由 collect-manual 人工复核最终化

PM 逐条确认（已解决 / 已知晓并跳过 / 标记 PARTIAL），全部确认后，将每条阻塞项的 TC / 阻塞类型 / 具体原因 / PM 决策写入 `$PRJ/$VER/e2e/{ts}/blocking-check-confirmed.md`（供 collect-manual Phase 8.2 读取跳过原因；未写入则其标注"原因未记录"），然后输出完成提示。

## 完成输出

Phase 3.8 全部确认后，输出以下格式的完成消息：

```
✅ 测试脚本生成完成

📂 输出目录：$PRJ/$VER/e2e/{ts}/
📊 脚本统计：
  - 测试脚本：N 个 .spec.ts
  - 数据文件：N 个 .json
  - 页面地图：M 页

📋 阻塞预检：
  - 🔴 审批流：X 项（已确认 Y 项）
  - 🟡 外部平台/异步/数据依赖：X 项（已确认 Y 项）
  - 🟢 多角色：X 项

▶️  下一步：说「跑测试」开始测试。（**NEXT-TEST 模板**，话术库，见 CLAUDE.md「话术模板库」节）
```

---

## 工厂陷阱（内置）

> 技能内置的跨项目通用陷阱库（原技能级 traps.json，现已内嵌本技能文本，随插件升级自动更新）。
> **生成脚本时必须逐条遵守**：trap 描述的模式（及 grepPattern 正则）不得出现在新脚本中；P0-8 机械检查用 `assets/scripts/gate-check.cjs` 内置的 FIXED_TRAPS 静态数组 + 用户级/项目级/当次 traps.json 动态合并（脚本与本章节随版本同步维护，内容须一致）。
> 用户后面积累的通用经验存 `{用户数据根}/pmcraft-test/traps.json`（由 review-tests 写入），与本表按 scope 去重（用户级优先）。

| scope | 模式（根因） | 生成约束（fix 要点） | 内嵌位置 |
|-------|-------------|---------------------|---------|
| `spa_page_title_multi_match` | getByText('页面标题') 命中多个元素 | 用 .first()/.nth() 消歧义；选择器一律从 page-map/selector-lib 引用 | 已内嵌 Phase 3.3 c 步 / 3.6 步骤 1 |
| `element_plus_nested_table` | getByRole('table') 命中 el-table 嵌套双表格 | 用 .first() 或改用 getByRole('row')/locator('tbody tr') 计数 | 已内嵌 Phase 3.6 步骤 1 / 3.2 |
| `default_state_vs_switched_state` | 默认状态 TC 断言了切换后才出现的控件 | 生成 data JSON 前必须按 TC 步骤在 MCP 浏览器实测该状态 DOM，只断言当前状态存在的元素 | 工厂（本表） |
| `test_fail_without_evidence` | test.fail 误用导致测试通过反判失败 | 使用 test.fail 前必须 MCP 实测一次并留存截图证据；无证据一律 test() + 注释"待确认" | 已内嵌 Phase 3.6 规范 / P0-3 门禁 |
| `spa_networkidle_timeout` | networkidle 在 SPA 上永不完成 | 一律 domcontentloaded + 目标元素 waitFor visible；禁止 networkidle | 已内嵌 Phase 3.3/3.6 / P0-2 / 约束 3 |
| `missing_expect_import` | 缺 expect import → ReferenceError | 模板强制 import { test, expect } from '@playwright/test' | 已内嵌 Phase 3.5 骨架 |
| `jwt_token_ttl_expiry` | 登录态 JWT TTL ~3h 中途过期 | 提取登录态时解析 JWT exp 写 run_state.tokenExpiresAt，执行前检查预警 | 属 run-tests 域（run-tests/assets/scripts/jwt-ttl.cjs 处理） |
| `execution_file_placement` | storage.json 误写项目根目录 | 登录态一步到位写 $PRJ/$VER/e2e/auth/storage.json（mkdir -p 先行）；禁止先写根目录再复制 | 工厂（本表，Phase 3.1 放置表补充） |
| `element_plus_datepicker_fill_unreliable` | el-date-picker datetimerange 填值不可靠 | 涉及 datepicker 输入的核心 TC 标记 needs_manual_verification；自动化只覆盖不依赖 datepicker 的步骤 | 已内嵌 Phase 3.2 表格 / 3.8 |
| `execution_selector_lib_grep_blind_spot` | P0-8 只扫 spec.ts 漏 selector-lib 定义源 | P0-8 必须同时 grep scripts/assets/selector-lib.ts（DEF 的 m/a 字段） | 已内嵌（gate-check 现扫 selector-lib.ts，保留防退化） |
| `element_plus_table_header_toHaveText` | toHaveText 对 el-table 表头断言失败（wrapper div 干扰） | 列头断言统一 toContainText（子串匹配）而非 toHaveText | 工厂（本表） |
| `element_plus_select_wrapper_multi_match` | .el-select__wrapper 命中 2 个（条件类型 + 分页） | 加 .first() chain 消歧义（查询条件卡片在结果卡片上方） | 工厂（本表） |
| `getbytext_partial_match_multi` | getByText 子串匹配命中下拉值/表单标签/其他 | 用精确选择器 + toContainText 断言，不用 getByText 模糊匹配 | 工厂（本表） |
| `playwright_css_nth_invalid` | Playwright CSS 不支持 :nth() 伪类 | 用 .nth() 方法 chain，CSS 字符串禁止 :nth() | 已内嵌 Phase 3.2 表格 |
| `role_name_substring_match_strict_violation` | getByRole name 子串匹配父菜单含子项文本 | name 用正则精确匹配（/^...$/）；isVisible 探测被 catch 吞错时防误点击 | 工厂（本表） |
| `matchcount_2_without_disambiguation` | page-map 实测 matchCount=2 生成时遗漏消歧义 | matchCount>1 元素 MUST 填 disambiguation 字段 | 已内嵌 Phase 3.3 c 步 |
| `css_class_multi_match_breadcrumb` | .tabs-label 命中面包屑所有层级 | page-map 需同时测 CSS 选择器 matchCount；多级时用 nth() 精确 | 工厂（本表） |
| `multi_element_locator_containtext` | toContainText 不能作用于多元素 locator（strict mode） | 先 toHaveCount(N) 再逐 nth(i) 断言每项 | 工厂（本表） |
| `assert_scope_wider_than_acceptance_criteria` | 页面级横向滚动断言过严（shell 溢出与功能无关） | 断言范围匹配验收标准原文（聚焦表格容器，非整页） | 工厂（本表） |
| `timing_sensitive_fixed_delay_assertion` | 固定延时后断言 loading 时序脆弱 | 时序敏感断言用 expect 自动重试（如 expect.toHaveClass(/is-loading/, { timeout })），禁止固定 waitForTimeout 后断言 | 工厂（本表，约束 3 的固定延时仅作兜底） |
| `menu_expand_animation_fixed_delay` | 菜单展开动画 >500ms 固定等待导致 menuitem not found | 点击展开后用 expect(mi).toBeVisible({ timeout: 5000 }) 自动等待 | 工厂（本表） |
| `evaluate_empty_element_timeout_false_pass` | evaluate 对空元素 30s 自动等待超时；checkpoint 曾吞错致假通过 | evaluate 作用于始终存在的容器元素（如 .el-table__body-wrapper），禁止对可能为空的 tbody tr evaluate | 工厂（本表） |
| `execution_config_json_invalid` | config.json 未转义反斜杠 → JSON.parse 失败 | Windows 路径一律正斜杠；写入后 node JSON.parse 校验 | 工厂（本表） |
| `execution_manual_result_merge` | report-gen 人工结果仅覆盖 SKIPPED | 混合验证 TC 在 run_state.results 标 SKIPPED 让人工结果生效 | 属 generate-report 域（报告后核对 summary.manualPassed） |
| `playwright_outputdir_clears_screenshots` | Playwright 每次运行清空 outputDir 与截图目录冲突 | config outputDir 独立于 framework 截图目录（如 './logs/playwright-output'） | 工厂（本表，Phase 3.1 目录结构配合） |
| `element_plus_reset_reverts_condition_type` | 重置后条件类型回默认，datepicker 被 v-if 卸载 | 重置行为按线上实测断言；TC 含"重置"必须在对应模式下 MCP 实测 | 工厂（本表，Phase 3.7.2 状态空间配合） |
| `execution_manual_defect_duplicate` | defects.json 中 manual 缺陷与报告自动合并重复 | manual 缺陷只写 manual-results.json，defects.json 仅保留 source:auto | 属 generate-report 域 |
| `execution_manual_screenshot_prompt` | collect-manual 跳过"有截图吗"询问致 evidence 缺失 | 逐条询问或批量格式；无截图显式记录 evidence:'无截图'；写盘校验 evidence 存在 | 属 collect-manual 域 |
| `loading_assert_split_checkpoint` | click 与 loading 断言分拆 checkpoint，截图间隙错过 loading 窗口 | click 与 loading 断言 MUST 放同一 checkpoint()，零间隙 | 已内嵌 约束 4 |
| `pagination_invalid_page_clamp` | el-pagination 非法页码自动 clamp 到末页 | 断言 go 输入框变为修正后页码 + 末页行数 + 下一页禁用，禁止断言回第 1 页 | 工厂（本表） |
| `pagination_icon_only_button_text` | 分页上/下一页是 icon-only（文本在 aria-label） | 断言 toHaveAttribute('aria-label', ...) 而非 toContainText | 工厂（本表） |
| `menu_initially_expanded_click_folds` | 菜单初始即展开，点击已展开父菜单反而折叠 | 生成 TC 前 MCP 实测菜单初始展开态；已展开时直接断言可见 + 点击子菜单 | 工厂（本表） |
| `el_card_nested_multi_match` | .el-card 嵌套 + hasText filter 命中多个 | 用精确类 .el-card.search-card / .el-card.result-card，禁止 hasText filter 定位嵌套卡片 | 工厂（本表） |
| `pagination_hardcoded_count_fragile` | 测试环境数据不稳定，硬编码条数假失败 | 分页类 TC 禁止硬编码总条数；从"共 N 条"动态解析实际总数推导 | 工厂（本表） |
| `assertion_follow_live_not_pass` | PRD 与线上不符时改断言跟随线上，掩盖缺陷 | 差异 = 缺陷信号：FAILED + 记 prd_vs_live_gaps；仅 PM 确认按线上验收才 PASSED | 已内嵌 Phase 3.6 断言方向禁止反转 |
| `assertion_weakening_in_generation` | 生成期弱化 PRD 预期断言隐藏缺陷 | 子 agent 指令与 spec 禁止弱化表述；有实测数据支撑的预期必须断言 | 已内嵌 Phase 3.6 / P0-10 门禁 |

---

## 约束

1. **禁止在 .spec.ts 中硬编码数据值** — 所有数据从 JSON 引用
2. **选择器优先级**（方法论来源：webapp-testing 抗重构哲学）：
   `data-testid` > `getByText` > `getByLabel` > `getByRole`（仅原生元素）> `getByPlaceholder` > CSS > XPath
   - 组件库自定义组件（Element Plus / Ant Design 的 el-select 等）、el-date-picker、el-table 的具体选择器/断言用法 → 详见 **Phase 3.2 选择器表（权威规范）**
   - 原生标准元素（`<button>`、`<input>`、`<a>`）→ 可用 `getByRole`
3. **操作间必须 wait + 禁止 networkidle** — 每次 click/fill 后 `waitForLoadState('domcontentloaded')` + 目标元素 `waitFor({ state: 'visible' })`，或固定 500ms~1s 延迟。**禁止 `networkidle`**（原因详见 Phase 3.6 步骤 1；机械门禁见 Phase 3.7 P0-2）。
4. **每个操作包裹 checkpoint()** — 不跳过任何一步。⚠️ **click 与 loading 断言 MUST 放同一 checkpoint()**（trap: `loading_assert_split_checkpoint` — checkpoint 的 before 截图间隙 50-200ms 会错过 ~300ms 的 loading 窗口，查询响应快时尤其脆弱）
5. **不修改已有文件** — 脚本写入 e2e 时间戳目录
6. **Phase 3.6 生成失败不静默跳过** — 如果某个 TC 的 JSON 或 TS 生成失败，列出失败 TC 和原因，询问 PM 是否继续
7. **并行生成浏览器禁令** — 子 agent 只读 `logs/page-map/gen-bundle.md`（生成包：规约 + selector-lib + 模板 + 实测数据 + traps），只写本组文件 + 跑本组 gate-check 自检（`--files`），**禁止触碰 MCP 浏览器**、禁止读 SKILL.md/散件、禁改共享文件；数据值采集仅主 agent 执行（MCP 竞争防护）
8. **页面地图缺失不阻塞** — 如果目标 URL 无法访问导致 page-map 无法生成，标记为 ⚠️ 后继续，后续 TC 逐个独立导航
9. **页面侦察与数据预采集双预算** — 页面侦察每页 `browser_run_code_unsafe` ≤ 1 次（仅执行第 0 节一体化 payload：枚举 + 全量 matchCount 单次完成；单页交互元素 > 100 时按元素类型分 ≤ 2 批，仍 ≤ 2 次/页）；数据预采集（Phase 3.6 步骤 1）每页 ≤ 1 次（仅执行第 3 节一体化 payload；单页查询计划 > 10 个 TC 或预估 > 60s 时按 TC 组分 ≤ 2 批，仍 ≤ 2 次/页；仅观测失败的点允许单点补测 1 次兜底）
10. **auth 探测每会话 ≤ 1 次** — 全部页面侦察完成后提取一次 cookie 属性 + storageState（snippets 第 2 节）；禁止按页面重复探测 / 重复提取 storageState

---

## 禁止行为

1. **禁止硬编码选择器** — 选择器一律 `SEL.*` + `loc(page, SEL.X)` 引用；禁止 `getByText`/`getByRole`/`getByPlaceholder` 字符串与现场自造选择器（selector-lib 缺失 → 回 Phase 3.3 补充）
2. **禁止硬编码数据值** — 所有数据从 `data/TCxx.json` 引用
3. **禁止 networkidle** — 一律 `domcontentloaded` + 目标元素 `waitFor({ state: 'visible' })`（陷阱: spa_networkidle_timeout）
4. **禁止无证据 test.fail** — 必须先用 MCP 实测并留存证据截图（`logs/page-map/{tc}_fail_evidence.png`）；无证据一律 `test()` + "待确认"注释
5. **禁止弱化断言 / 反转断言方向** — 有实测数据支撑的预期必须断言；PRD 与线上不符 → 记 `prd_vs_live_gaps` + 标记需 FAILED，不反转断言
6. **禁止生成空 .spec.ts** — 跳过的 TC 只记录在 `run_state.json`
7. **禁止在项目根写临时文件** — 运行时临时文件走系统 `$TMP` 用完即删；登录态写 `$PRJ/$VER/e2e/auth/storage.json`；禁止先写项目根再复制
8. **禁止逐选择器 / 逐元素分次调用 MCP 计数或枚举** — 页面侦察计数与枚举只允许第 0 节一体化 payload（每页恰 1 次）；禁止对清单中每个候选选择器单独执行 `browser_run_code_unsafe`
9. **禁止改写一体化 payload 后执行** — 第 0 节 payload 必须逐字执行；唯一允许的参数化是单页元素 > 100 时改 `TYPE` 分两批（每页 ≤ 2 次）。第 3 节（数据预采集）payload 同样逐字执行，唯一允许的参数化是填唯一参数区（PAGE / QUERIES）或查询计划过大时按 TC 组分 ≤ 2 批
10. **禁止逐 TC 单独导航采集数据值** — 数据预采集只允许第 3 节一体化 payload（每页 ≤ 1 次，含批次/兜底口径）；禁止对每条 TC 单独 `browser_navigate` + 单独 MCP 调用采集（同第 8 条对侦察的约束口径）

---

## 边缘情况处理

### 场景 1：项目路径下找不到 PRD 或测试用例

执行 Phase 0 的兜底扫描（`*/prd/*.md`、`*/testcase/*`）。
如果仍未找到：

> ⚠️ 在 `{项目路径}` 下未找到 PRD 或测试用例文件。
> 请确认：
> 1. PRD 文件是否在 `prd/` 目录下？
> 2. 测试用例是否在 `testcase/` 目录下？
> 3. 是否需要我手动指定文件路径？请提供 PRD 和测试用例的完整路径。

### 场景 2：目标 URL 无法访问

在 Phase 3.3 页面侦察时，如果 `browser_navigate` 返回连接错误或超时：

> ⚠️ 无法访问目标 URL `{url}`。
> 可能原因：URL 不正确 / 服务器未启动 / 网络不可达。
> 请确认 URL 是否正确。如果 URL 正确且需要我启动本地服务器，请提供启动命令。

后续 TC 生成跳过页面地图，每个 TC 独立导航。

### 场景 3：测试用例格式与预期列结构不匹配

在 Phase 2 解析时，如果测试用例的列结构与 `测试模块 | 测试项 | 预期结果` 不一致：

> ⚠️ 测试用例的列结构与预期不一致。当前检测到的列为：`{actual_columns}`。
> 请确认以下映射关系：
> - 哪一列对应"测试项/操作步骤"？
> - 哪一列对应"预期结果"？
> 
> 或直接提供期望的列名映射（如 `步骤→测试项, 期望→预期结果`）。

### 场景 4：页面侦察中某个页面需要登录但尚未登录

如果 `browser_navigate` 后页面跳转到登录页：

> ⚠️ 页面 `{url}` 需要登录才能访问。
> 请先在浏览器中手动登录该页面，完成后告知我"已登录"。
> 我会保存登录状态后继续页面侦察。

保存 storage state 到 `$PRJ/$VER/e2e/auth/storage.json` 后继续。

### 场景 5：TC 数量过多（> 50 条）

如果测试用例超过 50 条：

> ⚠️ 检测到 {N} 条测试用例，数量较多。建议：
> 1. **全量生成** — 生成全部 {N} 条用例的脚本（预计耗时较长）
> 2. **按模块分批** — 选择一个模块优先生成
> 3. **抽样生成** — 先选择前 20 条核心用例
> 
> 请选择生成策略。

### 场景 6：存在 PRD 或测试用例文件（含多份）

Phase 0 步骤 5b 扫描到文件后（无论单份还是多份），均按规则自动选择并在 Phase 2 展示确认回合。多份时提示选择结果：

> 📄 检测到 {prd_count} 份 PRD 文件、{tc_count} 份测试用例文件，已按规则自动选择：
> - PRD：`{功能名}_{版本号}_PRD_E{N}.md`（E 编号最大，最新定稿）
> - 测试用例：`{功能名}_{版本号}_测试用例_高_E{N}.md`（高质量 E 编号最大）
> 
> 请确认是否使用以上两份（Phase 2 确认回合）。

若 PM 不满意 → 在确认回合选 ② 手动指定路径或 ③ 重新生成测试用例。

---

## 示例

### 正例：完整的 setup-tests 调用

**PM 输入**：`setup-tests`

**执行流程**：
1. 询问项目路径 → PM 回答 `C:\dev\ToolBox\1.0.0`
2. 探索项目：发现 `.feature-name`（迁移管理）、`prd/` 下 PRD_E1、PRD_E2（选 E2）、`testcase/` 下无高质量文件 → 调用 generate-testcase 补生成 `迁移管理_1.0.0_测试用例_高_E1.md`
3. 询问目标 URL → PM 回答 `http://localhost:8080`
4. Phase 1 环境预检 → ✅ 全部就绪
5. Phase 2 确认回合 → 展示 PRD_E2 + 测试用例_高_E1，PM 确认后解析 → 提取 12 条 TC（TC-F-1 ~ TC-E-12）
6. Phase 3.3 页面侦察 → 生成 `page-map.json` 含 2 个页面
7. Phase 3.6 逐 TC 生成 → 产出 12 个 `.json` + 12 个 `.spec.ts`
8. Phase 3.7 自检 → 全部通过，输出覆盖矩阵
9. Phase 3.8 阻塞预检 → 发现 1 项 🟡 数据依赖，PM 确认已知晓并跳过
10. 输出完成消息，提示 `run-tests`

### 反例：跳过 Phase 3.7 直接进入阻塞预检 ❌

**错误做法**：生成完脚本后，直接展示阻塞预检清单，没有先做断言完整性检查和状态空间展开检查。

**错误原因**：Phase 3.7 是阻塞门。跳过它意味着可能有缺少断言的脚本进入执行阶段，导致 `run-tests` 中出现"假通过"（脚本没有断言所以不会失败），PM 误以为功能正常。必须逐项完成 3.7 验证清单后才能进入 3.8。

---

## 评估测试

### 正向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `setup-tests` | 进入 Phase 0，询问项目路径 |
| 2 | `帮我生成测试脚本` | 等效于 `setup-tests`，进入 Phase 0 |
| 3 | `重新生成脚本` | 等效于 `setup-tests`，产出新时间戳目录 |
| 4 | PM 在 `pmcraft 测试完整流程` 流程中被路由到 `setup-tests` | 自动执行 Phase 0-3.8 |
| 5 | PM 说 `跑测试` 且无已有脚本 | 路由到 `pmcraft 测试完整流程` → 自动触发 `setup-tests` |
| 6 | `setup-tests` 对 3 页项目执行完整页面侦察 | Phase 3.3 每页恰 1 次 `browser_run_code_unsafe`（第 0 节一体化 payload）+ auth 会话级 1 次，全程共 ≤ 4 次；page-map.json 三页齐全、matchCount 全覆盖 |
| 7 | `setup-tests` 数据值预采集 | Phase 3.6 步骤 1 每页恰 1 次 `browser_run_code_unsafe`（第 3 节一体化 payload，QUERIES 按页分组）；单页查询计划 > 10 个 TC 或预估 > 60s 时按 TC 组分 ≤ 2 批；返回 gaps 并入 run_state 的 prd_vs_live_gaps，sample-data.json 格式不变 |
| 8 | 子 agent 生成完本组文件后 | 立即执行 `gate-check.cjs --tsDir ... --files "{本组 spec 文件名逗号列表}"` 自检；BLOCKED → 只修本组文件 → 重跑至多 3 次；产出汇报附 PASS 行；父 agent Phase 3.7 全量重跑一次通过（P0-1/2/3/8/10 命中为 0 直接放行） |

### 负向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | PM 说 `开始测试` 且已有脚本 | 应路由到 `run-tests`，不触发 `setup-tests` |
| 2 | PM 说 `查看报告` | 应路由到 `generate-report`，不触发 `setup-tests` |
| 3 | 用户说 `帮我写一个 PRD` | 不触发 — 这是 PRD 编写，非测试脚本生成 |
| 4 | 用户说 `修复这个 bug` | 不触发 — 这是代码修复，非测试准备 |
| 5 | 用户说 `部署到生产` | 不触发 — 这是部署操作，非测试准备 |

### 边缘查询（7 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | PM 在无 PRD 无测试用例的项目中调用 `setup-tests` | 输出"在 {项目路径} 下未找到 PRD 或测试用例文件。"，询问是否手动指定（触发边缘场景 1） |
| 2 | PM 提供的目标 URL 返回 502 | Phase 3.3 输出"无法访问目标 URL"，询问确认（触发边缘场景 2） |
| 3 | 测试用例列结构为 `编号 | 场景 | 步骤 | 验证点`（非标准格式）| Phase 2 输出列结构不匹配提示，询问映射关系（触发边缘场景 3） |
| 4 | 生成脚本中出现"结果可能为空或非空，不断言具体行数"等弱化表述 | Phase 3.7 P0-10 弱化 grep 命中 → 阻塞，回 Phase 3.6 补断言，不进入 Phase 3.8 |
| 5 | Phase 3.8 阻塞预检判定某 TC"数据填值不可靠"（如 datepicker）或 PM 标记 PARTIAL | 写入 run_state.json 的 `needs_manual_verification`（+ `manual_verification_reason`），正常生成 .spec.ts 供执行，执行后标 NEEDS_MANUAL |
| 6 | `prd/` 下有 PRD_E1、PRD_E2，`testcase/` 下有 测试用例_高_E1、测试用例_高_E2 | 按规则自动选择 PRD_E2 + 测试用例_高_E2，Phase 2 展示确认回合（触发边缘场景 6） |
| 7 | `testcase/` 下只有标准/中质量用例（存量项目，无 `_高` 文件） | 调用 generate-testcase 补生成（默认 both 产出中+高）→ 再取高质量 → Phase 2 展示确认回合 |

---

## 参考文档

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `references/selector-lib-template.ts` | selector-lib.ts 代码模板（SEL Proxy + loc() + selDesc()） | Phase 3.3 生成选择器库时 |
| `references/spec-template.ts` | TCxx.spec.ts 脚本模板基准（import/骨架/门禁约束注释） | Phase 3.6 步骤 2 组装生成包时（随包下发） |
| `references/subagent-rules.md` | 子 agent 生成规约（权威单一来源：骨架/s() 纪律/断言纪律/test.fail 证据/成对产出与自检） | Phase 3.6 步骤 2 组装生成包时（随包下发） |
| `references/page-recon-snippets.md` | 页面侦察与数据预采集 MCP 代码（第 0 节一体化 payload 枚举+计数 / matchCount 原理 / Auth 探测 / 第 3 节数据预采集 payload） | Phase 3.3 c/e 步 / Phase 3.6 步骤 1 |
| `references/gate-check-commands.md` | Phase 3.7 机械检查 grep 命令（P0-1/2/3/10）+ gate-check.cjs 全量/--files/--emitTraps 用法 | Phase 3.7 门禁验证时 / Phase 3.6 步骤 2-3 |
| `assets/scripts/gate-check.cjs` | P0-8 trap 复发检查脚本（内置 FIXED_TRAPS + 三级 traps 动态合并；--files 子 agent 自检 / --emitTraps 生成包下发） | Phase 3.7 门禁验证时 / Phase 3.6 步骤 2-3（node 直接执行） |
