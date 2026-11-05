# 移动-手机 App 模拟 Layouts

**Pre-flight**: Read `../../assets/seeds/mobile-phone-app.html` + `../../../../_shared/_common.css`. Every class below must exist there.

## Class Inventory (must exist in seed + _common.css)

> `.device` `.app-screen` `.status-bar` `.nav-bar` `.nav-back` `.nav-title` `.nav-action` `.page-stack` `.page-slide` `.page-slide.slide-in` `.page-content` `.tab-bar` `.tab-item` `.tab-item.active` `.tab-icon` `.action-sheet-mask` `.action-sheet` `.action-sheet-btn` `.action-sheet-cancel` `.toast-native`

> Plus all `_common.css`: `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-sm` `.btn-lg` `.card` `.card-flat` `.card-header` `.field` `.field-hint` `.input` `.textarea` `.select` `.checkbox-label` `.badge` `.badge-success` `.badge-danger` `.badge-warning` `.badge-info` `.tag` `.pill` `.stat` `.stat-num` `.stat-unit` `.stat-label` `.ph-img` `.ph-img.square` `.ph-img.wide` `.empty-state` `.empty-icon` `.empty-title` `.empty-desc` `.skeleton` `.spinner` `.text-muted` `.text-sm` `.text-xs` `.text-center` `.text-bold` `.row` `.row-between` `.stack` `.grid-2` `.grid-3` `.mt-sm` `.mt-md` `.mb-sm` `.mb-md` `.gap-sm` `.gap-md`

---

## L01 — 列表页

Paste into `<main class="page-content">`. Feed-style card list.

```html
<section data-pb-id="list-page">
  <!-- Inline Search -->
  <div class="input-with-icon mb-sm">
    <svg class="icon icon-sm input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34" />
  <circle cx="11" cy="11" r="8" /></svg>
    <input class="input" type="search" placeholder="[REPLACE] 搜索..." style="padding-left: 38px; border-radius: 20px; background: var(--color-surface);">
  </div>

  <!-- Card Feed -->
  <div class="card mb-sm">
    <div class="row-between mb-sm">
      <div class="row" style="gap: 8px;">
        <div style="width: 36px; height: 36px; border-radius: 50%; background: color-mix(in oklch, var(--color-primary) 15%, transparent);"></div>
        <div>
          <div class="text-bold text-sm">[REPLACE] 标题一</div>
          <div class="text-xs text-muted">[REPLACE] 2026-07-22</div>
        </div>
      </div>
      <span class="badge badge-success">正常</span>
    </div>
    <p class="text-sm text-muted">[REPLACE] 卡片内容简述，一到两行，超出截断。</p>
    <div class="row mt-sm" style="gap: 16px; font-size: 13px; color: var(--color-text-secondary);">
      <span><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" /></svg> 12</span>
      <span><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" /></svg> 34</span>
    </div>
  </div>

  <div class="card mb-sm">
    <div class="row-between mb-sm">
      <div class="row" style="gap: 8px;">
        <div style="width: 36px; height: 36px; border-radius: 50%; background: color-mix(in oklch, var(--color-warning, #d97706) 15%, transparent);"></div>
        <div>
          <div class="text-bold text-sm">[REPLACE] 标题二</div>
          <div class="text-xs text-muted">[REPLACE] 2026-07-21</div>
        </div>
      </div>
      <span class="badge badge-warning">警告</span>
    </div>
    <p class="text-sm text-muted">[REPLACE] 另一个卡片的内容描述。</p>
  </div>

  <!-- Empty (hidden) -->
  <div class="empty-state" style="display: none;" data-pb-state="empty">
    <svg class="icon icon-md empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
    <p class="empty-title">[REPLACE] 暂无内容</p>
    <p class="empty-desc">[REPLACE] 点击右下角 + 发布第一条。</p>
  </div>
</section>
```

---

## L02 — 表单页

Paste into `<main class="page-content">`. Full-width stacked form.

```html
<section data-pb-id="form-page">
  <div class="card mb-sm">
    <div class="field mb-sm">
      <label>[REPLACE] 标题 *</label>
      <input class="input" type="text" placeholder="[REPLACE] 请输入标题">
    </div>
    <div class="field mb-sm">
      <label>[REPLACE] 分类</label>
      <select class="select">
        <option>[REPLACE] 请选择</option>
        <option>[REPLACE] 分类 A</option>
        <option>[REPLACE] 分类 B</option>
      </select>
    </div>
    <div class="field">
      <label>[REPLACE] 详细描述</label>
      <textarea class="textarea" placeholder="[REPLACE] 分享更多细节..."></textarea>
    </div>
  </div>

  <!-- Upload Placeholder -->
  <div class="card mb-sm" style="text-align: center; padding: 32px; border-style: dashed;">
    <svg class="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
  <circle cx="9" cy="9" r="2" />
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
    <p class="text-sm text-muted mt-sm">[REPLACE] 点击上传图片</p>
  </div>

  <!-- Sticky Submit -->
  <div style="padding: 12px 0;">
    <button id="submitBtn" class="btn btn-primary btn-lg" style="width: 100%;">[REPLACE] 发布</button>
  </div>
</section>
```

---

## L03 — 详情页

Paste into `<main class="page-content">`. Stacked sections.

```html
<section data-pb-id="detail-page">
  <!-- Hero Image -->
  <div class="ph-img wide mb-sm" style="border-radius: 12px; min-height: 160px;">[ 图片占位 ]</div>

  <h2 style="margin-bottom: 8px;">[REPLACE] 详情标题</h2>
  <div class="row-between mb-sm">
    <div class="row" style="gap: 8px;">
      <div style="width: 28px; height: 28px; border-radius: 50%; background: color-mix(in oklch, var(--color-primary) 15%, transparent);"></div>
      <span class="text-sm text-muted">[REPLACE] 作者名 · 2 小时前</span>
    </div>
    <span class="badge badge-success">[REPLACE] 进行中</span>
  </div>

  <p class="text-muted mb-md" style="line-height: 1.7;">[REPLACE] 详细正文内容。可能包含多段文字，描述该项目的完整信息。</p>

  <!-- Meta Card -->
  <div class="card mb-sm">
    <div class="row-between" style="padding: 8px 0;"><span class="text-sm text-muted">[REPLACE] 字段一</span><span class="text-sm text-bold">[REPLACE] 值</span></div>
    <div class="rule"></div>
    <div class="row-between" style="padding: 8px 0;"><span class="text-sm text-muted">[REPLACE] 字段二</span><span class="text-sm text-bold">[REPLACE] 值</span></div>
  </div>

  <!-- Bottom Bar -->
  <div style="display: flex; gap: 8px; padding: 12px 0;">
    <button id="favoriteBtn" class="btn btn-secondary" style="flex: 1;">[REPLACE] 收藏</button>
    <button id="actionBtn" class="btn btn-primary" style="flex: 1;">[REPLACE] 操作</button>
  </div>
</section>
```

---

## L04 — 仪表盘

Paste into `<main class="page-content">`.

```html
<section data-pb-id="dashboard">
  <!-- Greeting -->
  <div class="mb-md">
    <h2 style="margin-bottom: 4px;">[REPLACE] 你好, 用户名</h2>
    <p class="text-muted text-sm">[REPLACE] 今日概览</p>
  </div>

  <!-- Stat Cards 2x2 -->
  <div class="grid-2 mb-sm" style="gap: 10px;">
    <div class="card" style="padding: 14px;">
      <p class="text-xs text-muted">[REPLACE] 今日</p>
      <p class="stat-num" style="font-size: 28px; margin: 4px 0;">128</p>
      <span class="badge badge-success">↑ 12%</span>
    </div>
    <div class="card" style="padding: 14px;">
      <p class="text-xs text-muted">[REPLACE] 本周</p>
      <p class="stat-num" style="font-size: 28px; margin: 4px 0;">892</p>
      <span class="badge badge-success">↑ 8%</span>
    </div>
    <div class="card" style="padding: 14px;">
      <p class="text-xs text-muted">[REPLACE] 待处理</p>
      <p class="stat-num" style="font-size: 28px; margin: 4px 0;">12</p>
      <span class="badge badge-warning">⚠</span>
    </div>
    <div class="card" style="padding: 14px;">
      <p class="text-xs text-muted">[REPLACE] 完成率</p>
      <p class="stat-num" style="font-size: 28px; margin: 4px 0;">94%</p>
      <span class="badge badge-success">↑ 2%</span>
    </div>
  </div>

  <!-- Recent Activity -->
  <div class="card" style="padding: 0;">
    <div style="padding: 12px 16px; border-bottom: 1px solid var(--color-border);"><h4>[REPLACE] 最近动态</h4></div>
    <div style="padding: 10px 16px; border-bottom: 1px solid var(--color-border);">
      <div class="text-sm text-bold">[REPLACE] 事件一</div>
      <div class="text-xs text-muted">[REPLACE] 2 小时前</div>
    </div>
    <div style="padding: 10px 16px;">
      <div class="text-sm text-bold">[REPLACE] 事件二</div>
      <div class="text-xs text-muted">[REPLACE] 5 小时前</div>
    </div>
  </div>
</section>
```

---

## L05 — 空状态

Paste into `<main class="page-content">`.

```html
<div class="empty-state" style="padding: 80px 16px;" data-pb-id="empty-state">
  <svg class="icon icon-lg empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
  <p class="empty-title">[REPLACE] 还没有内容</p>
  <p class="empty-desc">[REPLACE] 点击底部 + 按钮创建第一条。</p>
</div>
```

---

## L06 — 错误页

Paste into `<main class="page-content">`.

```html
<div class="empty-state" style="padding: 80px 16px;" data-pb-id="error-page">
  <div class="ph-img square" style="width: 80px; height: 80px; border-radius: 50%; font-size: 28px; font-weight: 700; color: var(--color-danger);">[R] 404</div>
  <p class="empty-title mt-md">[REPLACE] 页面未找到</p>
  <p class="empty-desc">[REPLACE] 返回首页或重新加载。</p>
  <button class="btn btn-primary mt-sm">返回首页</button>
</div>
```

---

## L07 — 登录页

Paste instead of entire app-screen content (simplified full-screen).

```html
<div data-pb-id="login-page" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px;">
  <div style="text-align: center; margin-bottom: 36px;">
    <div style="width: 64px; height: 64px; background: var(--color-primary); border-radius: 20px; margin: 0 auto 16px;"></div>
    <h2 style="margin: 0;">[REPLACE] App 名称</h2>
    <p class="text-muted text-sm mt-xs">[REPLACE] 欢迎使用</p>
  </div>

  <div style="width: 100%;">
    <div class="field mb-sm">
      <input class="input" type="text" placeholder="[REPLACE] 手机号/邮箱" style="text-align: center;">
    </div>
    <div class="field mb-sm">
      <input class="input" type="password" placeholder="[REPLACE] 密码" style="text-align: center;">
    </div>
    <button id="loginBtn" class="btn btn-primary btn-lg" style="width: 100%; margin-top: 12px;">[REPLACE] 登录</button>
    <p class="text-center text-muted text-sm mt-md">[REPLACE] 没有账号? <a style="color:var(--color-primary);">注册</a></p>
  </div>
</div>
```
