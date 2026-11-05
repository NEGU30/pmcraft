# PC-桌面软件风格 Layouts

**Pre-flight**: Read `../../assets/seeds/pc-desktop-style.html` + `../../../../_shared/_common.css`. Every class below must exist there.

## Class Inventory (must exist in seed + _common.css)

> `.toolbar` `.toolbar-group` `.toolbar-btn` `.toolbar-sep` `.toolbar-label` `.main-grid` `.main-grid.two-panel` `.panel` `.panel-header` `.panel-list-item` `.panel-list-item.active` `.item-icon` `.item-label` `.item-count` `.center-panel` `.center-toolbar` `.center-content` `.context-menu` `.context-menu.show` `.context-menu-item` `.shortcut` `.context-menu-divider` `.dense-table` `.status-bar` `.status-item` `.status-dot` `.spacer`

> Plus all `_common.css` classes: `.input` `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-sm` `.btn-lg` `.card` `.card-flat` `.card-header` `.ds-table` `.num-col` `.col-actions` `.badge` `.badge-success` `.badge-danger` `.badge-warning` `.badge-info` `.tag` `.pill` `.stat` `.stat-num` `.stat-unit` `.stat-label` `.field` `.field-hint` `.field-error` `.checkbox-label` `.select` `.textarea` `.empty-state` `.empty-icon` `.empty-title` `.empty-desc` `.skeleton` `.spinner` `.ph-img` `.rule` `.text-muted` `.text-sm` `.text-xs` `.text-center` `.text-bold` `.truncate` `.row` `.row-between` `.row-start` `.stack` `.grid-2` `.grid-3` `.grid-4` `.mt-sm` `.mt-md` `.mt-lg` `.mb-sm` `.mb-md` `.mb-lg` `.gap-sm` `.gap-md`

---

## L01 — 列表页

Paste into `<div class="center-content">`. Dense table + context menu pattern.

```html
<div class="page-list" data-pb-id="list-page">
  <!-- Center Toolbar Actions -->
  <div class="row-between mb-sm">
    <div class="row" style="gap: 4px;">
      <button class="toolbar-btn" title="新建"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" />
  <path d="M12 5v14" /></svg></button>
      <button class="toolbar-btn" title="删除"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 11v6" />
  <path d="M14 11v6" />
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  <path d="M3 6h18" />
  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>
      <div class="toolbar-sep"></div>
      <button class="toolbar-btn" title="刷新"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
  <path d="M21 3v5h-5" />
  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
  <path d="M8 16H3v5" /></svg></button>
    </div>
    <div class="input-with-icon" style="width: 200px;">
      <svg class="icon icon-sm input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34" />
  <circle cx="11" cy="11" r="8" /></svg>
      <input class="input" type="text" placeholder="[REPLACE] 搜索..." style="padding: 4px 8px 4px 28px; font-size: 12px;">
    </div>
  </div>

  <!-- Dense Table -->
  <table class="ds-table dense-table">
    <thead>
      <tr>
        <th style="width: 30px;"><input type="checkbox"></th>
        <th>[REPLACE] 名称</th>
        <th>[REPLACE] 类型</th>
        <th style="width: 80px;">状态</th>
        <th class="num-col" style="width: 80px;">[REPLACE] 大小</th>
        <th style="width: 140px;">[REPLACE] 修改时间</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><input type="checkbox"></td>
        <td><strong>[REPLACE] 项目一</strong></td>
        <td class="text-muted">[REPLACE] 类型A</td>
        <td><span class="badge badge-success">正常</span></td>
        <td class="num-col">1.2 MB</td>
        <td class="text-muted text-sm">07-22 10:30</td>
      </tr>
      <tr>
        <td><input type="checkbox"></td>
        <td><strong>[REPLACE] 项目二</strong></td>
        <td class="text-muted">[REPLACE] 类型B</td>
        <td><span class="badge badge-warning">警告</span></td>
        <td class="num-col">4.8 MB</td>
        <td class="text-muted text-sm">07-22 09:15</td>
      </tr>
      <tr>
        <td><input type="checkbox"></td>
        <td><strong>[REPLACE] 项目三</strong></td>
        <td class="text-muted">[REPLACE] 类型C</td>
        <td><span class="badge badge-danger">异常</span></td>
        <td class="num-col">0.3 MB</td>
        <td class="text-muted text-sm">07-21 16:45</td>
      </tr>
      <tr>
        <td><input type="checkbox"></td>
        <td><strong>[REPLACE] 项目四</strong></td>
        <td class="text-muted">[REPLACE] 类型A</td>
        <td><span class="badge badge-success">正常</span></td>
        <td class="num-col">8.1 MB</td>
        <td class="text-muted text-sm">07-21 08:00</td>
      </tr>
    </tbody>
  </table>

  <!-- Empty state (hidden) -->
  <div class="empty-state" style="display: none;" data-pb-state="empty">
    <svg class="icon icon-md empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
    <p class="empty-title">[REPLACE] 暂无数据</p>
    <p class="empty-desc">[REPLACE] 点击工具栏 + 创建新项目。</p>
  </div>
</div>
```

---

## L02 — 表单页

Paste into `<div class="center-content">`. Multi-field form with property-panel layout.

```html
<div class="page-form" data-pb-id="form-page">
  <div class="row-between mb-sm">
    <span class="toolbar-label">[REPLACE] 编辑项目</span>
    <div class="row" style="gap: 4px;">
      <button class="btn btn-secondary btn-sm">取消</button>
      <button class="btn btn-primary btn-sm">保存</button>
    </div>
  </div>

  <div class="grid-2" style="gap: 16px;">
    <div class="field">
      <label>[REPLACE] 名称 *</label>
      <input class="input" type="text" placeholder="[REPLACE] 请输入名称" style="font-size: 13px; padding: 6px 10px;">
    </div>
    <div class="field">
      <label>[REPLACE] 类型</label>
      <select class="select" style="font-size: 13px; padding: 6px 10px;">
        <option>[REPLACE] 类型A</option>
        <option>[REPLACE] 类型B</option>
      </select>
    </div>
    <div class="field" style="grid-column: 1 / -1;">
      <label>[REPLACE] 描述</label>
      <textarea class="textarea" placeholder="[REPLACE] 请输入描述..." style="font-size: 13px; min-height: 60px;"></textarea>
    </div>
    <div class="field">
      <label>[REPLACE] 标签</label>
      <input class="input" type="text" placeholder="[REPLACE] 以逗号分隔" style="font-size: 13px; padding: 6px 10px;">
    </div>
    <div class="field">
      <label>[REPLACE] 优先级</label>
      <select class="select" style="font-size: 13px; padding: 6px 10px;">
        <option>高</option><option>中</option><option>低</option>
      </select>
    </div>
  </div>
</div>
```

---

## L03 — 详情页

Paste into `<div class="center-content">`. Property-grid detail view.

```html
<div class="page-detail" data-pb-id="detail-page">
  <div class="row-between mb-sm">
    <span class="toolbar-label">[REPLACE] 项目详情</span>
    <div class="row" style="gap: 4px;">
      <button class="btn btn-secondary btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg> 编辑</button>
      <button class="btn btn-danger btn-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 11v6" />
  <path d="M14 11v6" />
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  <path d="M3 6h18" />
  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> 删除</button>
    </div>
  </div>

  <div class="grid-2" style="gap: 16px;">
    <div class="card card-flat">
      <h4 class="mb-sm">[REPLACE] 基本信息</h4>
      <table class="ds-table dense-table">
        <tr><td class="text-muted">名称</td><td class="text-bold">[REPLACE] 值</td></tr>
        <tr><td class="text-muted">类型</td><td class="text-bold">[REPLACE] 值</td></tr>
        <tr><td class="text-muted">状态</td><td><span class="badge badge-success">正常</span></td></tr>
        <tr><td class="text-muted">创建时间</td><td>[REPLACE] 2026-07-22</td></tr>
      </table>
    </div>
    <div class="card card-flat">
      <h4 class="mb-sm">[REPLACE] 详细说明</h4>
      <p class="text-muted text-sm">[REPLACE] 详细描述内容。</p>
    </div>
  </div>
</div>
```

---

## L04 — 仪表盘

Paste into `<div class="center-content">`. Minimal stat row + chart grid.

```html
<div class="page-dashboard" data-pb-id="dashboard">
  <span class="toolbar-label mb-sm" style="display: block;">[REPLACE] 数据概览</span>

  <div class="grid-4 mb-md" style="gap: 12px;">
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

  <div class="grid-2" style="gap: 12px;">
    <div class="card" style="padding: 16px;"><h4 class="mb-sm">[REPLACE] 趋势</h4><div class="ph-img wide" style="min-height: 160px; border-radius: 6px;">[ 图表 ]</div></div>
    <div class="card" style="padding: 16px;"><h4 class="mb-sm">[REPLACE] 分布</h4><div class="ph-img wide" style="min-height: 160px; border-radius: 6px;">[ 图表 ]</div></div>
  </div>
</div>
```

---

## L05 — 空状态

Paste into `<div class="center-content">`.

```html
<div class="empty-state" style="padding: 80px 24px;" data-pb-id="empty-state">
  <svg class="icon icon-lg empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
  <p class="empty-title">[REPLACE] 还没有项目</p>
  <p class="empty-desc">[REPLACE] 点击工具栏 + 按钮开始创建。</p>
  <button class="btn btn-primary btn-sm mt-sm"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" />
  <path d="M12 5v14" /></svg> [REPLACE] 新建项目</button>
</div>
```

---

## L06 — 错误页

Paste into `<div class="center-content">`.

```html
<div class="empty-state" style="padding: 80px 24px;" data-pb-id="error-page">
  <div class="ph-img square" style="width: 80px; height: 80px; border-radius: 50%; font-size: 28px; font-weight: 700; color: var(--color-danger);">[R] 500</div>
  <p class="empty-title mt-md">[REPLACE] 服务器错误</p>
  <p class="empty-desc">[REPLACE] 请稍后重试，或联系技术支持。</p>
  <div class="row" style="gap: 8px; margin-top: 12px;">
    <button class="btn btn-primary btn-sm">重试</button>
    <button class="btn btn-secondary btn-sm">诊断</button>
  </div>
</div>
```
