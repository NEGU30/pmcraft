# build-prototype 评价测试用例

## 正向触发（18条）
1. `build-prototype build all HTML`（页面清单含 2 流程页 + 2 基础页）— 预期：流程页逐个确认，基础页批量生成，完成后自动检查
2. `build-prototype build P1` — 预期：只生成 P1 一个页面
3. `build-prototype edit P1 加一个全选按钮` — 预期：定位 P1 增加按钮，自动检查
4. PM 确认完所有流程页后基础页自动生成 — 预期：流程页全部确认后自动执行基础页生成
5. 生成完成后质量检查发现配色偏离 — 预期：`--auto-fix` 脚本直接写盘修复 + 写后复检（脚本内完成，调用方不重跑）+ 基线条目同步刷新
6. 页面生成后第八步A 自动生成标注（HTML 技术栈）— 预期：annotate-prototype build 被调用，数据文件/head 注入/资产落位，提示 PM 两个标注开关可分别查看、可同时开启
7. edit 修改完成后 annotations/ 存在 — 预期：追加 annotate-prototype refresh，锚点同步
8. edit 只改 1 页（基线存在，5 页项目）— 预期：只 Read 目标页 DOM；check-quality `--pages` 只传 1 页且带 `--auto-fix`；annotate refresh 只处理 1 页（其余 4 页数据文件 mtime 不变）；**默认攒批 → 不 spawn reviewer**，登记 `review.pendingPages`（去重）+ `pendingRounds` +1；链路顺序 = check-quality → annotate refresh
9. 页面生成后第八步B 自动生成状态演示入口（HTML 技术栈，标注层已生成）— 预期：`demo/{page}.js` 从 annotations state 项派生（label/title/text/anchor 一致，无重解析）、head 幂等注入 3 行、demo 资产复制 working/ 根；Playwright 验证「演示」开关 → 面板列状态 → 点击切换（目标锚点显示 + 其他隐藏 + `data-pm-demo` 挂载）→「还原默认态」reload → 与标注两开关并存开启不重叠（三个开关垂直堆叠）；index.html 无注入
10. edit「加演示入口」（标注层存在，5 页项目，指定 1 页）— 预期：只该页派生数据 + 注入 + 汇报（无 state 页列出）；幂等重跑不重复注入
11. 嵌套锚点页（状态块是同一父元素子级，如 `#okLoading/#okMain/#okFail` 属 `#onekeyLogin`）— 预期：切 S1 不隐藏祖先锚点；页面自带 JS 状态机 timer 推进后 demo 状态仍保持（`!important` 压制 inline display）
12. 页面级 state 锚点（`anchor:"page"`）— 预期：仅气泡文案，不切换 display
13. 同锚多 state（S2/S3 共用一个锚点元素）— 预期：两项可切换、气泡文案各自正确、面板选中态正确
14. edit 连续 3 轮纯样式改动未存档 — 预期：前 2 轮只登记攒批（`pendingRounds` 累计、不 spawn reviewer），第 3 轮达阈值 `≥3` → **当轮立即完整评审**，评审 PASS 后清零队列
15. 队列非空时说「保存原型」— 预期：**先批量评审**（范围 = `pendingPages` ∪ 自 `lastAt` 后被改动的页，mtime+size 兜底），PASS 后才调 `save-version`；汇报格式"本轮批量评审覆盖 {N} 页…累计 {M} 轮未评审"
16. `build-prototype edit P1 改按钮颜色 --strict` — 预期：跳过攒批，当轮 spawn reviewer（旧行为）
17. edit 给列表加一个全选按钮（`<script>` 变化 + 交互元素变化）— 预期：判为结构性大改 → 当轮立即评审，不等攒批；评审时对变更页做运行时轻验证（navigate + 点新增交互 + 1 张截图）
18. 评审时技术分来源 — 预期：reviewer **自己执行** `node check-quality.js --pages=… --design-system=… --page-inventory=…`（不带 `--auto-fix`，零写盘），读自己跑出的 JSON 换算 Part C；主流程 spawn 时**未传**任何 check-quality 分数/结论

## 负向触发（13条）
1. `build-prototype build all`（page-inventory.md 不存在）— 预期：提示先规划页面，退出
2. `build-prototype edit 改颜色`（原型未生成）— 预期：提示先生成原型
3. PM 在流程页未确认时想跳过 — 预期：提示"确认后再进行下一步，确保方向正确"
4. `build-prototype build all HTML`（DESIGN.md 不存在）— 预期：提示先设定风格，退出
5. `build-prototype`（无参数，意图模糊）— 预期：追问"build 还是 edit？生成什么内容？"
6. 存量导入场景：`framework/` 含 `.tsx/.vue` 页面（第八步A 标注生成）— 预期：跳过标注，提示"标注层 v1 仅支持 HTML 模式"
7. 基线缺失（删掉 `prototype/.last-check.json` 后 edit）— 预期：annotate refresh / check-quality 回退全量（pages_checked=N），行为与现状一致，完成后重建基线
8. 无 state 项页面（annotations 仅 rule/flow）— 预期：`demo/{page}.js` 空 items，面板空态"本页暂无状态演示"，汇报列出无 state 页
9. 页面缺 `</head>` — 预期：跳过注入 + 汇总报告
10. 插件侧 demo 资产缺失（`_shared/demo/` 文件缺失）— 预期：完整性错误提示，退出，不注入引用
11. edit「去掉演示入口」— 预期：幂等移除 head 3 行引用 + 删除 `demo/` 数据文件与 working/ 根 demo 资产
12. check-quality 不可用/超时时 edit — 预期：**禁用攒批**，回退逐轮完整评审，并提示 PM"质量检查降级，已跳过评审攒批"
13. reviewer 返回 `scoreTechnical.source = "unavailable"` — 预期：汇报标注"技术分未验证，仅供参考"，不得当作通过；禁用后续攒批（下次 edit 强制完整评审）

## 边界查询（12条）
1. page-inventory.md 中只有一个页面 — 预期：直接生成，无需区分流程页/基础页分类
2. PM 连续生成后要求撤销上一次修改 — 预期：从 session 历史记录恢复（最多保留 5 次备份）
3. `build-prototype edit`（修改描述为空）— 预期：追问"要改什么内容？"
4. 本地 SVG 图标文件缺失 — 预期：使用虚线占位框 + 图标名替代，标注回退说明（无 emoji/UTF-8 符号）
5. page-inventory.md 列出 25 页，超过单次上限 — 预期：拆分每次 10 页，每批完成后让 PM 选择继续
6. 标注生成时 PRD 尚未生成（原型先行）— 预期：标注首版无溯源，提示 PRD 保存后自动刷新
7. 多端 `-pc/-h5` 页面 — 预期：各自注入各自 demo 数据（`demo/{page-pc}.js` / `demo/{page-h5}.js`）
8. 窄视口 <480px — 预期：演示面板不溢出、不遮标注徽章列
9. E 快照恢复 working（mtime 全变）— 预期：第八步B 幂等重注入 + 数据重派生
10. 单 state 页（仅 S1）— 预期：面板一项 + 还原可用
11. 旧基线无 `review` 块（老项目升级后首次 edit）— 预期：视为无积压、**不**触发一次性全量评审，按本轮变更正常登记（`pendingRounds` 从 1 起算）
12. 基线 `review` 块被 annotate refresh / auto-fix 回写时整块重写丢失 — 预期：视为基线损坏 → 本次 edit 回退"立即评审"（不登记攒批），提示 PM 基线异常；正文两处"原样保留未定义顶层字段"硬约束用于预防此情形
