# 移动-平板 App 模拟 Layouts

**Pre-flight**: Read `../../assets/seeds/mobile-tablet-app.html` + `../../../../_shared/_common.css`. Every class below must exist there.

## Class Inventory (must exist in seed + _common.css)

> `.tablet-frame` `.app-shell` `.sidebar` `.sidebar-header` `.sidebar-search` `.sidebar-item` `.sidebar-item.active` `.sidebar-subitem` `.sidebar-section-label` `.sidenav-icon` `.sidenav-badge` `.main-panel` `.top-bar` `.top-bar-title` `.top-bar-actions` `.top-bar-btn` `.content` `.split-view` `.split-master` `.split-detail` `.split-detail-placeholder` `.popover` `.popover-item` `.sheet-overlay` `.sheet` `.sheet-handle`

> Plus all `_common.css`: `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-sm` `.btn-lg` `.card` `.card-flat` `.card-header` `.field` `.field-hint` `.input` `.textarea` `.select` `.input-with-icon` `.input-icon` `.checkbox-label` `.badge` `.badge-success` `.badge-danger` `.badge-warning` `.badge-info` `.tag` `.pill` `.stat` `.stat-num` `.stat-unit` `.stat-label` `.ph-img` `.ph-img.square` `.ph-img.wide` `.empty-state` `.empty-icon` `.empty-title` `.empty-desc` `.ds-table` `.num-col` `.skeleton` `.spinner` `.text-muted` `.text-sm` `.text-xs` `.text-center` `.text-bold` `.row` `.row-between` `.stack` `.grid-2` `.grid-3` `.grid-4` `.mt-sm` `.mt-md` `.mb-sm` `.mb-md` `.gap-sm` `.gap-md` `.rule`

---

## L01 — 列表页

Paste into `<main class="content">`. Split-view master-detail.

```html
<section data-pb-id="list-page">
  <!-- Split View: List + Detail -->
  <div class="split-view" style="margin: -24px; height: calc(100% + 48px);">
    <!-- Master List -->
    <div class="split-master">
      <div style="padding: 12px 16px; border-bottom: 1px solid var(--color-border);">
        <div class="input-with-icon">
          <svg class="icon icon-sm input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34" />
  <circle cx="11" cy="11" r="8" /></svg>
          <input class="input" type="search" placeholder="[REPLACE] 搜索..." style="padding-left: 30px; font-size: 13px;">
        </div>
      </div>
      <div class="panel-list-item active" style="padding: 12px 16px; border-bottom: 1px solid var(--color-border);">
        <div style="flex: 1;">
          <div class="text-bold text-sm">[REPLACE] 条目一</div>
          <div class="text-xs text-muted">[REPLACE] 简述 · 2小时前</div>
        </div>
        <span class="badge badge-success">正常</span>
      </div>
      <div class="panel-list-item" style="padding: 12px 16px; border-bottom: 1px solid var(--color-border); border-left-color: transparent;">
        <div style="flex: 1;">
          <div class="text-bold text-sm">[REPLACE] 条目二</div>
          <div class="text-xs text-muted">[REPLACE] 简述 · 5小时前</div>
        </div>
        <span class="badge badge-warning">警告</span>
      </div>
      <div class="panel-list-item" style="padding: 12px 16px; border-bottom: 1px solid var(--color-border); border-left-color: transparent;">
        <div style="flex: 1;">
          <div class="text-bold text-sm">[REPLACE] 条目三</div>
          <div class="text-xs text-muted">[REPLACE] 简述 · 昨天</div>
        </div>
        <span class="text-xs text-muted">¥128</span>
      </div>
    </div>

    <!-- Detail Pane -->
    <div class="split-detail">
      <div style="padding: 24px;">
        <h3>[REPLACE] 条目一</h3>
        <p class="text-muted text-sm mt-sm">[REPLACE] 选中左侧项目查看详情。</p>

        <div class="card mt-md">
          <div class="row-between" style="padding: 8px 0;"><span class="text-sm text-muted">[REPLACE] 字段一</span><span class="text-sm text-bold">[REPLACE] 值</span></div>
          <div class="rule"></div>
          <div class="row-between" style="padding: 8px 0;"><span class="text-sm text-muted">[REPLACE] 字段二</span><span class="text-sm text-bold">[REPLACE] 值</span></div>
          <div class="rule"></div>
          <div class="row-between" style="padding: 8px 0;"><span class="text-sm text-muted">[REPLACE] 状态</span><span class="badge badge-success">正常</span></div>
        </div>

        <div class="row mt-md" style="gap: 8px;">
          <button class="btn btn-primary btn-sm">编辑</button>
          <button class="btn btn-secondary btn-sm">分享</button>
        </div>
      </div>
    </div>
  </div>
</section>
```

---

## L02 — 表单页

Paste into `<main class="content">`. Card-wrapped form.

```html
<section data-pb-id="form-page">
  <h3 class="mb-md">[REPLACE] 编辑信息</h3>

  <div class="card">
    <div class="grid-2" style="gap: 16px;">
      <div class="field">
        <label>[REPLACE] 名称 *</label>
        <input class="input" type="text" placeholder="[REPLACE] 请输入">
      </div>
      <div class="field">
        <label>[REPLACE] 类型</label>
        <select class="select">
          <option>[REPLACE] 类型A</option>
          <option>[REPLACE] 类型B</option>
        </select>
      </div>
      <div class="field" style="grid-column: 1 / -1;">
        <label>[REPLACE] 描述</label>
        <textarea class="textarea" placeholder="[REPLACE] 请输入描述..."></textarea>
      </div>
      <div class="field">
        <label>[REPLACE] 日期</label>
        <input class="input" type="date">
      </div>
      <div class="field">
        <label>[REPLACE] 优先级</label>
        <select class="select">
          <option>高</option><option>中</option><option>低</option>
        </select>
      </div>
    </div>

    <div class="row mt-lg" style="gap: 8px; justify-content: flex-end;">
      <button class="btn btn-secondary">取消</button>
      <button class="btn btn-primary">保存</button>
    </div>
  </div>
</section>
```

---

## L03 — 详情页

Paste into `<main class="content">`.

```html
<section data-pb-id="detail-page">
  <div class="row-between mb-md">
    <h3>[REPLACE] 详情标题</h3>
    <div class="row" style="gap: 8px;">
      <button class="btn btn-secondary btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg> 编辑</button>
      <button class="btn btn-danger btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 11v6" />
  <path d="M14 11v6" />
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  <path d="M3 6h18" />
  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>
    </div>
  </div>

  <div class="grid-2-1" style="gap: 24px;">
    <div class="stack">
      <div class="card">
        <div class="card-header"><h4>[REPLACE] 基本信息</h4></div>
        <div class="grid-2" style="gap: 12px;">
          <div><p class="meta">[REPLACE] 字段一</p><p class="text-bold mt-xs">[REPLACE] 值</p></div>
          <div><p class="meta">[REPLACE] 字段二</p><p class="text-bold mt-xs">[REPLACE] 值</p></div>
          <div><p class="meta">[REPLACE] 字段三</p><p class="text-bold mt-xs">[REPLACE] 值</p></div>
          <div><p class="meta">[REPLACE] 状态</p><span class="badge badge-success mt-xs">正常</span></div>
        </div>
      </div>
      <div class="card">
        <h4 class="mb-sm">[REPLACE] 详细说明</h4>
        <p class="text-muted text-sm" style="line-height: 1.7;">[REPLACE] 详细内容段落。</p>
      </div>
    </div>
    <div class="card">
      <h4 class="mb-sm">[REPLACE] 时间线</h4>
      <div class="stack" style="gap: 12px;">
        <div><p class="text-xs text-muted">07-22 10:30</p><p class="text-sm">[REPLACE] 创建</p></div>
        <div><p class="text-xs text-muted">07-22 14:20</p><p class="text-sm">[REPLACE] 编辑</p></div>
        <div><p class="text-xs text-muted">07-21 09:00</p><p class="text-sm">[REPLACE] 审核通过</p></div>
      </div>
    </div>
  </div>
</section>
```

---

## L04 — 仪表盘

Paste into `<main class="content">`.

```html
<section data-pb-id="dashboard">
  <div class="row-between mb-md">
    <h3>[REPLACE] 数据概览</h3>
    <select class="select" style="width: auto; min-width: 100px; font-size: 13px;">
      <option>今日</option><option>本周</option><option>本月</option>
    </select>
  </div>

  <div class="grid-4 mb-lg" style="gap: 12px;">
    <div class="card" style="padding: 16px;">
      <p class="text-xs text-muted">[REPLACE] 指标一</p>
      <p class="stat-num" style="font-size: 32px; margin: 4px 0;">1,234</p>
      <span class="badge badge-success">↑ 12%</span>
    </div>
    <div class="card" style="padding: 16px;">
      <p class="text-xs text-muted">[REPLACE] 指标二</p>
      <p class="stat-num" style="font-size: 32px; margin: 4px 0;">567</p>
      <span class="badge badge-danger">↓ 3%</span>
    </div>
    <div class="card" style="padding: 16px;">
      <p class="text-xs text-muted">[REPLACE] 指标三</p>
      <p class="stat-num" style="font-size: 32px; margin: 4px 0;">89%</p>
      <span class="badge badge-success">↑ 5%</span>
    </div>
    <div class="card" style="padding: 16px;">
      <p class="text-xs text-muted">[REPLACE] 指标四</p>
      <p class="stat-num" style="font-size: 32px; margin: 4px 0;">42</p>
      <span class="badge badge-warning">—</span>
    </div>
  </div>

  <div class="grid-2" style="gap: 12px;">
    <div class="card"><h4 class="mb-sm">[REPLACE] 趋势</h4><div class="ph-img wide" style="min-height: 180px;">[ 图表 ]</div></div>
    <div class="card"><h4 class="mb-sm">[REPLACE] 分布</h4><div class="ph-img wide" style="min-height: 180px;">[ 图表 ]</div></div>
  </div>
</section>
```

---

## L05 — 空状态

Paste into `<main class="content">`.

```html
<div class="empty-state" style="padding: 80px 24px;" data-pb-id="empty-state">
  <svg class="icon icon-lg empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
  <p class="empty-title">[REPLACE] 这里还没有内容</p>
  <p class="empty-desc">[REPLACE] 从左侧菜单选择一个功能开始使用。</p>
</div>
```

---

## L06 — 错误页

Paste into `<main class="content">`.

```html
<div class="empty-state" style="padding: 80px 24px;" data-pb-id="error-page">
  <div class="ph-img square" style="width: 100px; height: 100px; border-radius: 50%; font-size: 32px; font-weight: 700; color: var(--color-danger);">[R] 500</div>
  <p class="empty-title mt-md">[REPLACE] 服务器错误</p>
  <p class="empty-desc">[REPLACE] 请稍后重试。如问题持续，请联系管理员。</p>
  <div class="row mt-sm" style="gap: 8px;">
    <button class="btn btn-primary">重试</button>
    <button class="btn btn-secondary">返回首页</button>
  </div>
</div>
```

---

## L07 — 登录页

Paste into `<main class="content">` (replaces normal content).

```html
<section data-pb-id="login-page" style="display: flex; align-items: center; justify-content: center; min-height: 100%;">
  <div class="card" style="width: 380px; max-width: 100%;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 48px; height: 48px; background: var(--color-primary); border-radius: 14px; margin: 0 auto 12px;"></div>
      <h2 style="margin: 0;">[REPLACE] 欢迎回来</h2>
      <p class="text-muted text-sm mt-xs">[REPLACE] 请输入您的账号信息</p>
    </div>

    <div class="field mb-sm">
      <label>[REPLACE] 用户名</label>
      <input class="input" type="text" placeholder="[REPLACE] 请输入">
    </div>
    <div class="field mb-sm">
      <label>[REPLACE] 密码</label>
      <input class="input" type="password" placeholder="[REPLACE] 请输入">
    </div>

    <div class="row-between mb-sm">
      <label class="checkbox-label"><input type="checkbox"> [REPLACE] 记住我</label>
      <a href="#" style="font-size: 13px; color: var(--color-primary);">[REPLACE] 忘记密码?</a>
    </div>

    <button class="btn btn-primary btn-lg" style="width: 100%;">[REPLACE] 登录</button>

    <p class="text-center text-muted text-sm mt-md">
      [REPLACE] 还没有账号? <a style="color:var(--color-primary);">注册</a>
    </p>
  </div>
</section>
```
