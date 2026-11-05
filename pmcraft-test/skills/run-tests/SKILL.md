---
name: run-tests
description: >
  当已有 setup-tests 生成的测试脚本，需要执行 Playwright 自动化功能测试时使用。
  处理浏览器登录、逐 TC 执行、自动诊断并修复失败脚本、收集运行时证据。
  可由 pmcraft 路由大脑自动串联调用，也可单独使用（含 --resume 断点续跑）。
type: skill
argument-hint: --resume（断点续跑）
tags:
  - 自动化测试
  - Playwright
  - test
  - execution
  - repair
  - evidence
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_press_key, mcp__playwright__browser_wait_for, mcp__playwright__browser_run_code_unsafe]
prompt: 重测|再测|全量重跑|续跑|断点续跑|run-tests
dependencies:
  - Node.js（LTS，脚本层 smoke.cjs/jwt-ttl.cjs/collect-evidence.cjs 与 Playwright 运行所需）
  - Playwright CLI + 全局 @playwright/test 包（NODE_PATH 指向全局 node_modules，见 Phase 4 预检）
  - 浏览器引擎：Playwright Chromium 或本地 Chrome（Phase 4 预检确认，见 .browser-channel 策略）
  - Playwright MCP（Phase 4 登录与 Phase 5.3 失败诊断的 browser_snapshot/browser_run_code_unsafe 依赖）
---

# run-tests — 测试执行

## 路径约定

- **版本目录**：pmcraft 自动从 cwd 向上查找 `[Vv]?\d+\.\d+\.\d+` 版本目录
- **测试域根**：`{版本目录}/e2e/`（与 `brief/`、`prd/`、`testcase/` 并列）
- **本技能源码目录**：当前 SKILL.md 所在目录（`.../pmcraft-test/skills/run-tests/`）
- **插件根目录**：从本 SKILL.md 向上 2 级（`../../` → `pmcraft-test/`）

## 概述

读取 setup-tests 生成的脚本和数据，逐 TC 执行 Playwright 测试，收集证据，
自动诊断并修复失败脚本（数据修复 vs 脚本修复），记录陷阱。

## 输入

| 参数 | 来源 |
|------|------|
| e2e 目录 | 时间戳目录（自动发现，有 run_state.json 优先，兼容 --resume） |
| 测试脚本 | `scripts/*.spec.ts`（setup-tests 产出） |
| 测试数据 | `scripts/data/TCxx.json` |
| 选择器库 | `scripts/assets/selector-lib.ts` |
| checkpoint 框架 | `scripts/assets/checkpoint/`（framework.ts + reporter.ts + shared.ts） |
| 登录态 | `$PRJ/$VER/e2e/auth/storage.json`（跨时间戳共享） |
| 浏览器策略 | `$PRJ/$VER/e2e/.browser-channel`（chrome / default） |
| 页面地图 | `logs/page-map.json`（auth.type 仅供报告展示，不作执行判定） |

## 加载地图

| 文件 | 加载时机 | fallback |
|------|---------|----------|
| `references/login-storage-snippets.md` | Phase 4.2（URL 校验）/ Phase 4.4（JWT 解析） | 按文中规则自行实现同构校验/解析 |
| `references/playwright-templates.md` | Phase 5.0.5（冒烟脚本）/ Phase 5.1（config + run-all 参数） | 按文中规则自行构建模板 |

## Phase 4：打开浏览器 & 登录

### 4.1 确定 e2e 目录

0. **读取项目配置**（`$PRJ/$VER/e2e/config.json`，跨时间戳共享）：
   - 存在 → 读取 projectPath / targetUrl / browserChannel / authType，直接用于后续 Phase（跳过重复询问，仅展示摘要）
   - 不存在 → 提示"项目配置缺失（`e2e/config.json`）。请先通过「生成脚本」生成测试脚本，或提供 e2e 目录路径后继续。"
1. 在 `$PRJ/$VER/e2e/` 下列出所有 `\d{8}_\d{6}` 格式的时间戳目录
2. 无匹配 → 提示"没有找到 e2e 产出物，请先说「生成脚本」。"，终止
3. 如单独调用本技能且无法自动发现 → 询问 "请提供 e2e 目录路径："

> **路径卫生（Bash 注入防护，适用于本技能所有含 `{e2e_dir}` 的 Bash 命令）**：`{e2e_dir}` 来自项目路径（用户输入或磁盘发现），构造 Bash 命令前须剔除 `'` `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符（或请 PM 确认实际路径）；路径一律用双引号包裹传入。`node -e` 校验命令中，JSON 路径必须经 argv 传递（`process.argv[1]`），禁止内嵌进 -e 代码串——Windows 反斜杠路径若内嵌 JS 字符串字面量会被转义解析破坏（如 `\1` 八进制、`\r` 回车），且单引号可逃逸代码串。**同理适用于含 `{batch_specs}` / `{failed_list}` 的 playwright test 命令**：spec 文件名来自磁盘（tcId 衍生，规范 `TC[\w-]+`），构造命令前确认每个文件名仅含 `[A-Za-z0-9_-]`，含其他字符时改为逐条引号包裹传入。

#### 4.1.1 目录选择决策树（自上而下，命中即停）

```
输入：时间戳目录列表 D = [d1, d2, ...]（按时间戳降序）

├── |D| = 1 → 选中 d1，进入 Phase 4.2。
│
├── 路由层已指定目录（CLAUDE.md 重测路由等场景已选定）→ 直接使用，不自行选择。
│
├── 调用者意图为 --resume（断点续跑）
│   → 过滤含 run_state.json 且 current 非空的目录
│   → 从中选时间戳最新的 → 选中
│   → 若所有目录的 current 均为空 → 提示"所有已完成，没有可续跑的任务"，终止。
│
└── 调用者意图为默认/全量执行（无 --resume）：
    ├── 仅一个目录含 run_state.json → 选中该目录（有 run_state 的优先）
    │
    └── 多个目录含 run_state.json，或无一含 run_state.json
        → 展示目录清单给 PM（禁止静默选择）：
        ```
        发现 {n} 个 e2e 目录，请选择要使用的目录：
        {每个目录展示：时间戳 | spec 数 | 完成状态 | 是否有报告}
        ① {ts1} — {specs} 条 spec，{completed}/{total} 已完成，报告{已/未}生成 ⬅ 推荐
        ② {ts2} — {specs} 条 spec，{completed}/{total} 已完成，报告{已/未}生成
        ...
        ⓝ 新建目录（保留旧证据，全新执行）
        ```
        → 标注推荐：时间戳最新且有 run_state 的目录
        → PM 选择后进入 Phase 4.2
```

4. 无 `run_state.json` 且无 `logs/checkpoint/` 日志的目录视为"脚本已生成但未执行"，在列表中标注 `⚠️ 未执行`。

### 4.2 服务器生命周期管理（方法论来源：webapp-testing with_server）

若 `target_type: local_server`（目标为 `localhost:*` 或 `127.0.0.1:*`）：

1. **探测端口**：`Bash: curl -s -o /dev/null -w "%{http_code}" '{target_url}'` 或 `Bash: timeout 2 bash -c "echo > /dev/tcp/localhost/{port}" && echo OPEN || echo CLOSED`。注意：{target_url} 来自用户输入，构造 Bash 命令前需校验 URL 格式（必须以 `http://` 或 `https://` 开头；**校验拒绝单引号 `'` 与换行/回车**——单引号会逃逸 shell 引号边界导致命令注入）。命令内 URL 一律用**单引号包裹**（校验已拒绝 `'`，单引号内无逃逸面）。若 target_type 为 local_server，target_url 通常为 `http://localhost:{port}`，可自动构造安全 URL。

   **URL 校验代码（MUST 在构造含 {target_url} 的 Bash 命令前执行）**：
   Read `references/login-storage-snippets.md` 第 1 节，使用其中的 `validateUrlForShell` 函数校验用户输入的 URL（必须验证：以 http(s):// 开头、无换行/回车、字符集白名单）。
   如果 Read 失败，依据以下规则自行实现同构校验：URL 必须匹配 `/^https?:\/\/[a-zA-Z0-9._~:/?#\[\]@!$&()*+,;=%-]+$/`（字符集**显式不含单引号 `'`**——URL 将嵌入单引号包裹的 shell 命令，含 `'` 会逃逸引号边界）且不含 `[\n\r]`，校验失败抛错并停止构造 Bash 命令。
2. 如果服务器未运行 → 询问 PM："目标服务器未运行。需要我用 Node.js 子进程启动本地服务器吗？"
3. PM 提供启动命令（如 `npm run dev`、`python server.py`）→ 用 `child_process.spawn` 启动，等待端口就绪（**最多等待 60 秒**，每 2 秒探测一次；超时 → 提示 PM："端口 60 秒内未就绪，继续等待 / 终止？"，防无界等待，与约束 4"禁止无限等待"同口径）
4. 多服务场景（前端 + 后端）→ 串行启动，各等端口就绪后继续
5. 测试全部完成后清理所有子进程

```bash
# 如果 PM 选择手动启动，提示 PM 执行启动命令后告知
```

### 4.3 登录判定

1. 检查测试用例内容是否包含以下关键词：`登录`、`登入`、`login`、`signin`、`注册`、`register`
2. **如果测试用例本身在测登录功能** → 跳过人工登录，脚本自行测试
3. **其他情况** → Playwright MCP headed 模式打开浏览器 → 导航到目标 URL
   → 提示 PM（一次性说明整个计划）：
   > 🔐 浏览器已打开登录页。请手动登录后回复"已登录"。
   > 后续我会自动：检测认证方式 → 保存登录态 → 冒烟验证 → 执行测试。
   > 整个过程只需登录这一次，不反复弹窗。
   → 等待用户告知"已登录"/"好了"/"完成"
   → 登录后不关闭浏览器

### 4.4 持久化浏览器状态（供 Playwright CLI 复用）

PM 登录完成后，**统一用以下方式**保存登录态到跨时间戳共享路径：

1. 通过 MCP 在已登录的浏览器 page 实例上提取 storage state：
   ```
browser_run_code_unsafe: async (p) => JSON.stringify(await p.context().storageState())
   ```
2. **先确保目标目录存在**：`mkdir -p "$PRJ/$VER/e2e/auth"`（跨时间戳共享目录）
3. **一步到位**将返回的 JSON 写入 `$PRJ/$VER/e2e/auth/storage.json`
   - ❌ **禁止先写入项目根目录 `$PRJ/auth/` 再复制到规范路径**（陷阱: execution_file_placement — 根目录残留过期的 ims_token，误用导致测试全部跳转登录页）
   - ❌ **禁止在根目录创建任何 `auth/`、临时目录**——登录态只允许存在于 `$PRJ/$VER/e2e/auth/`
4. 验证：读取 storage.json，`cookies` 数组非空 → 通过。为空 → 不继续。
5. **⚡ 解析 JWT TTL（MUST）**：从 storage.json 中查找含 JWT 的 cookie（如 `ims_token`），解析 payload 提取 `exp`（Unix 秒），写入 `run_state.json` 的 `tokenExpiresAt` 字段（ISO 8601）。
   ```bash
   node "{本技能源码目录}/assets/scripts/jwt-ttl.cjs" --storagePath "$PRJ/$VER/e2e/auth/storage.json"
   ```
   输出 `{"exp":...,"expiresAt":"ISO"}` → 写入 run_state.json；输出 `{"tokenExpiresAt":null}` → 记录 null。
   若脚本缺失 → 依据 references/login-storage-snippets.md 第 3 节自行实现同构解析（`fs.readFileSync` 读文件、`storage.cookies.find(c => c.name === 'ims_token')` 定位、`Buffer.from(value.split('.')[1], 'base64')` 解 exp）。
   - 若所有 cookie 均非 JWT（无法解析 exp）→ 记录 `tokenExpiresAt: null`，跳过预检（静默）。

> ⚠️ 不要使用 `npx playwright save-storage`——该命令打开新的无头浏览器，
> 不携带当前 MCP 浏览器的 HTTP-only cookie，保存的 storage.json 会是空 cookies。
> `page.context().storageState()` API 在已登录 session 上执行，能捕获所有 cookie 类型。

## Phase 5：逐 TC 执行

### 5.0.pre 重测备份（重测模式触发；同目录全量重测时 MUST）

当本次执行是"全量重测"（CLAUDE.md 重测路由选定目录后发起，非断点续跑），且将复用已有时间戳目录时，执行前必须先备份旧证据——**原位就近备份**（与源同目录，改名即还原）：

| 备份对象 | 备份位置 |
|---|---|
| `run_state.json` | 时间戳根 → `run_state.json.bak.{ts}` |
| `report/` 下 `final-report.html`、`defects.json`（若存在） | report/ 内 → `final-report.html.bak.{ts}`、`defects.json.bak.{ts}` |
| `logs/checkpoint/`（若存在） | 时间戳根 → `checkpoint.bak.{ts}/`（`cp -r`） |
| `logs/results/`（截图/录像证据，若存在） | 时间戳根 → `results.bak.{ts}/`（`cp -r`） |

> ⚠️ **为什么必须备份 logs/checkpoint 与 logs/results**：同一目录重测时，新执行会**覆盖**同名 `TCxx_checkpoint_log.json` 与 `screenshots/*` 截图——不备份则旧证据永久丢失。目录级备份用 `cp -r` 一次完成。

**备份后重置 run_state**（供新一轮执行干净起点）：
- `completed` → `[]`
- `current` → `""`（或第一条 TC ID）
- `results` → `{}`
- `repair_history` → `[]`
- **保留**：`total`、`tokenExpiresAt`（只读基准，不重置）

**新建时间戳目录重测**（PM 选"新建目录"）→ 无需备份（旧目录原样保留作审计证据），直接进入 Phase 5.0。

### 5.0 执行前验证（阻塞门）

在执行任何 TC 之前，**MUST** 验证以下条件全部满足：

```
□ scripts/ 目录存在 .spec.ts 文件且数量 ≥ 1
□ scripts/assets/checkpoint/framework.ts 存在
□ scripts/assets/checkpoint/reporter.ts 存在
□ scripts/assets/checkpoint/shared.ts 存在
□ scripts/data/ 目录存在对应 .json 文件
□ node_modules/@playwright 可解析（NODE_PATH 指向全局包）
□ 浏览器引擎可用（读取 $PRJ/$VER/e2e/.browser-channel）
       → "chrome": 确认 Chrome 路径可执行
       → "default": 确认 $LOCALAPPDATA/ms-playwright/chromium-* 存在（Bash 语法，与 setup-tests Phase 1.1 检测命令同口径；禁止用 PowerShell 的 $env:LOCALAPPDATA 变量写法）
□ 每个 .spec.ts 末尾调用了 finalizeCapture(data.tcId)（否则 checkpoint 日志为空）
□ ⚡ traps.json 已预创建（P0-5，供修复阶段强制落盘）
□ ⚡ 登录态 TTL 预检（P0-4）：读取 run_state.json 的 tokenExpiresAt，计算剩余时间：
       - 剩余 > 60 分钟 → 静默通过
       - 剩余 30-60 分钟 → 提示："登录态将在约 {n} 分钟后过期，建议重新登录。输入'继续'忽略 / '重新登录'重新提取。"
       - 剩余 < 30 分钟 → 提示："登录态将在 {n} 分钟内过期，可能不足以完成全部 {total} 条 TC。强烈建议重新登录。"
       - tokenExpiresAt 为 null → 跳过（无法解析 JWT）
```

**traps.json 预创建**（供修复阶段强制落盘，P0-5；仅当文件不存在时执行）：
```bash
test -f "{e2e_dir}/traps.json" || echo '[]' > "{e2e_dir}/traps.json"
```

若不通过 → 终止，提示缺失原因 + 修复建议。

### 5.0.5 冒烟验证

全部 TC 执行前，**MUST** 跑冒烟测试验证三个前提成立（登录态有效 + 页面可达 + 基本断言正确）。

**执行**（30 秒超时）：
```bash
NODE_PATH="$APPDATA/npm/node_modules" node "{本技能源码目录}/assets/scripts/smoke.cjs" \
  --baseUrl "{baseUrl}" --titleKeyword "{页面标题关键词}" --browserChannel "{browser_channel}"
```
- `{browser_channel}` 取自 `$PRJ/$VER/e2e/.browser-channel`（chrome / default）
- smoke.cjs 已内置：URL 校验（node 层，防注入）、headless 启动、storageState 注入（默认 `../auth/storage.json`，**文件存在才注入**——无登录项目自动跳过，可用 `--storageState` 覆盖）、domcontentloaded（禁止 networkidle）、URL 含 'login' → exit 2（LOGIN_REQUIRED）、标题关键词 + 主操作按钮 waitFor 5s → SMOKE_PASSED（exit 0）、超时/错误 → exit 3（TIMEOUT）
- 参数值（{baseUrl} 取 e2e/config.json targetUrl、{页面标题关键词} 取 PRD 标题）为磁盘文件内容，构造命令时仍须确认不含 `"` / `$` 等双引号场景元字符（先剔除或请 PM 确认），node 层 URL 校验只拦截 URL 字符集、不拦截 shell 元字符
- 主操作按钮默认找 `查询`，被测系统无"查询"按钮时传 `--actionKeyword "{按钮文本}"` 覆盖
- 若脚本缺失 → 依据 references/playwright-templates.md 第 1 节自行构建同构验证。

**判定**：

| 结果 | 含义 | 后续动作 |
|:-----|:-----|:--------|
| SMOKE_PASSED | 登录态有效，页面可交互 | → Phase 5.1 模式 A（分批执行） |
| LOGIN_REQUIRED | 登录态无效 | → Phase 4 重新登录 |
| TIMEOUT | 页面不可达或脚本错误 | → 报告 PM，不继续 |

> 目的：2 分钟内验证整个执行链路，避免浪费数十分钟后发现基础问题。

### 5.1 执行流程（每条 TC）

**执行方式：由冒烟验证结果决定模式**（storageState 注入支持 httpOnly cookie——CDP 层注入，模式 A 对 `http_only_session` 同样适用；page-map.json 的 `auth.type` 字段保留仅供报告展示，不再作执行判定）。

**决策树**：
```
冒烟验证 (5.0.5)
 ├─ SMOKE_PASSED → 模式 A：分批执行（5~8 条/批）
 ├─ LOGIN_REQUIRED → 重新登录 (4.3-4.4) → 重冒烟 → SMOKE_PASSED → 模式 A
 └─ 仍 LOGIN_REQUIRED → 模式 B 兜底：run-all.cjs（headless, 单窗口, 不弹窗）
      └─ 模式 B 也 401/跳登录 → 回 Phase 4.3 重新登录（见边缘情况处理）
```

**禁止用 MCP 浏览器工具直接操作页面作为测试执行方式。**

#### 模式 A：分批执行（默认，冒烟通过后）

```
1. 复制静态 config 模板到 e2e 时间戳根目录：
   cp "{本技能源码目录}/assets/templates/playwright.config.ts" .
   模板已内置：testDir './scripts'、outputDir './logs/playwright-output'（⚠️ 必须独立于 checkpoint 截图目录 logs/results/——Playwright 每次运行开始清空 outputDir，若指向截图目录会清掉前批截图，trap: playwright_outputdir_clears_screenshots）、timeout 120000、expect.timeout 10000、
   fullyParallel false、workers 1、retries 0、reporter [list + checkpoint/reporter.ts]、
   use.storageState 条件注入（`../auth/storage.json` 存在时才注入，无登录项目如 static_html 自动省略）、use.video 'on' + use.trace 'on'（⚡ 证据存档生产源，Phase 5.2 归集）；浏览器引擎运行时自读 ../.browser-channel，无需占位符替换。
   若模板缺失 → 依据 references/playwright-templates.md 第 2 节自行 Write 同构 config（必须带上 video/trace 启用，否则证据存档无数据）。
   ⚠️ config 内路径相对时间戳根解析，测试命令必须在时间戳根目录执行。

2. 分批：TC 列表按顺序分 5~8 条/批（保失败反馈时效，省冷启动）
   --resume 时：从 run_state.json 的 results 推导未完成 TC → 组成续跑批
   ⚡ needs_manual 提示：批内含 `run_state.needs_manual_verification` 列表中的 TC → 即使脚本全部通过，结果标记 **NEEDS_MANUAL**（非 PASSED），等待 collect-manual 人工复核

3. 每批执行：
   NODE_PATH="$APPDATA/npm/node_modules" npx playwright test {batch_specs} --config=playwright.config.ts

4. 批内失败 → 集中分组修复（顺序：数据失效 → 脚本失效 → 断言失败）：
   a. 读取 logs/checkpoint/ 下失败 TC 的 checkpoint_log.json 判断失败类型
   b. 数据失效（改 TCxx.json，Phase 5.3）→ 脚本失效（改 selector）→ 断言失败（先诊断选择器，禁止删 PRD 预期 expect）
   c. 环境问题（net::ERR / 500 / console.error 前置）→ 标记 ENV_FAILED 不修
   d. 重跑失败项：显式文件列表 NODE_PATH=... npx playwright test {failed_list} --config=...
   e. 每 TC 修复最多 3 次（计数入 run_state.repair_counts），超限标记 FAILED

5. 每批完成 → 验证 checkpoint 落盘（Phase 5.2）+ 更新 run_state.json（Phase 5.5）+ trap 落盘（Phase 5.4）→ 下一批
```

**MCP 浏览器工具使用规则：**
- Phase 4（登录）：允许 — `browser_navigate`、`browser_snapshot`
- Phase 5.1（执行）：**FORBIDDEN** — 只能用 Bash + `npx playwright test`
- Phase 5.3（失败修复）：允许 — `browser_snapshot`、`browser_take_screenshot` 用于诊断

#### 模式 B：run-all.cjs 合并执行（兜底，冒烟仍失败时触发）

> 兜底模式（极少触发）：storageState 注入对 httpOnly cookie 同样有效（CDP 层注入），故默认不按 auth.type 判定；仅当冒烟验证两次失败（模式 A 前提不成立）时降级此模式。

1. 扫描 `scripts/` 下所有 `TC-*.spec.ts`，提取每个 `test(..)` 块的内容
2. 生成 `run-all.cjs`：所有 TC 共用 `{ chromium, path, fs }` + 一个 `page` 实例
3. 执行：`NODE_PATH="$APPDATA/npm/node_modules" node run-all.cjs`
4. 每条 TC 前 `page.goto(baseUrl)` 重置状态
5. 每条 TC 独立写入 `TCxx_checkpoint_log.json`

**关键参数**：
`launchOpts = { headless: true }`（.browser-channel 为 chrome 时加 `channel: 'chrome'`）、`newContext({ storageState: '../auth/storage.json', viewport: { width: 1280, height: 720 } })`。
（同构参数参考 references/playwright-templates.md 第 3 节）

**约束**：headless: true（不弹窗），所有 TC 共用同一 page，失败 TC 仍走 Phase 5.3 修复流程。

### 5.2 通过 → 证据收集 + 日志验证

每个 TC 执行完成后，**MUST** 验证 `logs/checkpoint/TCxx_checkpoint_log.json` 已由 checkpoint reporter 自动生成。若文件不存在 → 该 TC 未正确执行（可能用了非 Bash 捷径），标记为 **INVALID**，回退到 Phase 5.1 用 `npx playwright test` 重跑。

**⚡ 日志新旧校验（P2，MUST）** — 落盘验证不能只看"文件存在"，还必须校验**日志与当次运行对应**（reporter 的 "Skipped: already written" 逻辑会在重跑单条时残留旧批次的成功日志，导致"命令行 FAILED 但日志显示 PASSED"的双份证据矛盾）：

1. 单条/子集重跑前（Phase 5.1 步骤 4d），**必须先删除该 TC 的旧 checkpoint 日志**：`rm -f logs/checkpoint/TCxx_checkpoint_log.json logs/checkpoint/TCxx_ops.jsonl`
2. 重跑完成后校验：日志 `timestamp` 晚于本次运行开始时间，且 `playWrightStatus` 与命令行结果一致（命令行 FAILED → 日志必须 FAILED；若日志显示 PASSED 而命令 FAILED → 旧日志残留，删除后重跑）
3. 整批执行（无重跑）时，若 reporter 输出 "Recovered from JSONL" 而非 "written by framework" → 需人工确认该日志是当次生成（reporter 从 ops.jsonl 恢复时可能合并旧数据）

| 证据 | 路径 | 验证方式 |
|------|------|---------|
| Checkpoint 日志 | `logs/checkpoint/TCxx_checkpoint_log.json` | **MUST 存在** |
| 录像 | `logs/results/TCxx/video.webm` | 模式 A：config 已启用 `use.video`，每批执行后按下方归集命令收集（归集后 **MUST 存在**）；模式 B 兜底不产出 |
| Trace | `logs/results/TCxx/trace.zip` | 模式 A：config 已启用 `use.trace`，归集同上（归集后 **MUST 存在**）；模式 B 兜底不产出 |
| 截图 | `logs/results/TCxx/screenshots/` | 若存在则收集 |
| 控制台消息 | `logs/checkpoint/TCxx_checkpoint_log.json` → `consoleMessages` | 由 framework.ts `initCapture()` 自动捕获 |
| 网络请求 | `logs/checkpoint/TCxx_checkpoint_log.json` → `networkRequests` | 由 framework.ts `initCapture()` 自动捕获（含 4xx/5xx） |

**⚡ 录像/trace 归集（模式 A 每批执行后 MUST）**：config 已启用 video/trace，Playwright 将文件写入 `logs/playwright-output/{spec}.spec/{测试标题}/`（每次运行开始清空 outputDir——**不归集则上一批录像/trace 被下一批运行删除**）。每批完成后、进入下一批前，在时间戳根目录执行（命令不含用户路径插值，无注入面）：

```bash
node "{本技能源码目录}/assets/scripts/collect-evidence.cjs"
```

（归集逻辑固化于 `assets/scripts/collect-evidence.cjs`：tcId 从 spec 文件名目录（如 TC-F-1.spec）提取，不从测试标题目录提取——标题目录为净化后的 "TC-F-1-查询功能验证"，正则截取会带尾横线/吞 ASCII 后缀，tcId 不可靠。脚本缺失时按上述规则自行实现同构归集。）

归集后校验：`ls logs/results/TCxx/video.webm logs/results/TCxx/trace.zip` 存在 → 该 TC 证据存档完成（report-gen 的"证据存档"区块据此渲染）。

playwright.config.ts 中 `outputDir` 和 reporter `outputDir` 已在 Phase 5.1 模板中配置。

### 5.3 失败 → 诊断与修复

**判断：数据失效还是脚本失效？**

| 错误类型 | 示例 | 修复对象 | 修复策略 |
|---------|------|---------|---------|
| 数据失效 | "第0行找不到按钮"、"搜索'赵六'无结果" | 只改 `.json` | Claude 看当前页面 → 找替代数据 → 更新 JSON value/rowIndex |
| 脚本失效 | "getByRole('button') 未命中"、"timeout 等待 selector" | 只改 `.spec.ts` | Claude 看失败处 DOM → 更新 selector/操作策略 |
| 环境问题 | "net::ERR_CONNECTION_REFUSED"、"500" | 不修 | 报告 PM，标记"环境不可用" |
| 断言失败 | "expect(...).not.toHaveCount(0) 失败"、"expect(...).toHaveText(...) 失败" | `.spec.ts`（选择器或断言） | ⚠️ **FORBIDDEN：禁止删除 PRD 预期结果对应的 `expect()`**。先诊断选择器是否正确（MCP 实测验证 `fill()` 真实生效、selector 命中正确元素）。若选择器正确但数据不存在 → 数据修复。若选择器打错（如 el-date-picker wrapper）→ 修复选择器。**优先纠正选择器，不删除断言。** |

**⚡ 断言跟随线上行为 = 差异 ≠ 通过（MUST）** — 修复中若发现 PRD 预期与线上不符（如 PRD 要求禁用/校验/保留，线上未实现）：
- a) **禁止**把断言改为跟随线上行为并标记 PASSED（改断言方向 = 违反"禁止删除 PRD 预期 expect()"的变体）
- b) **必须**：标记该 TC 为 **FAILED** + 记录 `prd_vs_live_gaps` + 反馈 PM/开发（生成差异反馈文档）
- c) 仅当 PM 明确确认"按线上行为验收"时，才可改为断言线上行为并 PASSED——需在 `run_state.json` 记录 PM 确认（字段：`prd_vs_live_gaps[].status = pm_confirmed_accept`）
- 修复方向优先级：修选择器 > 修数据 > 修断言方式（toContainText 等）> ❌ 禁止改断言方向/弱化断言

**修复流程：**

```
失败 → 读取 logs/checkpoint/TCxx_checkpoint_log.json
     → ⚡ 先读顶层 failureSummary.category（框架已自动分类），按分类分流：
         - env（网络错误/5xx/失败 op 前有 error 级 console）→ 不修，标记 ENV_FAILED，报告 PM
         - selector（定位超时/strict mode violation/waiting for）→ 改 .spec.ts（更新 selector）
         - data（第 N 行/rowIndex/无结果/未命中）→ 改 .json（更新 value/rowIndex/rowDescription）
         - assertion（expect 失败）→ 先诊断选择器是否正确（MCP 实测验证），禁止删 PRD 预期 expect()；选择器正确但数据不存在 → 转数据修复
         - unknown → 走现有人工诊断全流程（读取截图 → Claude 判断），不降级诊断质量
     → 读取 before/after 截图
     → Claude 判断失败类型（failureSummary 缺失或 unknown 时）
     → 数据失效：Edit TCxx.json（更新 value/rowIndex/rowDescription）
     → 脚本失效：Edit TCxx.spec.ts（更新 selector）
     → 重跑：npx playwright test
     → 仍失败 → 再修（最多3次）
     → 3次耗尽 → 标记 FAILED，记录失败原因
```

> ⚡ **failureSummary 说明（MUST）**：checkpoint 框架在 `TCxx_checkpoint_log.json` 顶层输出 `failureSummary: { category, firstFailedOperationIndex, message }`（仅 failedOperations > 0 时出现；旧时间戳目录日志无此字段 → 按 unknown 处理走人工诊断）。分类由框架启发式判定（判定顺序 env → assertion → selector → data → unknown，与上方错误类型表一一对应；断言在 selector 之前——断言失败消息的 Call log 也含 "waiting for"，但纯 locator 超时不含 `expect(`），**修复入口优先按分类分流，不再先截图人工猜类型**；`prd_vs_live_gaps` 纪律不变（断言方向反转/跟随线上行为仍按下方 MUST 处理）。

**控制台+网络作为辅助诊断信号**（方法论来源：webapp-testing 阶段四）：
- 检查 checkpoint log 中的 `consoleMessages` 和 `networkRequests`
- `console.error` / `unhandled_error` 出现在操作失败**之前** → 环境问题（前端 JS 已报错，非当前操作引起）
- `4xx` / `5xx` 网络请求出现在操作失败**之前** → 环境问题（后端异常）
- 控制台/网络错误与断言失败**时间线对齐** → 功能缺陷（支持性证据）

**置信度门控**（方法论来源：FullScopeTest）：
- Claude 给出修复建议时需自行评估置信度
- 低置信度 → 标记 `needs_review`，不自动应用
- 高置信度 → 自动 patch 并重跑

### 5.4 陷阱记录（方法论来源：aitest-kit）

修复成功后，**MUST** 记录到 `{e2e_dir}/traps.json`（Phase 5.0 已预创建，格式为数组）：

```json
{
  "pattern": "getByRole('button', {name:'保存'}) 命中多个元素",
  "fix": "加 .filter({ hasText: '确 定' }) 限定",
  "root_cause": "antd Modal 确认和取消按钮相同的 accessible name",
  "scope": "antd_modal_buttons",
  "tcId": "TC03"
}
```

**⚡ 强制落盘验证（P0-5，MUST）**：每条修复完成后，追加条目到 traps.json 并执行：
```bash
grep -c '"tcId"' "{e2e_dir}/traps.json"
```
- 计数比修复前 **+1** → 步骤完成 ✅
- 计数未增加 → 陷阱未落盘，**步骤未完成**，回退重记。

后续 `setup-tests` 生成新脚本时，读取此文件作为 AI prompt 约束。

### 5.5 断点续跑

每完成一个 TC（分批模式下每批完成），写 `{e2e_dir}/run_state.json`：

```json
{
  "completed": ["TC01", "TC02"],
  "current": "TC03",
  "total": 12,
  "results": { "TC01": "PASSED", "TC02": "NEEDS_MANUAL" },
  "repair_history": [...],
  "executionMode": "batch",
  "batchNumber": 1,
  "repair_counts": { "TC01": 0, "TC02": 2 }
}
```

- `executionMode` / `batchNumber` / `repair_counts` 为**可选字段**（向后兼容）：缺失 → 默认逐条执行旧行为；`repair_counts` 用于 5.3 修复次数 ≤3 的计数
- 崩溃后 `run-tests --resume` 从 `current` 继续；分批模式下从 `results` 推导未完成 TC 组成续跑批

**⚡ NEEDS_MANUAL 状态（MUST）**：
- `run_state.needs_manual_verification` 列表中的 TC，执行完成后结果标记为 **NEEDS_MANUAL**（非 PASSED）
- **脚本通过 ≠ 验证完成**：自动化通过仅说明"执行无异常"，该 TC 的验证最终状态由人工复核（collect-manual）确认（如 datepicker 填值 headless 不可靠 → 自动化断言可能假通过）
- 含义：NEEDS_MANUAL = 自动化跑完但结论待人工复核，不并入通过/失败统计（报告单列"需人工复核"）

**⚡ traps 一致性校验（P0-5，MUST）**：在写 `completed` 状态前，校验：
```bash
# repair_history 条目数应大致等于 traps.json 条目数（每条成功修复对应一条 trap；若差值过大说明有修复未落盘）
# 路径经 argv 传递（{e2e_dir} 绝对路径，不随 cwd 变化）：run_state.json 与当次 traps.json 均位于时间戳目录（项目级 traps 在 e2e 根，由 gate-check 另行合并）
node -e "const s=require(process.argv[1]); const t=require(process.argv[2]); console.log('repairs:', s.repair_history.length, 'traps:', t.length); if(s.repair_history.length !== t.length) process.exit(1)" "{e2e_dir}/run_state.json" "{e2e_dir}/traps.json"
```
- 不匹配 → **阻塞**：提示差异（repair_history 有 N 条但 traps.json 只有 M 条），补齐后继续。

### 5.6 清理临时文件

全部 TC 执行完毕后，清理项目根目录和 .playwright-mcp/ 下的临时 MCP 文件：
```bash
rm -f "$PRJ"/*.png "$PRJ"/.playwright-mcp/page-*.yml 2>/dev/null
```

**⚡ 根目录残留检查（P0-9，MUST）**：清理临时文件后执行：
```bash
# ❌ 根目录不应存在 auth/ 目录（登录态只在 $PRJ/$VER/e2e/auth/）
if test -d "$PRJ/auth"; then
  echo "⚠️ 残留 $PRJ/auth/（应位于 $PRJ/$VER/e2e/auth/），已删除"
  rm -rf "$PRJ/auth"
fi
# ✅ $PRJ/$VER/e2e/ 根目录只允许 .browser-channel 和 auth/ + 时间戳目录
echo "e2e/ 目录内容（应仅 .browser-channel / auth/ / {ts}）:"
ls "$PRJ/$VER/e2e/"
# ❌ 项目根目录应仅：版本目录、源文档（PRD/测试用例）、.claude/
echo "项目根目录内容（应仅版本目录、源文档、.claude/）:"
ls "$PRJ/"
```
- 检出任何非规范文件/目录 → 提示并删除（`rm -rf` 前先向 PM 展示内容确认，非明确残留不自动删）

**⚡ traps 最终检查（P0-5，MUST）**：清理前 final check：
```bash
if [ "$(grep -c '"tcId"' "{e2e_dir}/traps.json" 2>/dev/null || echo 0)" -eq 0 ] && node -e "const s=require(process.argv[1]); process.exit(s.repair_history.length > 0 ? 0 : 1)" "{e2e_dir}/run_state.json"; then
  echo "⚠️ repair_history 非空但 traps.json 为空 — 经验未沉淀，请补记后清理"
fi
```
- repair_history 非空但 traps.json 仍为空 → **强提醒**，补记后才能进入清理。

---

## 执行模式

| 模式 | 说明 |
|------|------|
| `auto`（默认）| 有脚本跑脚本，挂了触发 AI 修复 |
| `replay` | 纯跑脚本，不触发任何 AI |
| `regenerate` | 强制重新生成所有脚本后再跑 |

---

## 完成输出

全部 TC 执行完毕后，输出以下格式的完成消息：

```
✅ 测试执行完成

📊 结果汇总：
  - 总计：{total} 条 TC
  - 通过：{passed}
  - 失败：{failed}
  - 修复：{repaired}
  - 跳过：{skipped}
  - 通过率：{rate}%

🔧 自愈统计：
  - 数据修复：{data_repairs} 次
  - 脚本修复：{script_repairs} 次
  - 陷阱记录：{traps} 条

▶️ 下一步：说「查看报告」生成报告。（**NEXT-TEST 模板**，话术库，见 CLAUDE.md「话术模板库」节）
```

**填充规则**（占位符口径，输出时须与此一致）：
- `{total}`：`run_state.json` 的 `total` 字段
- `{passed}` / `{failed}` / `{skipped}`：按 `run_state.json` 的 `results` 汇总（值 PASSED / FAILED / SKIPPED）；**NEEDS_MANUAL 不计入通过/失败统计**（报告单列"需人工复核"，见 Phase 5.5）
- `{repaired}`：本次执行中修复后通过的 TC 数（依据 `repair_history` 记录）
- `{rate}`：`{passed} / ({total} - {skipped}) × 100%`，保留一位小数
- `{data_repairs}` / `{script_repairs}`：`repair_history` 按修复类型（数据 / 脚本）分别计数
- `{traps}`：`traps.json` 条目数（口径与 Phase 5.4 落盘校验一致：`grep -c '"tcId"'`）

---

## 约束

1. **只修脚本和数据** — 不修改被测应用
2. **每个 TC 独立** — 一个 TC 失败不阻塞后续
3. **修复最多 3 次** — 超过标记 FAILED
4. **禁止无限等待** — 每个 checkpoint 30s 超时（shared.ts CHECKPOINT_TIMEOUT_MS），整个 TC 120s 超时（playwright.config.ts `timeout: 120000`，模板与固化版一致）
5. **证据不丢失** — 失败时的截图和日志优先保留
6. **不关闭浏览器** — 测试完成后保持窗口，由 PM 决定是否关闭
7. **FORBIDDEN：禁止用 MCP 浏览器工具替代 `npx playwright test` 执行测试** — MCP 工具仅限 Phase 4 登录和 Phase 5.3 失败诊断。Phase 5.1 测试执行必须走 Bash + Playwright CLI。违反此条将导致：无 checkpoint 日志、无 before/after 截图、无可审计证据链。
8. **每条 TC 执行后必须验证 logs/checkpoint/ 落盘** — 无日志 = 无效执行。
9. **SPA 状态缓存（可选优化）** — 方法论来源：webapp-testing 阶段五。连续多个 TC 操作同一 base URL 时，可复用浏览器 page 实例避免重复 `page.goto`（提速约 40%）。每个 checkpoint 仍独立记录，不降级门控原则。
10. **修复操作必须记录 before/after** — 每次 Edit 脚本或数据前，记录被修改的值（原始值 → 新值），写入 `repair_history` 供审计。
11. **⚡ 禁止"断言跟随线上行为"式通过（MUST）** — PRD 预期与线上不符 = 差异 = 缺陷信号：必须 FAILED + 记录 `prd_vs_live_gaps` + 反馈 PM/开发；仅当 PM 明确确认"按线上行为验收"时才可改为断言线上行为并 PASSED（`run_state.json` 中 `prd_vs_live_gaps[].status = pm_confirmed_accept`）。禁止改断言方向 / 弱化断言（详见 Phase 5.3）。

---

## 禁止行为

1. **禁止用 MCP 浏览器替代 `npx playwright test` 执行测试**（细则同约束 7）
2. **禁止"断言跟随线上行为"式通过 / 反转断言方向**（细则同约束 11）
3. **禁止无限等待**（细则同约束 4）
4. **禁止修改被测应用**（细则同约束 1）
5. **禁止静默选择 e2e 目录** — 多目录时必须展示清单让 PM 选择（时间戳 | spec 数 | 完成状态 | 有报告？）
6. **禁止丢失证据**（细则同约束 5）
7. **禁止不记录修复历史**（细则同约束 10）

---

## 边缘情况处理

### 场景 1：模式 A 执行中 401/403 或跳登录页（登录态失效）

冒烟验证只证明"页面开得了"，证明不了"API 带 cookie 正常"——模式 A 执行中仍可能暴露 401。

自动诊断（不直接通知 PM）：
1. **检测触发条件**：任何 TC 出现 401/403、`page.url()` 含 login、或 checkpoint 日志中 `pageTitle` 为"登录"/"未登录"错误
2. **降级模式 B**：暂停本批 → 用 run-all.cjs（单进程，headless + storageState）重跑该 TC
3. 模式 B 也 401 → 通知 PM 重新登录：
> ⚠️ 登录态已失效。之前的登录可能已过期。我会重新打开浏览器。
> 请再次手动登录，完成后告知我"已登录"。

重新执行 Phase 4.3-4.4，重跑冒烟，然后从当前批次继续。

### 场景 2：连续 3 个 TC 全部环境错误

如果连续 3 个 TC 因 `net::ERR_CONNECTION_REFUSED` 或 `500` 失败：

> ⚠️ 连续 3 条 TC 因环境问题失败，被测服务可能已宕机。
> 失败 TC：{tc_list}
> 是否暂停测试？输入"继续"跳过当前环境错误 / "停止"终止测试 / "重试"重新检查服务状态。

### 场景 3：修复 3 次耗尽后仍失败

> ❌ TC-{id} 修复 3 次仍失败。
> 失败原因：{最后一次错误}
> 修复记录：
>   - 第 1 次：{strategy} → {result}
>   - 第 2 次：{strategy} → {result}
>   - 第 3 次：{strategy} → {result}
> 
> 已标记为 FAILED。是否跳过继续下一个 TC？或手动介入修复？

### 场景 4：playwright.config.ts 写入失败（磁盘满/权限问题）

> ❌ 无法写入 playwright.config.ts：{error_message}。
> 请检查磁盘空间和目录写入权限后重试。

终止当前批次执行，保留已完成的 TC 结果。

### 场景 5：MCP 浏览器工具不可用（仅限诊断阶段）

如果 Phase 5.3 修复时需要 `browser_snapshot` 但 MCP 浏览器不可用：

> ⚠️ MCP 浏览器工具不可用，无法获取当前页面 DOM 快照。
> 修复将仅基于错误消息和已有 checkpoint 日志进行（置信度较低，可能标记 needs_review）。
> 是否继续？或手动提供当前页面的 DOM 信息？

### 场景 6：修复中发现 PRD 预期与线上行为不符（断言跟随线上行为）

Phase 5.3 修复中确认 PRD 预期与线上不符（如 PRD 要求 loading 期间禁用但线上可编辑）时，**禁止静默改断言方向并 PASSED**，向 PM 展示差异并请求决策：

> 🔍 TC-{id} 断言失败，诊断发现 PRD 预期与线上行为不符：
> - PRD 预期：{prdBehavior}
> - 线上实测：{liveBehavior}
> 如何处理？
> ① 按 PRD 验收（推荐）→ 该 TC 标记 **FAILED**，差异记入 `prd_vs_live_gaps`，生成差异反馈文档
> ② 按线上行为验收 → 需 PM 明确确认，改为断言线上行为并 PASSED，`prd_vs_live_gaps[].status = pm_confirmed_accept`
> ③ 暂缓 → 标记 SKIPPED，差异记入 `prd_vs_live_gaps`，待 PM 与开发对齐后再定

- 选 ① → 按 Phase 5.3 纪律 a/b 执行：FAILED + `prd_vs_live_gaps` + 差异反馈文档
- 选 ② → 仅此时允许改断言方向，且必须写入 `run_state.json` 的 `prd_vs_live_gaps[].status = pm_confirmed_accept`
- 选 ③ → 不修改断言，标记 SKIPPED 并记录差异

---

## 示例

### 正例：自动修复数据失效

**场景**：TC01 执行失败，错误为 `getByRole('button', {name:'编辑'}) 在第 0 行未命中`。

**执行流程**：
1. 读取 `TC01_checkpoint_log.json` → 操作 `click_edit` 失败，`beforeScreenshotPath` 存在
2. 分析截图 → 发现第 0 行是"张三<12345>"而非数据文件中记录的"赵六<1004>"
3. 判断类型 → 数据失效（数据已变化）
4. Edit `data/TC01.json`：更新 `rowIndex: 0` → `rowIndex: 2`，`rowDescription` 更新为实际值
5. 重跑 `npx playwright test TC01.spec.ts` → 通过
6. 记录到 `traps.json`：`pattern: "排序变化后 rowIndex 失效"`, `fix: "改用文本匹配定位行"`
7. 更新 `run_state.json`：TC01 → PASSED

### 反例：用 MCP 工具直接操作页面替代 `npx playwright test` ❌

**错误做法**：TC01 执行时，PM 用 `browser_click` + `browser_type` + `browser_snapshot` 手动走完操作流程，然后说"TC01 通过了"。

**错误原因**：
1. 没有运行 `npx playwright test`，不会生成 `checkpoint_log.json`
2. 没有 before/after 截图，无法审计证据
3. 没有操作耗时记录
4. 手动操作无法复现，结果不可靠
5. 后续 `generate-report` 无法读取 checkpoint 日志，报告将缺失该 TC 详情

**正确做法**：必须通过 Phase 5.1 的 Bash + `npx playwright test` 执行。

---

## 评估测试

### 正向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `run-tests` | 进入 Phase 4.1，查找 e2e 目录 |
| 2 | `开始测试`（已有脚本） | 路由到 Phase 4，开始测试执行 |
| 3 | `run-tests --resume` | 从 `run_state.json` 的 `current` 继续 |
| 4 | PM 在 `pmcraft 测试完整流程` 流程中被路由到 `run-tests` | 自动执行 Phase 4-5 |
| 5 | `跑测试`（setup-tests 刚完成） | 路由到 `run-tests` |

### 负向触发（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | PM 说 `生成脚本` | 路由到 `setup-tests`，不触发 `run-tests` |
| 2 | PM 说 `查看报告` | 路由到 `generate-report`，不触发 `run-tests` |
| 3 | PM 说 `帮我部署` | 不触发 — 这是部署操作 |
| 4 | PM 说 `写个测试用例` | 不触发 — 这是测试用例编写，非执行 |
| 5 | `run-tests` 但无 e2e 产出物 | 输出"没有找到 e2e 产出物，请先说「生成脚本」。" |

### 边缘查询（5 条）

| # | 输入 | 预期行为 |
|---|------|---------|
| 1 | `run-tests` 但 storage.json 无效 | 触发边缘场景 1，提示重新登录 |
| 2 | `run-tests` 但被测服务器 500 | TC 标记为环境问题（不纳入缺陷），继续后续 TC；连续 3 个触发边缘场景 2 |
| 3 | `run-tests` 但 MCP 浏览器不可用 | Phase 4 登录提示手动操作；Phase 5.3 诊断降级为仅分析日志 |
| 4 | 修复中发现 PRD 预期与线上不符 | 触发边缘场景 6，展示差异并请求 PM 决策，禁止静默改断言方向 PASSED |
| 5 | 批内含 needs_manual_verification 列表中的 TC 且脚本通过 | 结果标记 NEEDS_MANUAL（非 PASSED），提示待 collect-manual 人工复核（Phase 5.1） |

---

## 参考文档

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| `references/login-storage-snippets.md` | URL 校验函数、storageState 提取、JWT TTL 解析脚本 | Phase 4.2 / Phase 4.4 |
| `references/playwright-templates.md` | 冒烟验证脚本、playwright.config.ts 模板、run-all 启动参数 | Phase 5.0.5 / Phase 5.1 |
