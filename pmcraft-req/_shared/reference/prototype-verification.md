# 原型读取与运行时验证契约（req 域公共规范）

> 本文件是 req 域三个技能（`generate-prd` / `check-consistency` / `review-prd`）读取原型时的**唯一权威副本**。
> 各技能以 `../../_shared/reference/prototype-verification.md` 引用。
> **如果读取失败** → 依据本技能正文要点执行：逐页渲染校验（payload 不可用时改用 `browser_snapshot` 观察）+ 每页 ≤3 点抽验；截图按 0 张处理，并在 PRD 第 9 章 / 报告的「验证方式」字段标注"运行时验证降级执行"。

---

## 0. 职责边界（先读这一节）

三个信息源（源码、渲染后 DOM、`browser_snapshot`）**各司其职，谁都不替代谁**；截图是交付物（只输出不输入），不算信息源。把任何一源当成另一源的替代品，都会产出错误的 PRD 或错误的差异清单。

| 信息源 | 职责 | 盲区 |
|:---|:---|:---|
| **源码（分层取材）** | **分支/状态的穷举**——加载/空/错误各态、条件渲染、事件绑定、路由。给出的是**可能性空间** | 无法判断运行时是否真渲染、布局是否塌 |
| **渲染后 DOM**（`browser_evaluate`，每页恰 1 次） | **元素清单主基线**——真实、成本低（千级 token/页）、含 CSS 隐藏元素（比无障碍树宽）、天然排除工具层 | 只有**已挂载**的 DOM，不含靠交互才挂载的分支 |
| **`browser_snapshot`** | **仅渲染校验**（页面是否渲染、是否白屏），**不作枚举来源** | — |
| **截图** | **交付物**（PRD 第 9 章）与差异证据，**只输出不输入** | — |

> **snapshot 降格**同 `pmcraft-test/skills/setup-tests/SKILL.md` 的既有口径：「用于标题/渲染校验与截图依据，**不再作为交互元素枚举来源**」。测试域早已如此，需求域对齐。

### 0.1 源码分层取材（禁止整文件读）

实测数据（9 页真实原型，5315 行）：`<script>` 占 **49%**、`<style>` 占 **28%**、markup 仅占 **23%**。**整读源码的绝大部分预算花在与 PRD 无关的样式和脚本上。**

取材口径：

| 取什么 | 从哪取 |
|:---|:---|
| 页面清单 | `Glob prototype/{main\|E{max}\|working}/pages/*.html` + `page-inventory.md` 的路由字段 |
| 交互元素 | 逐页读 HTML 的 **markup 部分** + JS 中的 `querySelector` / `innerHTML` / 模板字符串（动态挂载的元素声明） |
| 状态 | **优先** `spec.md` 的「页面状态矩阵」/ `page-inventory.md` 的「状态」字段（声明集合）；**其次**扫条件渲染分支与状态变量 |
| 跳转链 | `a[href]` + `location.href` / `window.open` 赋值 + 路由表 |

**禁止整文件读**——按上表定点读取片段。

### 0.2 工具层排除（必做，源码级 + 运行时级**两层都要排**）

pmcraft 自己的标注层与演示面板会混在页面引用里：

```
../annotations-runtime.js    ../annotations/{page}.js
../demo-panel-runtime.js     ../demo/{page}.js
../ui-a11y.js
```

它们是**工具层，不是原型业务功能**，体量约 3000 行（接近页面本体的一半）——**盲读源码会把标注层当成页面功能写进 PRD**。

**源码级排除**：读源码时一律跳过 `annotations*/`、`demo*/`、`annotations-runtime.js`、`demo-panel-runtime.js`、`ui-a11y.js`、`design-system.css`、`_common.css`。判定依据 = 文件名前缀。

**运行时级排除（源码级挡不住）**：标注层与演示面板是**动态注入 DOM** 的——页面源码里根本没有那些节点，所以源码级排除拦不到它们。实测（首装向导页）注入的节点用统一类名前缀族：

- 标注层：`pm-anno-toggle`（开关）、`pm-anno-overlay`、`pm-anno-note`、`pm-anno-bubble`、`pm-anno-dot`、`pm-anno-li`、`pm-anno-sec`、`pm-anno-steps`、`pm-anno-exits`、`pm-anno-prd`、`pm-anno-b-*`
- 演示面板：`pm-demo-toggle`、`pm-demo-panel`、`pm-demo-item*`、`pm-demo-bubble`、`pm-demo-b-*`、`pm-demo-empty`、`pm-demo-restore`、`pm-demo-standalone`

**不排会同时污染两条路**，且污染是静默的：

| 污染点 | 后果 |
|:---|:---|
| 元素清单 | 开关按钮（「规则和状态标注」「流程标注」「演示」）被当成原型功能写进 PRD |
| **状态线索桶** | `pm-demo-empty` 命中 `empty` 桶、`pm-anno-overlay` 命中 `modal` 桶 → 伪造出不存在的空态与弹窗 |

payload 已内置 `isToolLayer()` 按 `/pm-(anno\|demo)/` 前缀 + `closest()` 祖先判定剔除，并在 `summary.toolLayerSkipped` 报告剔除数——**该计数非 0 即说明排除生效**；若某原型用别的前缀族注入工具层，需同步扩展该判定。

> 注：开关按钮本身是**可见的**（它们是控制件，不是被隐藏的标注内容）——所以「渲染时天然看不见」不成立，必须靠显式排除。

### 0.3 两源合并规则

取**并集**，冲突以运行时为准并标注：

| 情形 | 处理 |
|:---|:---|
| 源码有、渲染后无 | 标注 `[原型中未见渲染，可能为条件触发]`；若 `hidden: true` 则为"声明了但运行时不可见" |
| 渲染后有、源码无 | 标注「源码解析可能遗漏（JS 动态生成）」 |
| 两源一致 | 直接采信 |

---

## 1. 需求域运行时抽验 payload（MUST — 每页恰 1 次）

用 `browser_evaluate`，**逐字执行**本 payload——禁止改写、禁止拆成逐元素/逐字段调用、**禁止替换为 `browser_snapshot`**（snapshot 看不到隐藏元素，信息面更窄）。

与 `pmcraft-test/skills/setup-tests/references/page-recon-snippets.md` 第 0 节是**同源裁剪关系**：

- **测试域管选择器与命中计数**（`selector` / `matchCount` / `needs_disambiguation`），需求域不取——本技能不写测试脚本、不做消歧。
- **需求域管语义与状态**，测试域不取。
- 两者形似而字段不同，**禁止"顺手统一"**——统一会破坏需求域语义。

**与源 payload 的两处实质差异（不得丢）**：

1. **不剔除无锚点元素**。源 payload 用 `.filter(Boolean)` 丢弃无锚点元素，理由是"选择器为空则无用"——**该理由在需求域不成立**：裸 `<input type="checkbox">` 也是"声明了但可能没渲染"的证据，剔除会在与源码清单比对时**制造假的"缺失"判定**。需求域改为单独计数 + 限量保留（`unanchored`）。
2. **`truncated` 与 `unanchored` 在比对前必须先排除**，否则会把"被截断/无锚点"误判为"未渲染"（见 §3）。

```js
() => {
  // 需求域原型运行时抽验 payload —— 逐字执行；每页恰 1 次
  // 用途：① 渲染校验 ② 运行时真值抽验 ③ 状态线索
  // 不用于：交互元素枚举的穷举、选择器构建与命中计数（测试域职责）
  const SEL = 'button, input, select, textarea, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"]';
  // ⚠️ 唯一允许的参数化：返回 elements > 120 时，把 SEL 收窄为 'button, [role="button"], [role="tab"]' 重跑 1 次（每页 ≤ 2 次）
  const MAX_ELEMENTS = 120, MAX_UNANCHORED = 20, MAX_HOOKS = 5, SCAN_CAP = 4000;

  const cut = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const attr = (el, n) => el.getAttribute(n) || '';
  const cls = (el) => el.getAttribute('class') || '';
  const isHidden = (el) => el.getClientRects().length === 0 || getComputedStyle(el).visibility !== 'visible';
  const boolProp = (el, p, aria) => el[p] === true || el.getAttribute(aria) === 'true';
  // 工具层排除（运行时）：标注层/演示面板由 annotations-runtime.js、demo-panel-runtime.js 动态注入 DOM，
  // 源码里不存在这些节点，源码级前缀排除挡不住——必须在运行时按前缀剔除，否则会同时污染元素清单与状态线索
  const isToolLayer = (el) => {
    const probe = (el.id || '') + ' ' + (el.getAttribute('class') || '');
    return /(^|[\s-])pm-(anno|demo)/.test(probe)
      || !!el.closest('[id^="pm-anno"],[id^="pm-demo"],[class*="pm-anno-"],[class*="pm-demo-"]');
  };

  const elements = [], unanchored = [], seen = new Set();
  let matched = 0, toolLayerSkipped = 0;

  for (const el of document.querySelectorAll(SEL)) {
    if (isToolLayer(el)) { toolLayerSkipped++; continue; }
    matched++;
    const tag = el.tagName.toLowerCase();
    const info = {
      tag, type: attr(el, 'type'),
      href: tag === 'a' ? attr(el, 'href') : '',
      text: cut(el.textContent),
      testid: attr(el, 'data-testid'), id: el.id || '', name: attr(el, 'name'),
      role: attr(el, 'role'), placeholder: attr(el, 'placeholder'), label: attr(el, 'aria-label'),
      required: boolProp(el, 'required', 'aria-required'),
      disabled: boolProp(el, 'disabled', 'aria-disabled'),
      hidden: isHidden(el)
    };
    // 无锚点元素不丢弃（区别于测试域）—— 丢弃会制造假"缺失"
    if (!(info.testid || info.id || info.name || info.text || info.role || info.placeholder || info.label || info.href)) {
      if (unanchored.length < MAX_UNANCHORED) unanchored.push({ tag: tag, type: info.type, hidden: info.hidden });
      continue;
    }
    const key = tag + '|' + info.testid + '|' + info.id + '|' + info.name + '|' + info.text + '|' + info.href;
    if (seen.has(key)) continue;
    seen.add(key);
    elements.push(info);
  }

  // 状态线索：渲染后扫描类名/id/testid 命中语义关键词（每桶 ≤5 条，防膨胀）
  const HOOKS = {
    loading: /load|spin|skeleton|progress|加载/,
    empty: /empty|no-?data|blank|暂无|无数据|空状态/,
    error: /error|fail|invalid|exception|错误|失败/,
    success: /success|done|complete|成功|完成/,
    modal: /modal|dialog|popup|overlay|mask|drawer|弹窗|抽屉/,
    toast: /toast|notif|alert|tip|提示/
  };
  const stateHooks = {};
  let n = 0;
  for (const el of document.querySelectorAll('[class],[id],[data-testid]')) {
    if (++n > SCAN_CAP) break;
    if (isToolLayer(el)) continue;
    const probe = (cls(el) + ' ' + el.id + ' ' + attr(el, 'data-testid')).toLowerCase();
    for (const k in HOOKS) {
      if (!HOOKS[k].test(probe)) continue;
      if (!stateHooks[k]) stateHooks[k] = [];
      if (stateHooks[k].length >= MAX_HOOKS) continue;
      stateHooks[k].push({ tag: el.tagName.toLowerCase(), cls: cut(cls(el)), id: el.id || '', text: cut(el.textContent), hidden: isHidden(el) });
    }
  }

  return {
    url: location.pathname,
    title: document.title,
    textLength: (document.body.innerText || '').trim().length,
    summary: {
      matched: matched,
      interactive: elements.length,
      hidden: elements.filter((e) => e.hidden).length,
      disabled: elements.filter((e) => e.disabled).length,
      required: elements.filter((e) => e.required).length,
      unanchored: unanchored.length,
      toolLayerSkipped: toolLayerSkipped
    },
    truncated: elements.length > MAX_ELEMENTS,
    stateHooks: stateHooks,
    unanchored: unanchored,
    elements: elements.slice(0, MAX_ELEMENTS)
  };
}
```

### 调用纪律

- **服务根 = 含 `pages/` 的那一层**（如 `prototype/main/`），**不是 `pages/` 本身**。原型页面引用的是 `../design-system.css`、`../annotations-runtime.js` 这类**父目录**资源，服务根起错会让每个资源都 404——实测起在 `pages/` 上时首装向导页报 9 条 404 error，起对之后 0 error。起错服务根的后果不只是样式丢失：**`isHidden()` 靠 `getComputedStyle` 判定，无 CSS 时该隐藏的元素会被算成可见，`hidden` 与状态线索全错**。
- 用 `browser_evaluate`，**不传 `filename` 参数**（与 `browser_take_screenshot` 同一陷阱：会写入 MCP server 的 CWD 即项目根目录）。
- **逐字执行**，禁止改写、禁止拆成逐元素调用。唯一允许的参数化是 `SEL` 收窄（每页 ≤ 2 次）。
- 关键词表与 `check-consistency/references/semantic-mapping.md` **同源但用途不同**（一个做匹配判定、一个做钩子扫描）。扩展关键词时先改 mapping，再同步本 payload。

---

## 2. 返回字段语义表

| 字段 | PRD / 报告的用途 |
|:---|:---|
| `tag` `testid` `id` `name` `text` `role` `placeholder` | 元素语义最小集；`id`/`text` 与原型域标注锚点同口径，PRD 溯源可对接 |
| `type` | 控件语义：checkbox/radio/submit/file——决定用例写"勾选/单选/上传"而非"填写" |
| `href` | **9.2 主要交互流程的跳转链**真值。源码里的 `onclick="goX()"` 只给函数名 |
| `required` | 必填声明 → 验收标准「边界条件」 |
| `disabled` | 禁用态 → 权限控制 / 前置条件规则的可视证据 |
| `hidden` | **渲染校验核心判据**：声明但未渲染 = 条件触发元素（PRD 写成"当 X 时显示"） |
| `label` | 图标按钮（text 为 `×` 或空）唯一的可读名 |
| `stateHooks` | 状态线索六桶（loading/empty/error/success/modal/toast），补源码分析在"JS 动态生成元素"上的盲区 |
| `unanchored` | 无锚点元素 `{tag,type,hidden}`，防假"缺失"判定 |
| `summary` | 渲染校验快速判据 |
| `textLength` | 白屏判据：`< 20` 视为可疑 |

**不取**：`selector` / `matchCount` / `needs_disambiguation`（测试域职责）、`options` / `value` / `checked` / 全量 `className` / `innerHTML`（数据细节，PRD 正文不用；需要时由源码级分析按需读取）。

### 抽验点选取

**每页 ≤3 点**，只验两类：

1. 与源码声明**冲突**的元素（源码有渲染无 / 渲染有源码无）
2. 主成功流程**第一步依赖**的元素

用 `browser_click` 触发后复看 payload 或 snapshot 复核。**冲突以渲染为准并标注**。

---

## 3. 渲染校验判定（payload 之外的必做动作）

| 判据 | 工具 | 判定 |
|:---|:---|:---|
| JS 报错 | `browser_console_messages` | **先分流再判定**（见下），只有真 JS 异常才记入"渲染异常" |
| 白屏 | payload `textLength` | `< 20` → 白屏，该页所有元素判为"未渲染"，**不得据此判 PRD 缺失** |
| 元素真渲染 | payload `elements[].hidden` + `summary` | 源码声明但 payload 中 `hidden:true` 或不存在 → "运行时未渲染，需人工确认" |
| 运行时多于源码 | payload vs 源码清单 | 以运行时为准，标注"源码解析可能遗漏（JS 动态生成）" |

**控制台消息分流（否则会每页误报）**：`console` 里的 error 不能一律算"渲染异常"——

| 消息形态 | 判定 | 处置 |
|:---|:---|:---|
| 资源 404（`Failed to load resource … 404`）批量出现在 `<link>`/`<script src>` 上 | **多为服务根起错**，是执行错误不是原型缺陷 | 先按 §1 调用纪律检查服务根；确认服务根正确后仍有 404，才作为原型缺陷记录 |
| `favicon.ico` 404 | 噪音 | 忽略 |
| 真 JS 异常（`TypeError` / `ReferenceError` / 未捕获异常，带堆栈） | **渲染异常** | 记入，注明页面与报错摘要 |

> **比对前置排除（硬约束）**：`truncated: true` 与 `unanchored` 两类**必须先排除**再做"缺失"判定——它们代表"未纳入清单"，不代表"未渲染"。把截断当成缺失会产出错误的差异清单。

---

## 4. 截图限量规则

**成本与膨胀分两个杠杆管**：成本靠"截图只作交付物、不进多模态分析输入"；膨胀靠张数上界。两者不可互相替代。

| 技能 | 预算 | 触发 |
|:---|:---|:---|
| `generate-prd` | **≤10 张**（默认必做） | PRD 第 9 章自包含，按交互流程配图 |
| `check-consistency` / `review-prd` | **≤3 张，默认 0** | 仅「矛盾发现」差异需视觉留证 |

> 同 `pmcraft/.claude/agents/design-reviewer.md` 的既有规则：「截图默认不做、上限 2 张/轮」。

### 选页规则（确定性，不靠自由裁量）

1. 取 PRD 9.2 **主链路**涉及页面，按跳转顺序去重。
2. **入口页与终止页必取**——不可被预算挤掉。
3. **每页恰 1 张，只截默认初始态**；不逐状态截图（状态可能性空间由 `spec.md` 状态矩阵 + 用例扩展流程承载，用文字描述）。
4. 超出部分在 9.2 标注 **「未截图（以文字描述为准）」**。
5. **分支页（降级/返回）默认不截**——由 9.2 文字链承载。
6. PM 明确要求增补时可在预算外扩，但必须在 PRD 第 9 章注明「本次截取范围：主流程关键页 N 张」，避免读者误以为已全量。

### 命名 / 落盘 / 引用 / 清理

- **命名**：`{基线标识}_{页面ID}_{场景}.png`。基线标识 = `E{N}` / `main` / `working`；场景默认 `main`（主流程默认态），补截用状态名（如 `empty`）；页面ID 取页面文件名去扩展名。
- **落盘**：`{version_dir}/screenshots/`，目录不存在先用 `Bash` `mkdir -p`。
- **绝对路径（关键）**：`browser_take_screenshot` 的 `filename` 传相对名会落到 **MCP server 的 cwd（即 Claude Code 启动目录，通常是项目根）**，Bash 的 `cd` 不影响它——**必须传绝对路径**（如 `C:/项目/1.0.0/screenshots/E3_login_main.png`）。
- **落点必须在 MCP 允许根内（实测）**：MCP server 只允许写 `{启动目录}` 与 `{启动目录}/.playwright-mcp/` 两个根，写别处报 `File access denied: … is outside allowed roots`。**症状与处置**：
  - 版本目录不在启动根内（如在别的盘/上级目录）→ 改为先截到启动根内，再用 `Bash` `mv` 到 `{version_dir}/screenshots/`。
  - 报 `outside allowed roots` 但路径看着就在允许根里 → **盘符大小写不匹配**（允许根打印为 `c:\…` 而路径写了 `C:\…` 会被判为不同路径）。按报错里打印的允许根原样改大小写即可。
- **截图不消耗多模态 token（实测）**：`browser_take_screenshot` 传 `filename` 时只返回一行路径链接（`- [Screenshot of viewport](…)`），**图像本身不进上下文**。多模态成本只在**主动把 png 读回来**时产生——这正是「截图只输出不输入」能成立的原因，也是禁止把它当分析输入的落点。
- **PRD 内引用**：相对 PRD 文件的相对路径（如 `../screenshots/E3_login_main.png`），保证可点击；**不引用项目根散落文件**。
- **收尾清理**：`browser_close` 后自查项目根 `*.png`，移入 `screenshots/` 或删除。

---

## 5. 降级机制

Playwright MCP 不可用（`ToolSearch` 查不到 `mcp__playwright__` 工具）时走降级路径，**不可静默**，三要素缺一不可：

1. **落盘标注**：PRD 第 9 章 / 报告「验证方式」字段注明"基于静态源码分析，未获取运行时渲染验证"及降级原因（如"MCP 未配置/连接失败"）。
2. **可信度降级**：交互性差异 / 交互性结论标注"中可信度，建议运行时补验"。
3. **PM 提示**：报告末尾提示"Playwright 不可用，本次为纯静态分析。建议配置 Playwright MCP 后补做运行时验证，或人工在浏览器中核对关键交互。"

---

## 6. 禁止清单

1. **禁止用截图或多模态读图做交互元素枚举 / 页面结构分析**——截图只作 PRD 第 9 章视觉锚点与差异留证，**不进分析输入**。
2. **禁止用浏览器做交互元素枚举或页面遍历发现**——枚举基线唯一来源是源码分层取材（§0.1）。
3. **禁止把 `browser_snapshot` 当作元素枚举来源**——它只做渲染校验。
4. **禁止逐页逐状态全量截图**——超预算即违规（§4）。
5. **禁止整文件读原型源码**——按 §0.1 定点取材，并排除工具层（§0.2）。
6. **禁止把 `truncated` / `unanchored` 当作"未渲染"**——比对前必须先排除（§3）。
7. **禁止截图传相对文件名**——必须绝对路径（§4），且必须落在 MCP 允许根内（`{启动目录}` 或 `{启动目录}/.playwright-mcp/`）。
8. **禁止 MCP 可用时跳过渲染校验**——降级仅限 MCP 不可用，且必须留痕（§5）。
