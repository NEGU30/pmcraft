# 移动-H5 网页 Layouts

**Pre-flight**: Read `../../assets/seeds/mobile-h5.html` + `../../../../_shared/_common.css`. Every class below must exist there.

## Class Inventory (must exist in seed + _common.css)

> `.mobile-header` `.back-btn` `.header-title` `.header-action` `.mobile-content` `.list-card` `.card-avatar` `.card-body` `.card-title` `.card-desc` `.card-meta` `.card-right` `.tab-scroll` `.tab-item` `.tab-item.active` `.bottom-sheet-overlay` `.bottom-sheet` `.bottom-sheet-handle` `.bottom-sheet-item` `.sticky-bottom`

> Plus all `_common.css`: `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-sm` `.btn-lg` `.card` `.card-flat` `.card-header` `.field` `.field-hint` `.field-error` `.input` `.textarea` `.select` `.input-with-icon` `.input-icon` `.badge` `.badge-success` `.badge-danger` `.badge-warning` `.badge-info` `.tag` `.pill` `.stat` `.stat-num` `.stat-unit` `.stat-label` `.ph-img` `.empty-state` `.empty-icon` `.empty-title` `.empty-desc` `.skeleton` `.spinner` `.text-muted` `.text-sm` `.text-xs` `.text-center` `.text-bold` `.row` `.row-between` `.stack` `.grid-2` `.grid-3` `.mt-sm` `.mt-md` `.mb-sm` `.mb-md` `.gap-sm` `.gap-md`

---

## L01 — 列表页

Paste into `<main class="mobile-content">`.

```html
<section class="page-list" data-pb-id="list-page">
  <!-- Search Bar -->
  <div class="input-with-icon mb-sm">
    <svg class="icon icon-sm input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34" />
  <circle cx="11" cy="11" r="8" /></svg>
    <input class="input" type="search" placeholder="[REPLACE] 搜索..." style="padding-left: 36px; border-radius: 20px; background: var(--color-surface);">
  </div>

  <!-- Tab Scroll (optional) -->
  <div class="tab-scroll mb-sm">
    <button class="tab-item active">[REPLACE] 全部</button>
    <button class="tab-item">[REPLACE] 分类一</button>
    <button class="tab-item">[REPLACE] 分类二</button>
    <button class="tab-item">[REPLACE] 分类三</button>
  </div>

  <!-- Card List -->
  <div class="list-card">
    <div class="card-avatar"></div>
    <div class="card-body">
      <div class="card-title">[REPLACE] 标题一</div>
      <div class="card-desc">[REPLACE] 描述文字，简短说明</div>
      <div class="card-meta">[REPLACE] 2026-07-22 · 标签</div>
    </div>
    <div class="card-right">
      <span class="badge badge-success">正常</span>
    </div>
  </div>
  <div class="list-card">
    <div class="card-avatar"></div>
    <div class="card-body">
      <div class="card-title">[REPLACE] 标题二</div>
      <div class="card-desc">[REPLACE] 描述文字</div>
      <div class="card-meta">[REPLACE] 2026-07-21</div>
    </div>
    <div class="card-right">
      <span class="badge badge-warning">警告</span>
    </div>
  </div>
  <div class="list-card">
    <div class="card-avatar"></div>
    <div class="card-body">
      <div class="card-title">[REPLACE] 标题三</div>
      <div class="card-desc">[REPLACE] 描述文字</div>
      <div class="card-meta">[REPLACE] 2026-07-20</div>
    </div>
    <div class="card-right">
      <span class="text-muted text-sm">¥128</span>
    </div>
  </div>

  <!-- Load More -->
  <div class="text-center mt-md">
    <button class="btn btn-secondary btn-sm" style="width: 100%;">[REPLACE] 加载更多</button>
  </div>

  <!-- Empty (hidden) -->
  <div class="empty-state" style="display: none;" data-pb-state="empty">
    <svg class="icon icon-md empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
    <p class="empty-title">[REPLACE] 暂无数据</p>
    <p class="empty-desc">[REPLACE] 还没有任何记录</p>
  </div>
</section>
```

---

## L02 — 表单页

Paste into `<main class="mobile-content">`.

```html
<section class="page-form" data-pb-id="form-page">
  <div class="field mb-sm">
    <label>[REPLACE] 字段一 *</label>
    <input class="input" type="text" placeholder="[REPLACE] 请输入">
    <span class="field-hint">[REPLACE] 辅助说明</span>
  </div>
  <div class="field mb-sm">
    <label>[REPLACE] 字段二</label>
    <input class="input" type="text" placeholder="[REPLACE] 请输入">
  </div>
  <div class="field mb-sm">
    <label>[REPLACE] 下拉选择</label>
    <select class="select">
      <option>[REPLACE] 请选择</option>
      <option>[REPLACE] 选项 A</option>
      <option>[REPLACE] 选项 B</option>
    </select>
  </div>
  <div class="field mb-sm">
    <label>[REPLACE] 长文本</label>
    <textarea class="textarea" placeholder="[REPLACE] 请输入描述..."></textarea>
  </div>
  <div class="field mb-sm">
    <label>[REPLACE] 复选框组</label>
    <div class="checkbox-group">
      <label class="checkbox-label"><input type="checkbox"> [REPLACE] 选项 A</label>
      <label class="checkbox-label"><input type="checkbox"> [REPLACE] 选项 B</label>
    </div>
  </div>

  <!-- Sticky Submit -->
  <div class="sticky-bottom">
    <button class="btn btn-primary btn-lg" style="flex: 1;">[REPLACE] 提交</button>
  </div>
</section>
```

---

## L03 — 详情页

Paste into `<main class="mobile-content">`.

```html
<section class="page-detail" data-pb-id="detail-page">
  <!-- Info Card -->
  <div class="card mb-sm">
    <h4 style="margin-bottom: 12px;">[REPLACE] 基本信息</h4>
    <div class="stack" style="gap: 10px;">
      <div class="row-between"><span class="text-muted text-sm">[REPLACE] 字段一</span><span class="text-bold">[REPLACE] 值</span></div>
      <div class="row-between"><span class="text-muted text-sm">[REPLACE] 字段二</span><span class="text-bold">[REPLACE] 值</span></div>
      <div class="row-between"><span class="text-muted text-sm">[REPLACE] 状态</span><span class="badge badge-success">正常</span></div>
    </div>
  </div>
  <div class="card mb-sm">
    <h4 style="margin-bottom: 12px;">[REPLACE] 详细描述</h4>
    <p class="text-muted text-sm">[REPLACE] 详细内容段落。</p>
  </div>

  <!-- Bottom Action -->
  <div class="sticky-bottom">
    <button class="btn btn-primary" style="flex: 1;">[REPLACE] 编辑</button>
    <button class="btn btn-secondary">[REPLACE] 分享</button>
  </div>
</section>
```

---

## L04 — 仪表盘

Paste into `<main class="mobile-content">`.

```html
<section class="page-dashboard" data-pb-id="dashboard">
  <!-- Stat Cards (2x2 grid) -->
  <div class="grid-2 mb-sm" style="gap: 12px;">
    <div class="card" style="padding: 16px;">
      <p class="text-xs text-muted">[REPLACE] 指标一</p>
      <p class="stat-num" style="font-size: 28px; margin: 4px 0;">1,234</p>
      <span class="badge badge-success">↑ 12%</span>
    </div>
    <div class="card" style="padding: 16px;">
      <p class="text-xs text-muted">[REPLACE] 指标二</p>
      <p class="stat-num" style="font-size: 28px; margin: 4px 0;">567</p>
      <span class="badge badge-danger">↓ 3%</span>
    </div>
    <div class="card" style="padding: 16px;">
      <p class="text-xs text-muted">[REPLACE] 指标三</p>
      <p class="stat-num" style="font-size: 28px; margin: 4px 0;">89%</p>
      <span class="badge badge-success">↑ 5%</span>
    </div>
    <div class="card" style="padding: 16px;">
      <p class="text-xs text-muted">[REPLACE] 指标四</p>
      <p class="stat-num" style="font-size: 28px; margin: 4px 0;">42</p>
      <span class="badge badge-warning">— 持平</span>
    </div>
  </div>

  <!-- Chart Card -->
  <div class="card mb-sm">
    <h4 style="margin-bottom: 8px;">[REPLACE] 趋势</h4>
    <div class="ph-img wide" style="min-height: 140px; border-radius: 8px;">[ 图表 ]</div>
  </div>

  <!-- Recent List -->
  <div class="card" style="padding: 0;">
    <div style="padding: 12px 16px; border-bottom: 1px solid var(--color-border);"><h4>[REPLACE] 最近记录</h4></div>
    <div class="list-card" style="padding: 12px 16px;">
      <div class="card-body"><div class="card-title">[REPLACE] 条目一</div><div class="card-meta">[REPLACE] 07-22</div></div>
      <span class="badge badge-success">正常</span>
    </div>
    <div class="list-card" style="padding: 12px 16px;">
      <div class="card-body"><div class="card-title">[REPLACE] 条目二</div><div class="card-meta">[REPLACE] 07-21</div></div>
      <span class="badge badge-warning">警告</span>
    </div>
  </div>
</section>
```

---

## L05 — 空状态

Paste into `<main class="mobile-content">`.

```html
<div class="empty-state" style="padding: 80px 24px;" data-pb-id="empty-state">
  <svg class="icon icon-lg empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
  <p class="empty-title">[REPLACE] 这里还没有内容</p>
  <p class="empty-desc">[REPLACE] 创建第一条记录即可开始。</p>
  <button class="btn btn-primary btn-lg mt-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" />
  <path d="M12 5v14" /></svg> [REPLACE] 立即创建</button>
</div>
```

---

## L06 — 错误页

Paste into `<main class="mobile-content">`.

```html
<div class="empty-state" style="padding: 80px 24px;" data-pb-id="error-page">
  <div class="ph-img square" style="width: 80px; height: 80px; border-radius: 50%; font-size: 28px; font-weight: 700; color: var(--color-danger);">[R] 404</div>
  <p class="empty-title mt-md">[REPLACE] 页面未找到</p>
  <p class="empty-desc">[REPLACE] 请检查地址或返回首页。</p>
  <div class="row" style="gap: 8px; margin-top: 12px;">
    <button class="btn btn-primary" style="flex: 1;">返回首页</button>
    <button class="btn btn-secondary" style="flex: 1;">重新加载</button>
  </div>
</div>
```

---

## L07 — 登录页

Replaces entire body (not inside mobile-content).

```html
<div class="page-login" data-pb-id="login-page" style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="width: 56px; height: 56px; background: var(--color-primary); border-radius: 16px; margin: 0 auto 16px;"></div>
    <h2 style="margin: 0;">[REPLACE] 欢迎回来</h2>
    <p class="text-muted text-sm mt-xs">[REPLACE] 请输入您的账号</p>
  </div>

  <div style="width: 100%;">
    <div class="field mb-sm">
      <label>[REPLACE] 手机号 / 邮箱</label>
      <input class="input" type="text" placeholder="[REPLACE] 请输入">
    </div>
    <div class="field mb-sm">
      <label>[REPLACE] 密码</label>
      <input class="input" type="password" placeholder="[REPLACE] 请输入">
    </div>

    <button class="btn btn-primary btn-lg" style="width: 100%; margin-top: 16px;">[REPLACE] 登录</button>

    <p class="text-center text-muted text-sm mt-md">
      [REPLACE] 还没有账号? <a href="#" style="color: var(--color-primary);">[REPLACE] 注册</a>
    </p>
  </div>
</div>
```
