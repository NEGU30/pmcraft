# 页面侦察与数据预采集 MCP 代码片段（Phase 3.3 / Phase 3.6 专用）

> 本文件仅在 setup-tests Phase 3.3 页面侦察与 Phase 3.6 步骤 1 数据预采集时加载。
> 包含：页面侦察一体化 payload（枚举 + 全量 matchCount 单次完成）、matchCount 原理说明、Auth 类型探测（cookie / storageState 提取，会话级 1 次）、数据预采集一体化 payload（按页批量实测数据值）。

## 0. 页面侦察一体化 payload（MUST — 每页恰 1 次）

单页一次 `browser_run_code_unsafe` 同时完成：**交互元素枚举**（`button` / `input` / `select` / `a[href]`，每元素取 `data-testid` / `id` / `name` / `text` / `role` / `placeholder`）+ **候选选择器全量 matchCount 实测**（沿用第 1 节 build() 映射，一次循环计数全部候选）。执行时必须**逐字**使用本 payload——禁止改写、禁止拆分为逐选择器/逐元素调用。

```js
browser_run_code_unsafe: async (p) => {
  const TYPE = 'ALL'; // 批类型：ALL（默认）| BUTTON | INPUT | SELECT | LINK
  // ⚠️ 仅当返回 total > 100 时，允许把 TYPE 改为 'BUTTON' 与 'INPUT,SELECT,LINK' 分两批重跑（每页仍 ≤ 2 次）；其余情况禁止改动本 payload
  const SEL = TYPE === 'ALL' ? 'button, input, select, a[href]' : TYPE;
  const build = (p, { type, args }) => {
    switch (type) {
      case 'getByText': return p.getByText(...args);
      case 'getByRole': return p.getByRole(...args);
      case 'getByPlaceholder': return p.getByPlaceholder(...args);
      case 'getByLabel': return p.getByLabel(...args);
      case 'css': return p.locator(args[0]);
      default: return p.getByText(args[0]);
    }
  };
  // 1) 枚举：一次 evaluateAll 提取全部锚点字段（text 截断 30 字符；无任何锚点的纯装饰元素剔除，防返回膨胀）
  const els = await p.locator(SEL).evaluateAll((nodes) => nodes.map((el) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 30);
    const info = {
      tag,
      testid: el.getAttribute('data-testid') || '',
      id: el.id || '',
      name: el.getAttribute('name') || '',
      text,
      role: el.getAttribute('role') || '',
      placeholder: el.getAttribute('placeholder') || ''
    };
    return (info.testid || info.id || info.name || text || info.role || info.placeholder) ? info : null;
  }).filter(Boolean));
  // 2) 候选选择器构建（优先级：testid > text/label > role > placeholder > id/name CSS）+ 全量 matchCount
  const out = [];
  const seen = new Set();
  for (const e of els) {
    const cands = [];
    if (e.testid) cands.push({ type: 'css', args: [`[data-testid='${e.testid}']`] });
    if (e.text && e.text.length >= 2) cands.push(e.tag === 'button' || e.tag === 'a'
      ? { type: 'getByText', args: [e.text] }
      : { type: 'getByLabel', args: [e.text] });
    if (e.role) cands.push({ type: 'getByRole', args: [e.role] });
    if (e.placeholder) cands.push({ type: 'getByPlaceholder', args: [e.placeholder] });
    if (e.id) cands.push({ type: 'css', args: [`#${e.id}`] });
    if (e.name && e.tag !== 'a') cands.push({ type: 'css', args: [`${e.tag}[name='${e.name}']`] });
    let best = null;
    for (const c of cands) {
      let n;
      try { n = await build(p, c).count(); } catch { c.count = 'ERR'; continue; }
      c.count = n;
      if (!best) { best = c; continue; }
      const bs = best.count;
      if (n === 1 && bs !== 1) { best = c; continue; }
      if (bs === 0 && n > 0) { best = c; continue; }
      if (n > 1 && bs > 1 && n < bs) { best = c; continue; }
    }
    if (!best && cands.length) { best = cands[0]; best.count = 'ERR'; }
    if (!best) continue;
    const key = `${best.type}(${JSON.stringify(best.args)})`;
    if (seen.has(key)) continue; // 同候选选择器去重（如表格多行同文本按钮），matchCount 已含全部命中
    seen.add(key);
    out.push({
      tag: e.tag,
      testid: e.testid,
      id: e.id,
      name: e.name,
      text: e.text,
      role: e.role,
      placeholder: e.placeholder,
      selector: key,
      matchCount: best.count,
      needs_disambiguation: best.count > 1
    });
  }
  return JSON.stringify({ url: p.url(), total: out.length, elements: out });
}
```

**结果判定**（与第 1 节一致）：
- `matchCount > 1` → 该元素 **MUST** 填 `disambiguation` 字段（如 `.first()` / `.nth(1)` / `.filter({ hasText: ... })`），实际使用的 selector 必须已消除歧义，否则页面地图该项不通过（Phase 3.7 会检查）。
- `matchCount === 0` → 该元素从地图移除或修正 selector，禁止保留无效选择器。
- `needs_disambiguation: true` 项即 `matchCount > 1` 项；复杂消歧（Element Plus 嵌套表格、多 match 标题等 trap 场景）不在此 payload 内处理，仍由模型据返回 JSON 在生成 selector-lib.ts 时走既有 disambiguation 机制。

> ⚠️ **payload 尾注（MUST）**：本 payload 必须逐字执行——禁止改写、禁止拆分为逐选择器/逐元素分次调用。唯一允许的参数化：单页返回 `total > 100` 时改 `TYPE` 分两批重跑（每页 ≤ 2 次，优于历史逐选择器 ~30 次/页）。

## 1. matchCount 实测（原理说明 — 已并入第 0 节）

> 📌 本节的 build() 映射与判定规则已并入第 0 节一体化 payload（第 3 节 build() 与第 0 节同文同源），
> 实际执行不再逐选择器调用；本节仅保留不重复的原理说明，判定规则见第 0 节"结果判定"。

原理（其余均已并入第 0/3 节，代码见第 0 节 payload）：`page.locator(selector)` 仅接受 CSS/XPath——若选择器是
Playwright API 格式（如 `getByText("...")`、`getByRole("...")`），必须映射到对应的 `p.getByText()` /
`p.getByRole()` 等方法，不可直接传入 `p.locator()`；候选选择器优先级为 testid > text/label > role > placeholder > id/name CSS。

## 2. Auth 类型探测（会话级 1 次 — 页面侦察完毕且 PM 已登录后）

> 本节为会话级操作：全部页面侦察完成后执行 **1 次**，禁止按页面重复探测 / 重复提取 storageState。

### 2.1 提取 cookie 属性

通过 MCP `browser_run_code_unsafe` 提取 cookie 属性：

```
browser_run_code_unsafe: async (p) => {
  const cookies = await p.context().cookies();
  return JSON.stringify({
    httpOnly: cookies.filter(c => c.httpOnly).map(c => c.name),
    authType: cookies.some(c => c.httpOnly) ? 'http_only_session' : 'standard'
  });
}
```

### 2.2 提取完整 storageState

提取完整 storageState 并写入 `$PRJ/$VER/e2e/auth/storage.json`（httpOnly 也能捕获）：

```
browser_run_code_unsafe: async (p) => JSON.stringify(await p.context().storageState())
```

### 2.3 后续动作

1. 将探测结果写入 `logs/page-map.json` 的 `auth` 字段
2. 告知 PM 认证类型 + 后续执行策略（无头静默 vs 逐条执行）

## 3. 数据预采集一体化 payload（MUST — Phase 3.6 步骤 1，每页恰 1 次）

按页面批量实测采集数据值（关键词、行号、字段值、rowDescription、命中方向），替代历史逐 TC 串行导航采集。镜像第 0 节纪律：**逐字执行 payload，只填唯一参数区**——`build()` 与第 0 节同文同源，禁止另造。

```js
browser_run_code_unsafe: async (p) => {
  // ⚠️ 唯一参数区（逐字执行 payload，只改本区）——
  // PAGE.url = 本页 URL（page-map.json 的 pages key）；PAGE.ready = 就绪守卫关键元素 selector 条目 { type, args }（就绪守卫，禁 networkidle）
  // QUERIES 每项 = {
  //   tcId,                                            // 测试用例编号（samples 的 key）
  //   actions: [{ sel, value?, enter?, nth? }...],     // fill/click 序列：含 value → fill（'' 清空后填值；enter: true → 填后回车）；
  //                                                     //   无 value → click；nth 可选（如 el-date-picker 的 .el-range-input nth(1)）
  //   observe: [{ sel, kind, minTimeoutMs?, require? }...]  // 观测点：kind = 'rows'（表格行文本数组）| 'count'（"共 N 条"文本）|
  //                                                     //   'toast'（提示文本）| 'empty'（空状态文本）
  //                                                     // 观测点一律自动重试等待（默认 ≥2000ms，承载 P3 校验类口径）；
  //                                                     // require: true → 期望命中（P1 边界/验收类），未命中记入 gaps
  // }
  // 行内复杂定位（如点击含指定文本的行内按钮）用 CSS :has-text()：{ type: 'css', args: ['.el-table__row:has-text("赵六") button'] }
  const PAGE = { url: '', ready: null };
  const QUERIES = [];
  // ===== 执行体（禁止改写；build() 与第 0 节同文同源）=====
  const build = (p, { type, args }) => {
    switch (type) {
      case 'getByText': return p.getByText(...args);
      case 'getByRole': return p.getByRole(...args);
      case 'getByPlaceholder': return p.getByPlaceholder(...args);
      case 'getByLabel': return p.getByLabel(...args);
      case 'css': return p.locator(args[0]);
      default: return p.getByText(args[0]);
    }
  };
  const waitVisible = async (loc, ms) => {
    try { await loc.first().waitFor({ state: 'visible', timeout: ms }); return true; } catch { return false; }
  };
  const textOf = async (loc) => { try { return (await loc.first().textContent() || '').trim(); } catch { return ''; } };
  // 就绪守卫：goto + domcontentloaded + 关键元素 visible（禁止 networkidle，陷阱: spa_networkidle_timeout）
  const gaps = [];
  await p.goto(PAGE.url, { waitUntil: 'domcontentloaded' });
  if (PAGE.ready && !(await waitVisible(build(p, PAGE.ready), 15000))) {
    gaps.push({ step: 'ready_guard', detail: `就绪元素 ${JSON.stringify(PAGE.ready)} 15s 内不可见` });
  }
  const samples = {};
  for (const q of QUERIES) {
    const s = samples[q.tcId] = {};
    try {
      for (const a of q.actions || []) {
        const loc = build(p, a.sel).nth(a.nth ?? 0);
        if (a.value !== undefined) {
          await loc.fill(String(a.value));
          if (a.enter) await p.keyboard.press('Enter');
        } else {
          await loc.click();
        }
      }
      for (const o of q.observe || []) {
        const ms = Math.max(2000, o.minTimeoutMs || 2000);
        const loc = build(p, o.sel);
        if (o.kind === 'rows') {
          if (await waitVisible(loc, ms)) s.rows = await loc.allTextContents();
          else if (o.require) gaps.push({ tcId: q.tcId, kind: 'rows', expected: 'hit', detail: `期望命中但 ${JSON.stringify(o.sel)} 未出现（0 行）` });
        } else if (o.kind === 'count') {
          if (await waitVisible(loc, ms)) s.count = await textOf(loc);
          else if (o.require) gaps.push({ tcId: q.tcId, kind: 'count', expected: 'hit', detail: `总数元素 ${JSON.stringify(o.sel)} 未出现` });
        } else if (o.kind === 'toast') {
          if (await waitVisible(loc, ms)) s.toast = await textOf(loc);
          else { s.toast = null; if (o.require) gaps.push({ tcId: q.tcId, kind: 'toast', expected: 'hit', detail: `提示元素 ${JSON.stringify(o.sel)} ≥${ms}ms 未出现` }); }
        } else if (o.kind === 'empty') {
          if (await waitVisible(loc, ms)) s.empty = await textOf(loc);
          else { s.empty = null; if (o.require) gaps.push({ tcId: q.tcId, kind: 'empty', expected: 'hit', detail: `空状态元素 ${JSON.stringify(o.sel)} 未出现` }); }
        }
      }
    } catch (e) {
      gaps.push({ tcId: q.tcId, kind: 'error', detail: e.message });
    }
  }
  return JSON.stringify({ page: p.url(), samples, gaps });
}
```

**返回 JSON**：`{ page, samples: { [tcId]: {...数据值} }, gaps: [命中方向异常记录] }`。gaps 供主 agent 判定 `prd_vs_live_gaps` / `needs_manual`（如 P1 边界类期望命中但 0 行 → 数据精度受限，记 prd_vs_live_gaps；toast 期望出现但 ≥2s 未现 → 校验未实现）。

**调用预算（MUST）**：**每页 ≤ 1 次** `browser_run_code_unsafe`；单页查询计划过大（>10 个 TC 或预估 >60s）时按 TC 组分 ≤ 2 批（仍 ≤ 2 次/页）；仅观测失败的点允许单点补测 1 次（兜底）。禁止逐 TC 单独导航采集数据值。

> ⚠️ **payload 尾注（MUST）**：本 payload 必须逐字执行——禁止改写、禁止拆分执行体。唯一允许参数化：① 唯一参数区（PAGE / QUERIES）② 单页查询计划过大时按 TC 组分 ≤ 2 批。
