# 输出模板包（Phase 3 加载）

> prepare-dev 技能 Phase 3 输出阶段的模板骨架与填实示例。内容与拆分前 SKILL.md 原文逐字一致。
> 加载时机：进入 Phase 3 时由 SKILL.md 按需加载（详见 SKILL.md「加载策略」表）；本文件不加载任何其他文件。

#### pre_proposal.md 模板

```markdown
# {功能名称}

> 版本：{版本号} | PRD 文档修订：E{编号}
> 对比上一版本：{有则填上一版本号，无则填"全新项目"}
> 生成时间：{当前日期}

## Why（→ proposal.md Why）

{从 PRD §2 背景 + §3.1 量化目标 + §3.2 功能对标/验收证据 综合提炼的 2-4 句（可参考 §5 用户故事完整描述中的动机和价值部分）}

{验证报告：有已验证假设 → 追加一行 "验证依据：{已验证假设摘要}"}

## What Changes（→ proposal.md What Changes + Capabilities）

### 本次变更摘要
- {ADDED} 个新增用例，{MODIFIED} 个修改用例，{REMOVED} 个移除用例
{有上一版本 → "基于 {上一版本号} 迭代"}

### In-Scope（本次变化的功能域）
{仅列出有变更的用例，综合为功能域，标注变化类型和优先级（P0/P1/P2）}

{原型：有页面清单 → 追加 "对应页面：{页面清单摘要}"，辅助确认能力粒度}

### Out-of-Scope（不变 + 排除）
{PRD §3.2 不可为清单 + 验证报告已排除假设 + brainstorming 确认排除项 + 上一版本已有且本次不修改的用例}
{若无则填：无}

## Impact（→ proposal.md Impact）

{有 brainstorming：Dev 判断的影响面}
{无 brainstorming：[未经 brainstorming，无法确定完整影响面。以下外部依赖信息来自 PRD：{PRD §5 扩展流程·外部依赖中提及的服务}。建议在开发前与相关方对齐。]}

> 技术方案（→ design.md，自由格式）：详见 pre_design.md
```

#### pre_specs.md 模板

```markdown
# {功能名称} — 需求规格素材（增量变更）

> 供 OpenSpec 生成 specs/ 各文件
> 版本：{版本号} | PRD 文档修订：E{编号}
> 对比版本：{有上一版本则填；无则填"全新项目，全部为 ADDED"}

---

## 本次变更概览

| 变化类型 | 数量 | 用例列表 |
|:---|---|:---|
| ADDED | {N} | {用例编号列表} |
| MODIFIED | {N} | {用例编号列表} |
| REMOVED | {N} | {用例编号列表} |
| RENAMED | {N} | {旧 → 新} |

---

## 术语表

{PRD §4.1 原文} {若无则填：无。}

注：术语表包含不变术语，不做增量。

## 全局规则与约定

{PRD §4.2 共同规则原文} {若无则填：无。}

注：全局规则包含不变规则，不做增量。

{PRD §4.3 全局复用约定原文} {若无则填：无。}

注：全局复用约定为跨功能统一做法，不占规则编号；包含不变约定，不做增量。

---

## 变更的 Capability 需求

列出本次发生变化的 Capability，未变化的 Capability 不输出。

### ADDED：{Capability 名}

新增的完整需求。

#### Requirement：{用例标题}
**变化类型：ADDED**

##### Scenario：{主流程描述}
- GIVEN {前置条件}
- WHEN {触发动作}
- THEN {预期结果}

##### Scenario：{扩展流程描述}
- GIVEN {前置条件}
- WHEN {触发动作}
- THEN {预期结果}

**用例规则：** {PRD §5 用例规则原文}
**权限控制：** {PRD §5 权限控制原文}
**验收标准：** {PRD §5 验收标准原文}

{流程图步骤参考：{有则列出}}

---

### MODIFIED：{Capability 名}

仅输出变化部分，未变化的部分标注"同上一版本"。

#### Requirement：{用例标题}
**变化类型：MODIFIED**

##### Scenario：{主流程描述} {有变化则写出；无变化则标注"同上一版本"}
- {变化的步骤}

##### Scenario：{扩展流程描述} {有变化则写出；无变化则标注"同上一版本"}
- {变化的步骤}

**用例规则：** {有变化则写出；无则标注"同上一版本"}
**权限控制：** {有变化则写出；无则标注"同上一版本"}
**验收标准：** {有变化则写出；无则标注"同上一版本"}

{流程图参考：如有新增流程步骤则列出}

---

### REMOVED

#### ~~Requirement：{已移除的用例标题}~~
**变化类型：REMOVED**
**移除原因：** {旧版有此用例，新版 PRD §1 修订简介或综合推断}
**迁移方案：** {如适用；不适用则填"无"}

---

### RENAMED

#### Requirement：{新名称}
**变化类型：RENAMED（原名：{旧名称}）**
内容无变化，仅命名/编号调整。

---

## 数据埋点（可选）

{PRD §6 原文，仅输出新增或修改的埋点。不变的不输出。}
```

#### pre_design.md 模板

```markdown
# {功能名称} — 技术设计素材

> 供 OpenSpec 生成 design.md
> 版本：{版本号} | PRD 文档修订：E{编号}{原型：有页面清单 → 追加换行 "> 原型页面清单参考：{页面清单摘要}"}{验证报告：有已验证假设 → 追加换行 "> 验证依据：{已验证假设摘要}"}

## Architecture（→ design.md Architecture）

{有 brainstorming：决策 + 理由}
{无 brainstorming：[未经 brainstorming，无架构方案。]}
{原型：有交互流程 → "原型交互流程参考：{主要交互路径}"，辅助验证架构分层}

## Data Model（→ design.md Data Model）

{有 brainstorming：表结构 + 缓存 + 索引 + 理由}
{无 brainstorming：[未经 brainstorming，无数据模型。]}

## Dependencies（→ design.md Dependencies）

{有 brainstorming：选型 + 定价 + 理由}
{无 brainstorming：[未经 brainstorming，无第三方选型。]}
{参考：PRD §5 扩展流程·外部依赖}
{验证报告：有已验证假设涉及第三方 → "[已验证] {已验证假设摘要}"}

## Error Handling（→ design.md Error Handling）

{有 brainstorming：降级 + 兜底 + 超时}
{无 brainstorming：[未经 brainstorming，无异常策略。]}
{参考：PRD §5 扩展流程}
{流程图：有异常路径 → "流程图异常路径参考：{摘要}"}
{验证报告：有已验证假设涉及异常 → "[已验证] {已验证假设摘要}"}

## Performance（→ design.md Performance）

{有 brainstorming：目标值 + 实现方式 + 行业基准}
{无 brainstorming：[未经 brainstorming，以下数据来自 PRD §7，未经技术评审：]}
{PRD §7 性能维度原文，有则列出，无则填无}
{验证报告：有已验证假设涉及性能 → "[已验证] {已验证假设摘要}"}

## Security（→ design.md Security）

{有 brainstorming：加密 + 传输 + 审计 + 理由}
{无 brainstorming：[未经 brainstorming，以下数据来自 PRD §7，未经技术评审：]}
{PRD §7 安全维度原文，有则列出，无则填无}
{验证报告：有已验证假设涉及安全 → "[已验证] {已验证假设摘要}"}

## Frontend Implementation（→ design.md 前端实现规约）

{有 brainstorming：前端代码组织约定——① 组件/Hook/类型按业务归属放置（不放全局共享层）② 共享组件有缺陷改源头，禁止在调用侧打补丁 ③ 数据单一来源（同对象不复制、不缓存副本，派生数据只读）④ 新实现接管后删除旧代码}
{无 brainstorming：[未经 brainstorming，无前端实现规约。]}
{原型：有页面清单 → "原型页面清单已列于文件头，页面结构即前端实现参考"}

---

## 待定决策（仅 brainstorming 模式）

{有 brainstorming 且存在待定项：列出标记为 [待定] 的决策项清单}
{有 brainstorming 但无待定项：无}
{无 brainstorming：不适用}
```

#### 填实示例

以下是一个 brainstorming 模式下、基于 V1.0.0 → V1.1.0 变更的 pre_proposal.md 输出示例：

```markdown
# 地址智能联想

> 版本：V1.1.0 | PRD 文档修订：E2
> 对比上一版本：V1.0.0
> 生成时间：2026-06-09

## Why（→ proposal.md Why）

用户下单时需要手动输入完整地址，导致输入时间长、出错率高。近 3 个月地址页流失率达 35%。需要减少用户输入量，提升下单转化率。
验证依据：验证报告确认用户平均地址输入耗时 45 秒，高于行业均值 3 倍。

## What Changes（→ proposal.md What Changes + Capabilities）

### 本次变更摘要
- 2 个新增用例（地址智能联想、地址格式校验），1 个修改用例（常用地址上限从 10 改为 20），无移除
- 基于 V1.0.0 迭代，原有用户登录/登出功能本次不变

### In-Scope（本次变化的功能域）
- 地址智能联想（ADDED，P0，UC-01）：用户输入时弹出候选地址列表并自动填充
- 地址格式校验（ADDED，P0，UC-02）：提交时自动校验地址格式
- 常用地址管理（MODIFIED，P1，UC-03）：常用地址上限从 10 条提升至 20 条
对应页面：订单页地址输入区、我的地址管理页

### Out-of-Scope（不变 + 排除）
- 用户登录/登出（V1.0.0 已有，本次不变）
- 地址 OCR 识别（PRD 明确排除）

## Impact（→ proposal.md Impact）

- 新增 address_cache 表，需 DBA 审核
- 高德地图 API 调用需走网络代理，需运维配合开通
- 前端新增联想组件，涉及下单页地址模块重构

> 技术方案（→ design.md，自由格式）：详见 pre_design.md
> 架构：后端代理模式；第三方：高德地图 API；数据：address_cache 表 TTL 24h；异常：超时降级为手动输入；性能：≤300ms；安全：AES-256 存储
```
