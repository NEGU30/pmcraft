# PC-全屏网页 Layouts

**Pre-flight**: Read `../../assets/seeds/pc-fullscreen.html` + `../../../../_shared/_common.css`. Every class below must exist there.

## Class Inventory (must exist in seed + _common.css)

> `.app-shell` `.sidebar` `.sidebar-brand` `.brand-icon` `.sidebar-nav` `.sidebar-section` `.sidebar-item` `.sidebar-item.active` `.item-icon` `.item-badge` `.main-area` `.topbar` `.topbar-breadcrumb` `.topbar-actions` `.btn-icon` `.content` `.container` `.section` `.stack` `.row` `.row-between` `.row-start` `.grid-2` `.grid-3` `.grid-4` `.grid-2-1` `.grid-1-2` `.h1` `.h2` `.h3` `.h4` `.lead` `.eyebrow` `.meta` `.num` `.page-title` `.page-desc` `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-danger-solid` `.btn-sm` `.btn-lg` `.btn-arrow` `.card` `.card-flat` `.card-hover` `.card-header` `.field` `.field-hint` `.field-error` `.input` `.textarea` `.select` `.input-with-icon` `.input-icon` `.ds-table` `.num-col` `.col-actions` `.badge` `.badge-success` `.badge-danger` `.badge-warning` `.badge-info` `.tag` `.pill` `.stat` `.stat-num` `.stat-unit` `.stat-label` `.ph-img` `.ph-img.square` `.ph-img.portrait` `.ph-img.wide` `.rule` `.rule-strong` `.text-center` `.text-right` `.text-muted` `.text-sm` `.text-xs` `.text-bold` `.truncate` `.mt-xs` `.mt-sm` `.mt-md` `.mt-lg` `.mt-xl` `.mb-sm` `.mb-md` `.mb-lg` `.gap-xs` `.gap-sm` `.gap-md` `.gap-lg` `.empty-state` `.empty-icon` `.empty-title` `.empty-desc` `.skeleton` `.spinner` `.overlay` `.modal` `.modal-header` `.modal-body` `.modal-footer` `.modal-title` `.modal-close` `.toast-container` `.toast` `.toast-success` `.toast-danger` `.toast-warning` `.pagination` `.filter-bar` `.filter-actions` `.tabs` `.tab` `.tab.active` `.form-section` `.form-section-title`

> If a class is missing, add it to `<style>` in `_common.css` — not inline on each section.

---

## L01 — 列表页

Paste into `<main class="content">`. Uses filter bar + table + pagination pattern.

```html
<section class="page-list" data-pb-id="list-page">
  <!-- Header -->
  <div class="row-between mb-md">
    <div>
      <h2 class="page-title">[REPLACE] 页面标题</h2>
      <p class="page-desc">[REPLACE] 简要说明，共 <strong>N</strong> 条记录</p>
    </div>
    <button class="btn btn-primary"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" />
  <path d="M12 5v14" /></svg> [REPLACE] 新建</button>
  </div>

  <!-- Filter Bar -->
  <div class="filter-bar">
    <div class="input-with-icon" style="flex: 1; max-width: 320px;">
      <svg class="icon icon-sm input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34" />
  <circle cx="11" cy="11" r="8" /></svg>
      <input class="input" type="text" placeholder="[REPLACE] 搜索关键词...">
    </div>
    <button class="btn btn-secondary btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/></svg> 筛选</button>
    <button class="btn btn-secondary btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3" />
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  <path d="m7 10 5 5 5-5" /></svg> 导出</button>
  </div>

  <!-- Tabs (optional) -->
  <div class="tabs mb-md">
    <button class="tab active">[REPLACE] 全部 (N)</button>
    <button class="tab">[REPLACE] 分类一 (N)</button>
    <button class="tab">[REPLACE] 分类二 (N)</button>
  </div>

  <!-- Table -->
  <div class="card" style="padding: 0; overflow: hidden;">
    <table class="ds-table">
      <thead>
        <tr>
          <th style="width: 40px;"><input type="checkbox"></th>
          <th>[REPLACE] 列一</th>
          <th>[REPLACE] 列二</th>
          <th>[REPLACE] 列三</th>
          <th style="width: 100px;">状态</th>
          <th class="col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        <!-- Repeat for each row, 3-5 rows -->
        <tr>
          <td><input type="checkbox"></td>
          <td>[REPLACE] 行数据</td>
          <td>[REPLACE] 行数据</td>
          <td class="num-col">[REPLACE] 1,234</td>
          <td><span class="badge badge-success">[REPLACE] 正常</span></td>
          <td class="col-actions">
            <div class="row" style="gap: 4px; justify-content: flex-end;">
              <button class="btn btn-ghost btn-sm">编辑</button>
              <button class="btn btn-ghost btn-sm" style="color: var(--color-danger);">删除</button>
            </div>
          </td>
        </tr>
        <tr>
          <td><input type="checkbox"></td>
          <td>[REPLACE] 行数据</td>
          <td>[REPLACE] 行数据</td>
          <td class="num-col">[REPLACE] 567</td>
          <td><span class="badge badge-warning">[REPLACE] 警告</span></td>
          <td class="col-actions">
            <div class="row" style="gap: 4px; justify-content: flex-end;">
              <button class="btn btn-ghost btn-sm">编辑</button>
              <button class="btn btn-ghost btn-sm" style="color: var(--color-danger);">删除</button>
            </div>
          </td>
        </tr>
        <tr>
          <td><input type="checkbox"></td>
          <td>[REPLACE] 行数据</td>
          <td>[REPLACE] 行数据</td>
          <td class="num-col">[REPLACE] 89</td>
          <td><span class="badge badge-danger">[REPLACE] 异常</span></td>
          <td class="col-actions">
            <div class="row" style="gap: 4px; justify-content: flex-end;">
              <button class="btn btn-ghost btn-sm">编辑</button>
              <button class="btn btn-ghost btn-sm" style="color: var(--color-danger);">删除</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Empty state (hidden by default, shown when data is empty) -->
    <div class="empty-state" style="display: none;" data-pb-state="empty">
      <svg class="icon icon-md empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
      <p class="empty-title">[REPLACE] 暂无数据</p>
      <p class="empty-desc">[REPLACE] 还没有任何记录，点击下方按钮创建第一条。</p>
      <button class="btn btn-primary btn-sm mt-sm">[REPLACE] 创建第一条</button>
    </div>

    <!-- Loading state -->
    <div class="empty-state" style="display: none;" data-pb-state="loading">
      <div class="spinner"></div>
      <p class="empty-title mt-sm">[REPLACE] 加载中...</p>
    </div>
  </div>

  <!-- Pagination -->
  <div class="row-between mt-md">
    <span class="text-muted text-sm">共 <strong>[REPLACE] N</strong> 条记录</span>
    <div class="pagination">
      <button class="btn btn-secondary btn-sm" disabled>上一页</button>
      <button class="btn btn-primary btn-sm">1</button>
      <button class="btn btn-secondary btn-sm">2</button>
      <button class="btn btn-secondary btn-sm">3</button>
      <button class="btn btn-secondary btn-sm">下一页</button>
    </div>
  </div>
</section>
```

---

## L02 — 表单页

Paste into `<main class="content">`. Sections with form fields + sticky submit bar.

```html
<section class="page-form" data-pb-id="form-page">
  <!-- Header -->
  <div class="row-between mb-md">
    <div>
      <h2 class="page-title">[REPLACE] 表单标题</h2>
      <p class="page-desc">[REPLACE] 请填写以下信息，* 为必填项</p>
    </div>
  </div>

  <!-- Form Sections inside card -->
  <div class="card" style="padding: 0;">
    <div class="form-section">
      <h4 class="form-section-title">[REPLACE] 基本信息</h4>
      <div class="grid-2">
        <div class="field">
          <label>[REPLACE] 字段一 *</label>
          <input class="input" type="text" placeholder="[REPLACE] 请输入">
          <span class="field-hint">[REPLACE] 辅助说明</span>
        </div>
        <div class="field">
          <label>[REPLACE] 字段二</label>
          <input class="input" type="text" placeholder="[REPLACE] 请输入">
        </div>
        <div class="field" style="grid-column: 1 / -1;">
          <label>[REPLACE] 长文本字段 *</label>
          <textarea class="textarea" placeholder="[REPLACE] 请输入详细描述..."></textarea>
          <span class="field-hint">[REPLACE] 最多 500 字</span>
        </div>
        <div class="field">
          <label>[REPLACE] 下拉选择</label>
          <select class="select">
            <option value="">[REPLACE] 请选择</option>
            <option value="a">[REPLACE] 选项 A</option>
            <option value="b">[REPLACE] 选项 B</option>
          </select>
        </div>
        <div class="field">
          <label>[REPLACE] 日期</label>
          <input class="input" type="date">
        </div>
      </div>
    </div>

    <div class="form-section">
      <h4 class="form-section-title">[REPLACE] 详细信息</h4>
      <div class="field">
        <label>[REPLACE] 复选框组</label>
        <div class="checkbox-group">
          <label class="checkbox-label"><input type="checkbox"> [REPLACE] 选项 A</label>
          <label class="checkbox-label"><input type="checkbox"> [REPLACE] 选项 B</label>
          <label class="checkbox-label"><input type="checkbox"> [REPLACE] 选项 C</label>
        </div>
      </div>
    </div>
  </div>

  <!-- Validation example (hidden by default) -->
  <div class="card" style="display: none; border-color: var(--color-danger);" data-pb-state="error">
    <p class="text-danger text-sm text-bold">请修正以下错误：</p>
    <ul class="text-danger text-sm" style="margin-top: 4px;">
      <li>[REPLACE] 字段一 不能为空</li>
      <li>[REPLACE] 长文本字段 超过最大长度</li>
    </ul>
  </div>

  <!-- Submit Bar (sticky at bottom) -->
  <div class="row-between mt-lg" style="position: sticky; bottom: 0; background: var(--color-background); padding: 16px 0; border-top: 1px solid var(--color-border);">
    <button class="btn btn-secondary">保存草稿</button>
    <div class="row" style="gap: 8px;">
      <button class="btn btn-secondary">取消</button>
      <button class="btn btn-primary btn-lg">[REPLACE] 提交</button>
    </div>
  </div>
</section>
```

---

## L03 — 详情页

Paste into `<main class="content">`. Info sections with action bar.

```html
<section class="page-detail" data-pb-id="detail-page">
  <!-- Action Bar -->
  <div class="row-between mb-md">
    <div class="topbar-breadcrumb">
      <a href="#">[REPLACE] 列表</a>
      <span class="sep">/</span>
      <span class="current">[REPLACE] 详情</span>
    </div>
    <div class="row" style="gap: 8px;">
      <button class="btn btn-secondary btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg> 编辑</button>
      <button class="btn btn-danger btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 11v6" />
  <path d="M14 11v6" />
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  <path d="M3 6h18" />
  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> 删除</button>
    </div>
  </div>

  <!-- Info Cards -->
  <div class="grid-2-1">
    <!-- Left: Main Info -->
    <div class="stack">
      <div class="card">
        <div class="card-header">
          <h4>[REPLACE] 基本信息</h4>
          <span class="badge badge-success">[REPLACE] 正常</span>
        </div>
        <div class="grid-2" style="gap: 16px;">
          <div><p class="meta">[REPLACE] 字段一</p><p class="text-bold mt-xs">[REPLACE] 值</p></div>
          <div><p class="meta">[REPLACE] 字段二</p><p class="text-bold mt-xs">[REPLACE] 值</p></div>
          <div><p class="meta">[REPLACE] 字段三</p><p class="text-bold mt-xs">[REPLACE] 值</p></div>
          <div><p class="meta">[REPLACE] 字段四</p><p class="text-bold mt-xs">[REPLACE] 值</p></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h4>[REPLACE] 详细说明</h4></div>
        <p class="text-muted" style="line-height: 1.7;">[REPLACE] 详细内容段落，可能包含多行文字描述。</p>
      </div>
    </div>

    <!-- Right: Meta -->
    <div class="stack">
      <div class="card">
        <h4 class="mb-sm">[REPLACE] 时间信息</h4>
        <p class="meta">创建时间</p><p class="text-sm mt-xs">[REPLACE] 2026-07-22 10:30</p>
        <p class="meta mt-sm">更新时间</p><p class="text-sm mt-xs">[REPLACE] 2026-07-22 14:20</p>
      </div>
      <div class="card">
        <h4 class="mb-sm">[REPLACE] 操作记录</h4>
        <div class="text-sm text-muted">
          <p>[REPLACE] 07-22 创建</p>
          <p>[REPLACE] 07-21 编辑</p>
          <p>[REPLACE] 07-20 审核</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

---

## L04 — 仪表盘

Paste into `<main class="content">`. Stat cards + chart areas + table.

```html
<section class="page-dashboard" data-pb-id="dashboard">
  <div class="row-between mb-md">
    <div>
      <h2 class="page-title">[REPLACE] 仪表盘</h2>
      <p class="page-desc">[REPLACE] 数据更新于 2026-07-22 10:30</p>
    </div>
    <div class="row" style="gap: 8px;">
      <select class="select" style="width: auto; min-width: 120px;">
        <option>[REPLACE] 今日</option>
        <option>[REPLACE] 本周</option>
        <option>[REPLACE] 本月</option>
      </select>
      <button class="btn btn-secondary btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
  <path d="M21 3v5h-5" />
  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
  <path d="M8 16H3v5" /></svg></button>
    </div>
  </div>

  <!-- Stat Cards -->
  <div class="grid-4 mb-lg">
    <div class="card">
      <p class="meta">[REPLACE] 指标一</p>
      <div class="stat-num num" style="font-size: 32px; margin: 8px 0;">1,234</div>
      <span class="badge badge-success">↑ 12%</span>
    </div>
    <div class="card">
      <p class="meta">[REPLACE] 指标二</p>
      <div class="stat-num num" style="font-size: 32px; margin: 8px 0;">567</div>
      <span class="badge badge-danger">↓ 3%</span>
    </div>
    <div class="card">
      <p class="meta">[REPLACE] 指标三</p>
      <div class="stat-num num" style="font-size: 32px; margin: 8px 0;">89%</div>
      <span class="badge badge-success">↑ 5%</span>
    </div>
    <div class="card">
      <p class="meta">[REPLACE] 指标四</p>
      <div class="stat-num num" style="font-size: 32px; margin: 8px 0;">42</div>
      <span class="badge badge-warning">— 持平</span>
    </div>
  </div>

  <!-- Chart Row -->
  <div class="grid-2 mb-lg">
    <div class="card">
      <div class="card-header"><h4>[REPLACE] 趋势图</h4></div>
      <div class="ph-img wide" style="min-height: 200px;">[ 图表占位 · 趋势图 ]</div>
    </div>
    <div class="card">
      <div class="card-header"><h4>[REPLACE] 分布图</h4></div>
      <div class="ph-img wide" style="min-height: 200px;">[ 图表占位 · 分布图 ]</div>
    </div>
  </div>

  <!-- Recent Table -->
  <div class="card" style="padding: 0; overflow: hidden;">
    <div class="card-header" style="padding: 16px 24px;">
      <h4>[REPLACE] 最近记录</h4>
      <a href="#" class="btn btn-ghost btn-sm btn-arrow">查看全部</a>
    </div>
    <table class="ds-table">
      <thead>
        <tr><th>[REPLACE] 名称</th><th>[REPLACE] 类型</th><th class="num-col">[REPLACE] 数值</th><th>状态</th></tr>
      </thead>
      <tbody>
        <tr><td>[REPLACE] 条目一</td><td>[REPLACE] 类型A</td><td class="num-col">128</td><td><span class="badge badge-success">正常</span></td></tr>
        <tr><td>[REPLACE] 条目二</td><td>[REPLACE] 类型B</td><td class="num-col">64</td><td><span class="badge badge-warning">警告</span></td></tr>
      </tbody>
    </table>
  </div>
</section>
```

---

## L05 — 空状态

Paste into `<main class="content">`. Centered empty state with CTA.

```html
<section class="page-empty" data-pb-id="empty-state">
  <div class="empty-state" style="padding: 80px 24px;">
    <svg class="icon icon-lg empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
    <p class="empty-title">[REPLACE] 这里还没有内容</p>
    <p class="empty-desc">[REPLACE] 创建第一条记录即可开始。描述这样做的好处，一到两句话。</p>
    <button class="btn btn-primary btn-lg mt-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" />
  <path d="M12 5v14" /></svg> [REPLACE] 创建第一条</button>
  </div>
</section>
```

---

## L06 — 错误页

Paste into `<main class="content">`. Centered error display.

```html
<section class="page-error" data-pb-id="error-page">
  <div class="empty-state" style="padding: 80px 24px;">
    <div class="ph-img square" style="width: 100px; height: 100px; border-radius: 50%; font-size: 36px; font-weight: 700; color: var(--color-danger);">[REPLACE] 404</div>
    <p class="empty-title mt-md">[REPLACE] 页面未找到</p>
    <p class="empty-desc">[REPLACE] 您查找的页面不存在或已被移除。请检查 URL 或返回首页。</p>
    <div class="row" style="gap: 8px; margin-top: 16px;">
      <button class="btn btn-primary">返回首页</button>
      <button class="btn btn-secondary">返回上页</button>
    </div>
  </div>
</section>
```

---

## L07 — 登录页

Paste into a full-page context (replaces app-shell). Centered card.

```html
<section class="page-login" data-pb-id="login-page" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-background);">
  <div class="card" style="width: 400px; max-width: 90vw;">
    <div style="text-align: center; margin-bottom: 28px;">
      <div class="brand-icon" style="width: 40px; height: 40px; margin: 0 auto 12px; background: var(--color-primary); border-radius: var(--radius-md); display: grid; place-items: center; color: #fff; font-size: 18px; font-weight: 700;">[R]</div>
      <h2 style="margin: 0;">[REPLACE] 登录</h2>
      <p class="text-muted text-sm mt-xs">[REPLACE] 请输入您的账号信息</p>
    </div>

    <div class="field mb-sm">
      <label>[REPLACE] 用户名 / 邮箱</label>
      <div class="input-with-icon">
        <svg class="icon icon-sm input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
  <circle cx="12" cy="7" r="4" /></svg>
        <input class="input" type="text" placeholder="[REPLACE] 请输入">
      </div>
    </div>
    <div class="field mb-md">
      <label>[REPLACE] 密码</label>
      <div class="input-with-icon">
        <svg class="icon icon-sm input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
  <path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <input class="input" type="password" placeholder="[REPLACE] 请输入">
      </div>
    </div>

    <div class="row-between mb-md">
      <label class="checkbox-label"><input type="checkbox"> [REPLACE] 记住我</label>
      <a href="#" style="font-size: 13px; color: var(--color-primary);">[REPLACE] 忘记密码?</a>
    </div>

    <button class="btn btn-primary btn-lg" style="width: 100%;">[REPLACE] 登录</button>

    <p class="text-center text-muted text-sm mt-md">
      [REPLACE] 还没有账号? <a href="#" style="color: var(--color-primary);">[REPLACE] 注册</a>
    </p>

    <!-- Error state (hidden by default) -->
    <div class="card" style="margin-top: 16px; border-color: var(--color-danger); display: none;" data-pb-state="error">
      <p class="text-danger text-sm text-center">[REPLACE] 用户名或密码错误，请重试。</p>
    </div>
  </div>
</section>
```
