---
name: deploy-survey
description: 问卷部署。将调研计划与问卷 markdown 文档部署为可填写的网页问卷，在本机生成局域网可访问链接发给用户填写。当 PM 说"部署问卷"、"部署一下问卷"、"发布问卷"、"发布一下问卷"、"生成问卷链接"时触发，或在 design-survey 完成后自动询问。
type: skill
tags:
  - 问卷部署
  - 问卷链接
  - survey
  - deploy
  - web
  - questionnaire
allowed-tools: [Read, Write, Glob, Bash, AskUserQuestion, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_console_messages, mcp__playwright__browser_resize, mcp__playwright__browser_close, mcp__playwright__browser_evaluate]
dependencies:
  - Node.js（LTS，scripts/deploy-survey.js 与 server.js 运行所需；脚本内置 Node 自检，缺失时退出码 2 + 友好提示，LLM 引导安装后重试）
argument-hint: "[功能顶级文件夹] [功能版本号]"
prompt: 部署问卷|部署一下问卷|发布问卷|发布一下问卷|生成问卷链接|deploy-survey
---

# 问卷部署 (deploy-survey)

## 概述

**本技能源码目录**：当前 SKILL.md 所在目录（如 `.../pmcraft-req/skills/deploy-survey/`），脚本与模板路径一律由此锚定解析，不依赖 cwd。

读取 `design-survey` 产出的调研计划与问卷 markdown 文档，自动生成可填写的网页问卷并部署到本机，PM 拿到链接即可发给用户填写。**设计和部署不是两件事——对 PM 来说就是把问卷变成能填的链接。**

内部两个阶段对 PM 透明：
1. **生成**：从 survey.md 解析题目 → survey.json → 复制模板引擎 → 网页问卷
2. **部署**：起 Node 服务 → 访问链接 → 发给用户

**机械操作全部由 `scripts/deploy-survey.js` 完成**：模板复制、index.html 标题替换、survey.json/settings.json 写入、survey.json 结构校验（调用 `.gen_survey.js`）、端口检测/递增、服务启动、可达性校验、管理员登录校验。

**保留 AI 环节**：survey.md→survey.json 解析（第 2 步）、Playwright 前端测试（第 7 步）、7c 自动修复循环。

## Guard-Chat 守卫检查（第 0 步）

> 本小节为守卫开关检查，**不阻塞**主流程：执行完直接进入下一节。**子代理上下文**（被 spawn 执行、无法与用户交互，如 doc-reviewer/design-reviewer）整节静默跳过——不询问、不标记、不检测。

1. 运行 `node "{插件根}/_shared/scripts/guard-chat.js" status`，`{插件根}` = 从当前 SKILL.md 目录向上找第一个含 `_shared/scripts/guard-chat.js` 的祖先目录（source 环境=市场根，cache 环境=插件版本目录）。
2. 解析单行 JSON（契约：`{"status":"ok","data":{"enabled":bool,"prompted":bool,"dir":"…"}}`）：
   - `prompted=false` → 按话术库 GUARD-ASK（`enabled=false`）或 GUARD-ON（`enabled=true`）提示一次，然后运行 `node "{插件根}/_shared/scripts/guard-chat.js" mark-prompted`。用户紧随询问回复肯定意图（如「开启」），或任意轮次说「开启Guard-Chat」（路由表已注册）时，运行 `guard-chat.js enable`。
   - `prompted=true` → 跳过，不重复提示。
   - 话术库不可达（项目未跑 init-project、无大脑注入）→ 用兜底一句：「本会话可开启 Guard-Chat 守卫：开启后，你输入中可能影响判断的表述（如预设立场、权威宣称、逻辑谬误）会当场标注提醒；落盘文档中的对话填充语（如“好问题”、“希望对你有帮助”）会自动清除。说「开启Guard-Chat」开启（回复「开启」也可以），本会话只问一次。」（兜底非权威副本，有话术库时必须用话术库）
3. 脚本不可用（node 缺失/脚本缺失/JSON 解析失败）→ 静默跳过，继续主流程。
4. 本技能对话期间（仅 `enabled=true` 时）：① 每条用户消息经 `guard-chat.js detect`（stdin）检测，命中时单行简短标记，不打断流程；② 文档落盘前（save-doc 保存、直接写入报告文件）经 `guard-chat.js purify`（stdin）净化。规则见路由大脑「Guard-Chat 守卫行为」节。对话回复文风遵循 agent 定义的文风底线（无需脚本）。

## 输入

| 参数 | 类型 | 必选 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| 功能顶级文件夹 | 目录路径 | 是 | 功能的顶级目录 | `./电视比价` |
| 功能版本号 | 字符串 | 是 | 问卷所在的版本号 | `1.0.0` |

## 触发方式

两种入口：

| 入口 | 触发条件 | 行为 |
|:---|:---|:---|
| 自动 | `design-survey` Phase 6 保存完成后 | AI 主动询问"问卷已保存。要部署成网页问卷、生成链接发给用户填写吗？" |
| 手动 | PM 说"部署问卷"/"发布问卷"/"生成问卷链接" | 直接启动部署流程 |

## 工作流程

### 第 0 步：Node 自检

1. 先自行运行 `node --version` 探测。**命令不存在或返回非零** → 直接停止部署，按下方话术回复（此情况下 `node` 命令都起不来，脚本根本跑不到自检，不能等脚本报错）。
2. 部署脚本 `deploy-survey.js` 内部另有一道 Node 自检作兜底：`node --version` 不可执行时，脚本输出 `{"status":"error","data":{"message":"未检测到 Node.js",…}}` 并以**退出码 2** 结束。**退出码为 2，或输出中出现 `未检测到 Node.js`** → 同样判定为 Node 缺失。
3. 以上两种情况都停止部署，回复以下话术；用户装好 Node 后重试本技能：
  > "本机没检测到 Node.js，部署需要它。到 https://nodejs.org 下载 LTS 版安装后，再回来说'部署问卷'。"

### 第 1 步：定位 survey.md

1. 如果调用方传入了功能顶级文件夹和版本号 → 直接定位 `{功能顶级文件夹}/{版本号}/survey/` 下的 `*调研计划与问卷*.md`
2. 否则 → 扫描当前项目目录下的版本目录，找到最新版本，定位其 `survey/` 下的 markdown 文件
3. 找不到 → "还没有问卷设计文档，请先对我说「设计问卷」/「做问卷」来设计问卷。"

### 第 2 步：从 survey.md 解析题目 → 生成 survey.json

读取 survey.md，AI 在对话中解析题目结构，生成 `survey.json`。

**survey.json 完整结构参考：**

```json
{
  "title": "问卷大标题",
  "type": "internal",                     // 问卷类型：internal（内部）/ external（外部）
  "intro": {                              // 封面页（模板引擎读 SURVEY.intro.xxx）
    "title": "问卷大标题",
    "leadHtml": "<p>HTML 引导语...</p>"
  },
  "thanks": {                             // 提交后感谢页（模板引擎读 SURVEY.thanks.xxx）
    "title": "问卷完成",
    "body": "感谢你的参与！",
    "contact": "联系方式（可选）"
  },
  "terminate": {                          // 被终止的问卷页（模板引擎读 SURVEY.terminate.xxx）
    "title": "问卷终止",
    "body": "你不符合本次调研条件，感谢关注。"
  },
  "boards": [                             // 板块 = 分页
    {
      "id": "board-id",
      "title": "板块标题",
      "progress": 20,                     // 进度条百分比
      "questions": [
        {
          "id": "Q1",
          "type": "single|multi|scale|text|textarea|matrix|likert5|likert7|rank",
          "title": "题目标题",
          "required": true,               // 默认 true，false 表示选填
          "hint": "小字提示（可选）",
          "options": [                     // single/multi/rank 必填
            { "v": "A", "label": "选项文字", "isOther": true, "exclusive": true }
          ],
          "max": 5,                        // multi 题可选上限；filterBy（single/multi/rank 通用）与 rank 的 min/max 见下方关键约束
          "ends": ["极不可能", "非常可能"], // scale 题两端标签
          "rows": ["行1"], "cols": ["标签1", "标签2"],  // matrix 题列标签（必须是字符串数组，模板直接输出，传对象会显示 [object Object]）
          "placeholder": "提示文字",       // text/textarea
          "condition": "return a.S1==='A';" // 条件逻辑 JS 表达式
        }
      ]
    }
  ],
  "adminQdef": [                          // 管理后台图表配置
    { "id": "Q1", "title": "显示标题", "type": "single" }
  ]
}
```

**关键约束：**
- `intro`、`thanks`、`terminate` 这三个嵌套对象必须包含 `title` 和 `body`/`leadHtml`——模板引擎用 `SURVEY.intro.title`、`SURVEY.intro.leadHtml` 等路径读取，写成平层字段（如 `greeting`）会导致白屏。
- boards/questions 的 id 和 adminQdef 的 id 应一一对应（不一致时管理后台图表不完整）。
- **rank 排序题**（2026-09-09 补丁，见 PATCHES-NOTE 第 4 条）：`"type": "rank"`，除 `options`（必填）外可选三个字段——`filterBy`（字符串，引用问卷中某 `multi` 题的 id，只渲染该多选被勾选的选项）、`min` / `max`（数字，至少/至多可排位数，`max ≥ min ≥ 1`，缺省 `min=1`、`max` 不限）。**答案格式：有序数组**——元素为所选选项的 `v`，数组顺序即排名（如 `["A","C"]` = A 第一、C 第二）；CSV 以 `;` 保序导出，管理后台按 Top1=3 / Top2=2 / Top3=1 加权计分。
- **选项联动 filterBy**（2026-09-09 补丁，见 PATCHES-NOTE 第 6 条）：`single` / `multi` / `rank` 均可配 `filterBy`（字符串，引用问卷中某 `multi` 题的 id），该题只渲染来源多选已勾选的选项；来源题勾了「其他」（`isOther`）时，**single / multi 联动题**的对应选项自动沿用其填写的名称（rank 分支仅做选项过滤与陈旧剔除，不含名称沿用——如实注记）。来源题选择变化后，联动题中已失效的旧答案自动清除（单选清空、多选/排序剔除），避免选项消失后答案悬空。未配 `filterBy` 的题不做联动过滤——single / multi 维持原渲染；rank 题未配 `filterBy` 时以本题全部选项为可见集（2026-09-17 修复，见 PATCHES-NOTE 第 7 条）。
- **技能类题 `skills`（引擎内部扩展，2.0.0 起）**：顶层可选 `"skills": {"<选项值>": "<显示名>"}` 映射（admin 端以 `SKILLS_MAP` 消费）；题目或 `adminQdef` 条目带 `"skills": true` 时，后台逐题分布按该映射渲染选项并按作答热度降序排序（admin.html:290、302），`.gen_survey.js` 对带 `"skills": true` 的 single/multi/rank 题豁免 `options` 必填校验（豁免仅覆盖校验层：填写页选项一律由 `options` 渲染、不读 `skills` 映射——省略 `options` 的题在填写页无选项可渲染，必答题将无法作答，配置时请保留 `options`）。普通问卷不配置该字段即可，行为不变。
- **保留 ID**：模板引擎依赖以下固定 question id，不可自定义。未正确使用会导致提交失败（后端 400）或后台数据缺失：

  | 保留 ID | 类型 | 适用问卷 | 说明 |
  |:---|:---|:---:|:---|
  | `nickname` | `text` | 内部问卷（`type: "internal"`） | 昵称，`buildPayload()` 作为顶层字段提交 |
  | `empId` | `text` | 内部问卷（`type: "internal"`） | 工号，服务端校验 `/^\d{4,5}$/`；建议加 `pattern: "^\\\\d{4,5}$"` |
  | `ATT` | `scale` | 含注意力检测的问卷 | 引擎特殊处理，不放入 `answers`，单独构造 `attention` 对象；必须有 `attNote` |
  | `S1` | `single`/`multi` | 有筛选题的问卷 | 筛选题标准 id，`condition` 逻辑以此为锚点 |

  每次生成 survey.json 后 `.gen_survey.js` 会自动校验以上规则，校验失败会阻止部署。校验另含两条防线（2026-09-09 补丁，见 PATCHES-NOTE 第 5 条）：**adminQdef 登记完整性**——boards 中的题（保留 ID 除外）未登记进 adminQdef 时告警（否则后台逐题分布会静默漏题）；**condition 引用有效性**——`a.<题id>.indexOf('<字母>')` 中的字母不存在于被引用题时判错、存在但属非互斥项时告警（疑似选项重排后旧版「以上都没有」残留）。

解析规则：
- 从"问卷正文"章节提取题目
- 识别题型：`[ ] ` 开头 = 单选/多选题，`\| 非常不同意 \|` 表格 = 量表题/矩阵题，含"注明"或"__________" = 文本题
- 按板块（H3 标题）分组为 boards
- 筛选题标注 `condition` 逻辑

生成后调用 `.gen_survey.js` 校验：

```bash
node "{本技能源码目录}/templates/.gen_survey.js" <临时 survey.json 路径>
```

校验失败 → AI 修正后重验（**最多 2 轮**——同一份 survey.json 修正重验 2 轮仍失败 → 停止部署，列出全部校验错误项交 PM 处理，不无限重验）。校验通过 → 继续。

### 第 3 步：运行部署脚本（模板复制 + 配置写入 + 启动）

第 2 步生成并校验通过 `survey.json` 后，将临时 survey.json 传入部署脚本。脚本自动完成模板复制、标题替换、配置写入、端口管理、服务启动与校验：

> **参数安全（Bash 注入防护）**：`--survey-title` 来自调研计划文档内容（文件内容拼接），构造 Bash 命令前必须剔除 `"` `` ` `` `$` `;` `&` `|` `(` `)` 等 shell 元字符，并用双引号包裹后传入。
>
> **临时文件位置**：`--survey-json` 统一写入 `<项目根>/pmcraft/temp/`（若不存在则先创建）。**禁止写入系统 Temp 或 cwd**——写入项目内临时区确保部署失败时 survey.json 可追踪复核。
>
> **运行依赖**：`deploy-survey.js` 依赖 `_shared/scripts/lib/` 下的共享库（json-output / encoding / port-finder / deploy-common），并按跨插件约定从 `pmcraft-proto/skills/deploy-prototype/templates/close.bat-template` 取 `close.bat`。二者缺失时脚本分别抛错"pmcraft 共享库缺失""close.bat 模板缺失"——按提示重跑 `setup.cmd` 后重试，不要自行手搓替代文件。

```bash
node "{本技能源码目录}/scripts/deploy-survey.js" \
  --version-dir="C:/项目/电视比价/1.0.0" \
  --survey-json="C:/项目/电视比价/pmcraft/temp/survey.json" \
  --survey-title="电视比价功能用户满意度调研"
```

脚本执行内容（对应原第 3-6 步）：
1. **目标目录**：检查 `survey/web/` 是否存在，已存在时返回 `interaction`（询问是否覆盖，mock/ 数据保留）
2. **模板复制**：从 `templates/` 复制 `index.html` / `admin.html` / `server.js` / `design-system.css`，以及 `templates/scripts/` 下的 `start.bat` / `allow-firewall.bat` / `remove-firewall.bat`，全部落到 `survey/web/` **根目录**（bat 与 index.html 同级；不复制 `.gen_survey.js`）。`close.bat` 不在 `templates/scripts/` 内，由脚本从 **pmcraft-proto** 的 `deploy-prototype/templates/close.bat-template` 复制（跨插件单一事实源，缺失即报错）
3. **端口同步 + 标题替换**（顺序不可颠倒）：先把复制来的 `server.js` / `start.bat` / `allow-firewall.bat` / `remove-firewall.bat` / `admin.html` / `index.html` 中硬编码的 `5178` 换成实际端口（否则手动重启会起在旧端口、防火墙放行错端口、后台指引变死链）；**再**修改 `index.html` 的 `<title>` 为 `--survey-title`（问卷标题可能含字面 "5178"，颠倒顺序会被端口替换静默改坏）
4. **配置写入**：`survey.json` → `mock/survey.json`；生成 `mock/settings.json`（`adminPassword` 6 位随机数字，`allowMulti: false`；`startTime`/`endTime` 由 server.js 默认值补齐为 null；已存在时保留旧密码）
5. **结构校验**：内部调用 `.gen_survey.js` 校验 survey.json（失败则脚本报错）
6. **端口检测**：读取 server.js 默认端口，冲突则 +1（上限 +10）
7. **启动服务** + IP 地址计算 + `curl localhost:{端口}/` 可达校验 + `POST /api/admin/login` 登录校验

解析输出 JSON：
- `status: "ok"` → 按第 8 步输出确认模板展示（使用 data 中的 `fill_url`、`admin_password`、`port`、`lan_ips`、`admin_login_ok`）
- `status: "interaction"` → 见下方交互点
- `status: "error"` → 按错误处理展示

#### 交互点

| data.ask | 触发条件 | LLM 询问 | 传回参数 |
|:---|:---|:---|:---|
| `overwrite_existing` | survey/web/ 已存在 | "survey/web/ 下已有旧版网页问卷。是否覆盖？（旧版的答卷数据在 mock/ 中，覆盖不会删除数据）" | `--answers=overwrite` |
| `port_in_use` | 端口被本问卷自身占用 | "这个问卷已经在 {端口} 上跑着了：{链接}。直接用这条链接，还是停掉重启？" | `--answers=reuse` 或 `restart` |

若 `admin_login_ok: false` → 检查 settings.json 的 `adminPassword` 字段名（server.js 验证 `readSettings().adminPassword`），修正后重跑脚本。

### 第 7 步：自动化测试（API 冒烟 + 前端渲染）

服务启动后、输出确认前，自动运行两层测试。**测试未通过前不输出部署确认给 PM。**

详细测试步骤定义在 `templates/smoke-test.md`，此处只列流程。

#### 7a. API 冒烟测试（后端 + 接口层）

测试数据使用固定工号 `00000` 和昵称 `_test_runner_`，测试后自动清理。

读取 `templates/smoke-test.md` 的 **7a. API 冒烟测试** 章节，在 Bash 中依次执行 T1-T7、T14、T15、T16 命令，然后按该文件的 **API 判定规则** 判定。**如果读取失败** → 按内嵌步骤执行 T1-T7：T1 首页 `curl` 返回 200；T2 `mock/survey.json` 可读取且 `.gen_survey.js` 校验通过；T3 用 `00000`/`_test_runner_` 完整提交返回 `true`；T4 重复提交被拦截；T5 非法工号被拒；T6 管理员登录成功；T7 提交数据回显一致；T14 数据完整性逐字段比对一致；T15 isOther 附加文本提交+回显一致；T16 必填字段缺失被拒。全部通过视为 7a 通过，并在汇总输出中标注"smoke-test.md 缺失，已按内嵌步骤执行"。

**测试全部通过** → 继续 7b。**有失败测试** → 进入 7c 自动修复循环。

#### 7b. 前端渲染测试（Playwright 浏览器层）

**前置条件**：7a 清理后无数据残留。先调用 `browser_resize` 设置 1280×800 视口。

读取 `templates/smoke-test.md` 的 **7b. 前端渲染测试** 章节，按 T8-T13、T17 顺序执行 Playwright 操作，然后按该文件的 **前端判定规则** 判定。**如果读取失败** → 按内嵌步骤执行 T8-T13：T8 封面渲染（标题可见、`#btnStart` 存在）；T9 身份板块（`nickname`/`empId` 输入框在 DOM）；T10 已提交后无 errBanner 之外阻断（含"已经提交过"文案）；T11 各题型板块交互不卡住（matrix 表头非 `[object Object]`）；T12 提交后到达感谢页；T13 管理后台登录后图表有数据；T17 管理后台设置保存后刷新依然保持。全部通过视为 7b 通过，标注降级执行。

**关键规则**：调用 `browser_take_screenshot` 时不传 `filename` 参数，使用默认命名让截图自动保存到 Playwright 输出目录，与 `.playwright-mcp/` 快照同级，不污染项目目录。

**测试全部通过** → 继续汇总输出。**有失败测试** → 进入 7c 自动修复循环。

#### 汇总输出

测试全部完成后，按 `templates/smoke-test.md` 的 **汇总输出模板** 格式打印结果。**如果读取失败** → 按 `✅ API 冒烟测试：{N}/10 通过 | 前端渲染测试：{N}/7 通过（{失败项列表}）` 一行格式打印，标注降级执行。

### 第 7c 步：自动修复循环

如果 7a/7b 中有测试失败，进入结构化自修复循环，**不立即停止部署**。

#### 修复流程

每轮流程（最多 **3 轮**）：

1. 收集本轮所有失败测试
2. 按下方的 **修复映射表** 执行对应的诊断与修正动作
3. 重新跑失败的测试（仅重跑失败项，不重复整个测试套件）
4. 本轮全部通过 → 跳出循环，继续汇总输出
5. 3 轮后仍有失败：
   - **核心项失败**（T1-T3/T6/T8/T9/T11/T12/T13）→ 停止部署，输出所有失败项和已尝试的修复
   - **仅非核心项失败**（T4/T5/T7/T10/T14/T15/T15b/T16/T17）→ 输出 warning，继续部署

> 重跑失败测试时：API 测试（T1-T7）直接用 curl，前端测试（T8-T13）用 Playwright。
> 每轮重跑前清理上一轮的测试数据（`curl -X POST .../api/clear`）。
> 重跑 T10 前需要重新通过 API 预提交一个重复记录。

#### 修复映射表

| 测试 | 失败典型原因 | 自动修复动作 | 重试方式 |
|:---|:---|:---|:---:|
| T1 首页 200 | 服务未启动 / 端口错误 | 检查端口是否空闲 → 重新 `Start-Process node server.js` → `curl` 验证 200 | curl |
| T2 survey.json | 文件格式错误 / 未写入 mock/ | 重新用 `.gen_survey.js` 校验 → 修正后重新写入 `mock/survey.json` | curl |
| T3 完整提交 → 非 `true` | 400 invalid empId：身份题 id 不是 `nickname`/`empId` | 检查 survey.json 中身份题的 id → 修正为 `nickname`/`empId` → 重新写入 | curl |
| | 400 其他字段不匹配：`buildPayload` 字段名与 question id 不一致 | 检查提交 payload 的 key 是否匹配 board 中 question 的 id → 修正 | |
| T4 重复拦截 → `false` | `settings.json` 中 `allowMulti` 被设为 `true` | 修正 `settings.json` 中 `allowMulti: false` | curl |
| T5 工号校验 → `false` | empId 题缺 `pattern` 正则，服务端接受非法格式 | 给 empId 题补充 `"pattern": "^\\\\d{4,5}$"` → 重新写入 survey.json | curl |
| T6 管理员登录 → `false` | `settings.json` 的密码字段名不是 `adminPassword` | 检查字段名是否为 `adminPassword`（非 `password`）→ 修正 | curl |
| | 密码不匹配 | 读取当前 `adminPassword` 值，用该值重新测试登录 | |
| T7 数据回显 → `false` | T3 提交未正确写入 | 重新执行 T3 提交 → 再跑 T7 回显 | curl |
| T14 数据完整性 → `false` | 某个答案字段值错位 / 精度丢失 | 检查 survey.json 中 question id 与 payload key 不匹配 → 修正 id | curl |
| | 字段值类型不对（string vs number） | 检查提交 payload 中各字段类型是否匹配引擎期望（如 likert 传数字、single 传字符串）→ 修正 | |
| T15 isOther → `false` | `isOther` 选项的附加文本字段不在提交 payload 中 | 检查 index.html 的 `buildPayload()` 中 `_other` 字段拼接逻辑 → 若不确认不修改引擎代码，检查提交时是否正确传了 `Q4_other` / `Q10_other` | curl |
| T15b isOther 回显 → `false` | 服务端未保存 `_other` 字段 | 检查 server.js 的 `/api/submit`：`data.answers` 整体原样写入 responses.jsonl（含 `_other` 后缀字段，无字段过滤）→ 若字段确实丢失，检查前端提交 payload 是否携带 → 若不确认不修改 server.js | curl |
| T16 必填拒绝 → `false` | 缺 `empId` 的提交未被拒（返回 200 而非 400 invalid empId） | 检查 server.js `/api/submit` 是否含必填校验 `if (!mid || !/^\d{4,5}$/.test(mid)) return …400`（完整安装应已含）→ 缺失则按 PATCHES-NOTE 重新同步官方源，不自行改动引擎 | curl |
| T8 封面渲染错误 | JS error：`survey.json` 的 `intro` 结构错误 | 检查 `intro`/`thanks`/`terminate` 是否均为嵌套对象（含 `title`+`leadHtml`/`body`）→ 修正 survey.json | Playwright |
| | 无 `#btnStart` 按钮：`title` 字段缺失 | 检查 `title` 字段 → 修正 survey.json | |
| T9 身份板块异常 | 输入框 `nickname`/`empId` 不在 DOM 中 | 检查身份板块 questions 中是否存在 id 为 `nickname`/`empId` 的 text 题 → 修正 survey.json | Playwright |
| T10 重复阻断 → 无 errBanner | `allowMulti` 已关闭但前端文案不匹配 | 检查 errBanner 文案在 index.html 中是否包含"已经提交过"关键词（不为通用服务端错误文案）→ 不修改引擎代码 | Playwright |
| T11 题型交互卡住 — matrix 表头 `[object Object]` | `cols` 传了对象数组而非字符串数组 | **渲染完整性检查** `browser_evaluate` 返回 `true` → 确诊为渲染异常 → 检查 matrix 题 `cols` 元素类型 → 改为字符串数组如 `["满意","不满意"]` → 重新写入 survey.json | Playwright |
| T11 题型交互卡住 — 某板块 JS 抛异常 | 该板块某题配置缺失（如 `options`、`rows`、`labels`） | 检查该板块各题的必填字段 → 修正 survey.json | Playwright |
| T12 提交后无感谢页 | `thanks` 结构缺失或字段名错误 | 检查 `thanks` 是否为对象含 `title`+`body` → 修正 survey.json | Playwright |
| T13 管理后台无数据 | `adminQdef` 的 `type` 字段未归一化 | server.js 重启后 admin.html 重新 fetch → 若仍无数据，检查 `adminQdef` 的 `id` 是否与 board question 的 `id` 一一对应 | Playwright |
| T13 管理后台 JS error | `adminQdef` 某字段缺失 | 检查 `adminQdef` 每项至少包含 `id`、`title`、`type` | Playwright |
| T17 设置持久化 → 刷新后设置丢失 | settings.json 写入失败 / 保存接口未正确持久化 | 检查 `POST /api/settings` 的返回和 settings.json 文件内容 → 重新保存 | Playwright |
| | server.js 未写入文件（仅内存保留） | 检查 server.js 的 saveSettings() 是否写入文件 | |

> **修复后刷新**：修改 survey.json 后 server.js 实时读取，无需重启服务。修改 settings.json 后也无需重启。
> **修复后重跑验证**：每轮修复后只重跑之前失败的测试，不重跑已通过的。用同一端口，不重新启动服务。

#### 修复示例对话片段

```
T3 失败，返回 400 invalid empId → 检查 survey.json 身份题，
发现 id 是 "Q1"/"Q2" → 改为 "nickname"/"empId" → 
重写 mock/survey.json → 重跑 T3 → 通过

T11 失败，Playwright 快照显示 matrix 表头 <th>[object Object]</th> → 
检查 survey.json 中 matrix 题的 cols → 格式是 [{v,label}] 对象数组 → 
改为 ["标签1","标签2"] 字符串数组 → 重写 mock/survey.json → 重跑 T11 → 通过
```

### 第 8 步：输出确认

按以下模板回复。占位符填充规则：

| 占位符 | 填充规则 |
|:---|:---|
| `{问卷标题}` | survey.md 中的问卷标题 |
| `{IP}` | 部署脚本（第 3 步）返回的IPv4 地址；多网卡时逐行列所有候选 IP |
| `{端口}` | 部署脚本（第 3 步）返回的端口号 |
| `{adminPassword}` | 部署脚本（第 3 步）生成的 6 位管理员密码（`settings.json` 的 `adminPassword` 字段） |

```markdown
已部署。服务已启动，链接现在就能打开。

📋 问卷：{问卷标题}
🔗 填写链接：http://{IP}:{端口}/
📊 管理后台：http://localhost:{端口}/admin（密码：{adminPassword}）

① 怎么分享
把上面这条发到群里，同网络的用户用浏览器打开就能填，他们什么都不用装。
{多网卡时逐行列出所有候选 IP，注明"选和对方同一网段的那个"}

② 分享前，做一次这个（只一次）
右键 allow-firewall.bat →「以管理员身份运行」，看到 [OK] 就成了。
不做的话别人会打不开（这是最常见的原因）。

③ 关掉这个对话后，链接也一直有效
服务是在后台常驻的，关掉对话、关掉编辑器都不影响，会一直跑到你运行 close.bat（或跟我说"关闭服务"）、或电脑重启为止。
- 电脑重启后想再分享：到 survey/web/ 目录双击一次 start.bat 就行。
- 分享期间电脑别关机、别进睡眠。

④ 收工
双击 close.bat，或直接跟我说"关闭服务"。要撤防火墙放行就跑 remove-firewall.bat。

⑤ 收数据
答卷自动保存在 survey/web/mock/responses.jsonl。数据够了说"分析数据"，我帮你出报告。
```

## 关闭服务

PM 说"关闭服务"时：
1. 读取 `survey/web/mock/.server.pid`，获取 PID
2. 确认 PID 值为纯数字后再使用（防御性校验）
3. **验证 PID 属于 node 进程**（Windows: `tasklist /FI "PID eq {pid}" | findstr /i "node"`；Mac/Linux: `ps -o comm= -p {pid} | grep -qi node`；不匹配则拒绝终止并删除 `.server.pid` 文件，告知"PID {pid} 不匹配 node 进程（PID 可能已被复用），已跳过终止"）
4. Windows: `taskkill /F /PID {pid}`，Mac/Linux: `kill {pid}`
5. 删除 `.server.pid`
6. "服务已关闭。答卷数据仍在 survey/web/mock/responses.jsonl，随时可以分析。"

## 输出

| 产出 | 路径 | 用途 |
|------|------|------|
| 网页问卷 | `{版本号}/survey/web/index.html` | 用户填写的问卷页面 |
| 管理后台 | `{版本号}/survey/web/admin.html` | 查看答卷结果 |
| 数据服务 | `{版本号}/survey/web/server.js` | Node 数据收集服务 |
| 问卷配置 | `{版本号}/survey/web/mock/survey.json` | 结构化问卷数据 |
| 服务设置 | `{版本号}/survey/web/mock/settings.json` | 密码等设置 |
| 答卷数据 | `{版本号}/survey/web/mock/responses.jsonl` | 运行时自动产出 |
| 启停脚本 | `{版本号}/survey/web/start.bat` 等 | 服务管理 |
| 前端测试截图 | Playwright 输出目录（默认命名 `page-*.png`） | Playwright 自动化测试过程中生成的关键页面截图，用于失败时定位问题，不纳入项目目录 |
| 冒烟测试数据归档 | `{版本号}/survey/web/mock/archive/` | 自动化测试清理前的测试数据备份 |

## 禁止行为

1. **禁止修改模板引擎代码** — templates/ 下的 HTML/JS/CSS 是通用引擎，仅替换数据
2. **禁止修改 server.js** — 数据收集服务通用，不写死任何问卷特定逻辑
3. **禁止把部署产物散落到其他目录** — 部署产物统一在 survey/web/；测试截图是临时产物，不传 `filename`，由 Playwright 自动保存在其输出目录
4. **禁止修改问卷内容** — survey.md 由 design-survey 产出，deploy-survey 只读取和解析
5. **禁止静默换端口** — 端口冲突自动 +1 必须告知 PM（脚本返回 `port_bumped`）
6. **禁止伪造防火墙提权成功** — 生成 bat 交 PM 以管理员运行
7. **禁止面向机器的输出用中文** — bat/console.log 必须全英文 ASCII（GBK 乱码红线），中文说明由第 8 步输出确认模板向 PM 传达，不写入 bat 文件/控制台输出
8. **禁止跳过自动化冒烟测试** — 冒烟测试是部署必经步骤（第 7 步），失败按映射表自修复重试最多 3 轮，核心项 3 轮仍失败才停止部署。测试数据使用固定工号 `00000`，测试后自动清理，不干扰正式答卷数据。

## 成功示例

**PM 输入**：部署问卷

**助手动作**：
1. `node --version` 通过。
2. 扫描版本目录 → 定位 `电视比价/1.0.0/survey/电视比价_1.0.0_调研计划与问卷_E1.md`。
3. 解析 markdown → 生成 survey.json → `.gen_survey.js` 校验通过。
4. 创建 `survey/web/`，复制模板文件，写入配置。
5. 端口 5178 空闲，后台起服务，`curl localhost:5178` 返回 200。
6. 自动化测试：
   - 7a API 冒烟：T1-T7、T14-T16 全部通过，清理数据
   - 7b 前端渲染：Playwright 测试 T8-T13、T17 全部通过，截图自动保存至 Playwright 输出目录（不传 filename，不落入项目目录），清理数据
7. 输出确认（含访问链接和管理后台密码）。

**助手回复**：
> 已部署。服务已启动，链接现在就能打开。
>
> 📋 问卷：电视比价功能用户满意度调研
> 🔗 填写链接：http://{IP}:5178/
> 📊 管理后台：http://localhost:5178/admin（密码：284731）
>
> ① 怎么分享
> …（完整输出模板内容）

## 错误示例

**错误 1**：survey.md 不存在时直接报错退出
- 正确：引导 PM 先走 `design-survey` 设计问卷（说「设计问卷」触发）。

**错误 2**：修改了 index.html 的渲染引擎
- 问题：破坏了模板通用性。正确：只替换 `<title>`，引擎通过 fetch 动态读数据。

**错误 3**：部署到错误目录
- 问题：把网页部署到了 prototype/ 或其他位置。正确：统一部署到 `survey/web/`。

**错误 4**：Node 缺失却继续部署
- 问题：第 0 步检测失败应停止并给安装指引。

**错误 5**：survey.json 使用了平层字段而非嵌套结构
- 问题：模板引擎读取 `SURVEY.intro.title`、`SURVEY.intro.leadHtml`、`SURVEY.thanks.title`、`SURVEY.terminate.title` 等嵌套路径。写成 `greeting`、平层 `thanks` 字符串等会导致封面白屏或提交页白屏。正确：保持 `intro` / `thanks` / `terminate` 三个嵌套对象。

**错误 6**：settings.json 的密码字段名写成了 `password` 而非 `adminPassword`
- 问题：server.js 验证时读取 `readSettings().adminPassword`，写错字段 PM 拿到密码却登不进后台。更隐蔽的是 server.js 的 initSettings() 会在字段缺失时自动补一个随机密码——不报错但用户永远登不进。正确：字段名必须是 `adminPassword`。

**错误 7**：身份题的 id 写成了 `Q1`/`Q2` 而非 `nickname`/`empId`
- 问题：index.html 的 `buildPayload()` 读取 `a.nickname` 和 `a.empId` 作为顶层字段提交，写 `id: "Q1"` 导致这两字段为空，server.js 校验工号格式时返回 400。正确：内部问卷的身份题必须使用固定 id `nickname` 和 `empId`，`.gen_survey.js` 现在会强制校验此项。

**错误 8**：截图文件散落到项目根目录
- 问题：调用 `browser_take_screenshot` 时传了文件名（如 `t8-cover.png` 或 `survey/web/t8-cover.png`），前者散落根目录，后者把测试产物混入部署目录。正确：不传 `filename`，让 Playwright 使用默认命名，自动保存到其输出目录。

**错误 9**：测试失败后不自动修复，直接让 PM 手动排查
- 问题：T11 matrix 表头显示 `[object Object]`，是 survey.json 中 `cols` 格式问题。旧版行为是"停止部署，请检查配置"——增加了 PM 认知负担。正确：7c 自动修复循环应自动检查 matrix 的 `cols` 类型并修正后重跑。

**错误 10**：核心项测试失败后自动修复超过 3 轮仍不停止
- 问题：循环了 4+ 轮仍然修不好还继续重试，浪费时间和 token。正确：3 轮后核心项仍失败 → 停止部署并输出已尝试的修复记录，非核心项仍失败 → 输出 warning 继续。

## 边缘情况处理

| 场景 | 触发条件 | 处理方式 | 示例回复 |
| :--- | :--- | :--- | :--- |
| Node.js 未安装 | 第 0 步 `node --version` 命令不存在 | 停止部署，给出安装指引 | "本机没检测到 Node.js，部署需要它。到 https://nodejs.org 下载 LTS 版安装后，再回来说'部署问卷'。" |
| 问卷文档不存在 | 第 1 步未找到 `*调研计划与问卷*.md` | 提示先用 design-survey 设计问卷 | "还没有问卷设计文档，请先对我说「设计问卷」来设计问卷。" |
| 端口全部被占用 | 部署脚本端口检测时基准端口 +10 均被占用 | 提示 PM 手动处理 | "端口 {基准端口}-{基准端口+10} 均被占用，无法自动分配。请关闭部分服务后重试，或手动指定端口。" |
| 模板文件缺失 | 第 3 步模板复制时 templates/ 下文件不存在 | 停止部署，提示重新安装技能 | "模板文件缺失，请确认技能完整安装。若问题持续，重新安装 deploy-survey 技能。" |
| 共享库或 close.bat 模板缺失 | 第 3 步脚本抛"pmcraft 共享库缺失"或报"close.bat 模板缺失" | 停止部署，提示重跑 setup.cmd（pmcraft-proto 需完整安装） | "部署脚本依赖的共享组件缺失，请重新运行 setup.cmd 分发 `_shared/` 与 pmcraft-proto 后重试。" |
| 防火墙未放行 | 部署成功但外部无法访问 | 引导右键以管理员运行 allow-firewall.bat | "部署已完成。如外部无法访问，请右键 allow-firewall.bat →「以管理员身份运行」，看到 [OK] 即可。" |
| 封面白屏 | survey.json 的 `intro` 字段为平层字符串而非嵌套对象 | 检查 intro/thanks/terminate 是否均为对象含 title+leadHtml/body | "封面白屏通常因 survey.json 的 intro 结构不符合模板预期。模板读 SURVEY.intro.title 和 SURVEY.intro.leadHtml，请确保 intro 是对象而非平层字段。" |
| 管理后台密码错误 | settings.json 的 `adminPassword` 字段缺失或写成了 `password` | 检查字段名，确保为 `adminPassword`；注意 server.js 启动时若字段缺失会自动补一个随机密码 | "管理员密码验证失败，请检查 settings.json 中字段名是否为 adminPassword（非 password）。" |
| 提交时返回 400 invalid empId | 身份题 id 写成了 `Q1`/`Q2` 而非 `empId` | `.gen_survey.js` 第 4 步会校验 `empId` 必须存在，校验失败阻止部署；线上已部署时 fallback 按标题模糊匹配 | "提交失败：invalid empId。身份题的 id 必须为 empId（工号）和 nickname（昵称），而非 Q1/Q2。" |
| 冒烟测试 T3 失败（提交返回非 true） | 服务端路由异常、buildPayload 字段不匹配、后端工号格式拒绝 | **自动修复**：按 7c 修复映射表修正 survey.json 中 nickname/empId 字段 → 重跑 T3。3 轮仍失败则停止 | "自动化测试 T3 未通过，已进入自动修复。请等待修复结果。" |
| 冒烟测试 T4 失败（重复提交未拦截） | settings.json 的 `allowMulti` 被误设为 `true` | **自动修复**：按 7c 修复映射表修正 settings.json 中 allowMulti: false → 重跑 T4 | "自动化测试 T4 未通过，已自动修正 allowMulti 设置。" |
| 冒烟测试 T6 失败（管理员登录异常） | settings.json 的 `adminPassword` 字段名写错 | **自动修复**：按 7c 修复映射表检查字段名是否为 `adminPassword`（非 password）→ 重跑 T6 | "自动化测试 T6 未通过，已自动检查 settings.json 密码字段。" |
| 前端测试 T8 封面白屏或无按钮 | index.html 渲染引擎 fetch 不到 survey.json、或标题字段缺失 | **自动修复**：按 7c 修复映射表检查 intro/thanks/terminate 结构 → 重跑 T8 | "前端测试 T8 未通过，已进入自动修复。请等待修复结果。" |
| 前端测试 T11 题型跳转异常 — matrix 表头 `[object Object]` | matrix 题 `cols` 传了对象数组而非字符串数组 | **自动修复**：按 7c 修复映射表检查 matrix 题 cols 类型 → 改为字符串数组 → 重跑 T11 | "前端测试 T11 matrix 渲染异常，已自动修正 cols 格式。" |
| 前端测试 T11 题型跳转异常 — 其他 JS 错误 | 某题型配置字段缺失（options/rows/labels） | **自动修复**：按 7c 修复映射表检查该板块问题配置 → 修正 survey.json → 重跑 T11 | "前端测试 T11 未通过，已进入自动修复。请等待修复结果。" |
| 前端测试 T12 提交后无感谢页 | buildPayload 字段 `empId`/`nickname` 缺失导致服务端 400 | **自动修复**：按 7c 修复映射表检查 nickname/empId id → 重跑 T12 | "前端测试 T12 未通过，已自动修正身份题 id。" |
| 前端测试 T13 管理后台无数据 | `adminQdef` 的 id 与 board question id 不一一对应 | **自动修复**：按 7c 修复映射表检查 adminQdef id 映射 → 重跑 T13 | "前端测试 T13 未通过，已自动检查 adminQdef 字段映射。" |
| 前端测试截图散落到项目根目录 | T8-T13 调用 `browser_take_screenshot` 时传了自定义 `filename`，截图落入当前工作目录 | 不传 `filename` 参数，让 Playwright 使用默认命名自动保存到其输出目录 | "截图散落到项目根目录了。browser_take_screenshot 不要传 filename，用默认命名就不会污染项目。" |

## 评价测试用例

### 正向触发（5条）
1. "部署问卷" — 预期：启动部署流程，依次执行第 0-8 步（含自动化冒烟测试）
2. "发布问卷" — 预期：启动部署流程
3. "生成问卷链接" — 预期：启动部署流程
4. design-survey 完成后 AI 询问"要部署吗？"用户回答"是" — 预期：启动部署流程
5. "关闭服务" — 预期：读取 PID，终止 Node 进程，提示数据仍在

### 负向触发（5条）
1. "分析数据"（非部署请求） — 预期：不触发，引导到 synthesize-research
2. "设计问卷"（设计而非部署） — 预期：不触发，引导到 design-survey
3. Node.js 未安装时触发部署 — 预期：第 0 步阻止，提示安装 Node
4. survey.md 不存在时触发部署 — 预期：第 1 步阻止，提示先用 design-survey
5. "帮我改问卷内容"（修改问卷而非部署） — 预期：不触发，提示 deploy-survey 只读不写

### 边界查询（8条）
1. 端口检测时发现目标端口被占用 — 预期：自动 +1 重试，告知用户实际使用端口
2. 模板文件缺失（如 index.html 不存在） — 预期：停止并提示重新安装
3. 多网卡下服务器有多个 IP — 预期：列出所有候选 IP，注明"选和对方同一网段的那个"
4. API 冒烟 T3 完整提交失败 — 预期：进入 7c 自动修复循环（修正 nickname/empId 字段后重试），3 轮仍失败则停止
5. API 冒烟 T6 管理员登录失败 — 预期：进入 7c 自动修复循环（修正 adminPassword 字段名后重试），3 轮仍失败则停止
6. 前端测试 T8 封面渲染 JS 报错 — 预期：进入 7c 自动修复循环（检查 intro/thanks/terminate 结构后重试），3 轮仍失败则停止
7. 前端测试 T11 题型交互到某板块卡住 — 预期：进入 7c 自动修复循环（检查该板块题型配置后重试），3 轮仍失败则停止
8. 前端测试 T13 管理后台无数据 — 预期：进入 7c 自动修复循环（检查 adminQdef id 映射后重试），3 轮仍失败则停止

---

## 快速参考

| 操作 | 说明 |
|:---|:---|
| 设计后部署 | 「设计问卷」→ 完成 → "要部署吗？" → 是 |
| 手动部署 | `部署问卷` |
| 查看后台 | 打开 `http://localhost:{端口}/admin` |
| 关闭服务 | `关闭服务` 或双击 close.bat |
| 分析数据 | `分析数据`（触发 synthesize-research） |
