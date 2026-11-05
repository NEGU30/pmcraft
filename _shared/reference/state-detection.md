# 状态检测（pmcraft 参考）

> 从 CLAUDE.md 拆出，供路由按需读取。插件根解析规则同 CLAUDE.md 路由表。

## 状态检测

> **检测规则**：自上而下逐条匹配，命中即停。按"完成度从高到低"排列，优先检测更完整的状态。
> 本表探测结论同时作为「流程清单（进度与待办）」节宏观进度的输入源，推断规则见该节，两处同改同审，禁止另行维护探测副本。

- **Guard-Chat 门禁（独立检测）**：当意图将路由到教练域（thinking-coach / concept-coach / grilling-coach）或需求域（req 24 技能）时，先运行 `node "{插件根}/_shared/scripts/guard-chat.js" status`（`{插件根}` 解析同「关闭服务」行）。按 `data.prompted`：
  - `false` → 按话术库 **GUARD-ASK**（`enabled=false`）或 **GUARD-ON**（`enabled=true`）提示一次，然后运行 `guard-chat.js mark-prompted`；用户**紧随询问回复肯定意图**（如「开启」），或**任意轮次说「开启Guard-Chat」**（命中路由表）时，运行 `guard-chat.js enable`——两条路径都收敛到 enable（裸词只在紧邻询问的上下文内被理解为肯定答复，隔轮回复靠路由表全短语兜底）
  - `true` → 跳过，不重复提示
  - 脚本不可用（node 缺失/报错/JSON 解析失败）→ 静默跳过
  - 此规则为"额外检查"而非"路由决策"——检查完继续匹配其余条目（同交叉检测模式）
- `{cwd}/.checkpoint` 或 `{version_dir}/.checkpoint` 存在且 phase ≠ "done" → write-brief 对话进行中，拒绝跨域路由切换；提示"简报澄清进行中（已追问 {phase} 阶段），继续澄清或中止？"
- `{cwd}/.checkpoint` 或 `{version_dir}/.checkpoint` 存在且 phase = "done" → 简报已完成（{brief 路径}），视为完成不拦截，继续匹配（不删文件，留作衔接记录）
- `{version_dir}/prototype/working/spec.md` 存在 且 `{version_dir}/prototype/main/` 和 `{version_dir}/prototype/E1/` 均不存在 → proto 流水线进行中但无产出快照。**先继续向下匹配后续 proto 域条目确定当前阶段**，再触发跨域守卫：提示当前进度（"原型流水线进行中（当前阶段：{阶段}），确认切换到{目标域}？"），让 PM 确认后再切换。**注意**：此条是跨域守卫而非阶段检测——{阶段}必须由后续条目确定，不可在此停表
- `{version_dir}/prototype/E1/` 存在 且 `{version_dir}/brief/` 下有简报 且 `{version_dir}/prd/` 为空 → 原型已产出但 PRD 缺失，下一步：新开会话 → generate-prd（proto→req 回切，默认必切）→ NEXT-PRD-BACK（话术库）
- `{version_dir}/prototype/main/` 存在 → 有正式版本，下一步：deploy-prototype 或 save-version --main 更新 → NEXT-PROTO（话术库）
- `{version_dir}/prototype/E1/`, `E2/` … 存在 → 有快照，下一步：review-ux（针对最新 E{N}）或 save-version --main → NEXT-PROTO（话术库）
- `{version_dir}/prototype/working/.extend-html.json` 存在 → extend-html 模式进行中（存量 HTML 直改），下一步：继续改（说「改这个HTML」）或存档（说「保存版本」）→ NEXT-PIPE（话术库）
- `{version_dir}/prototype/working/pages/` 有文件 → build-prototype 完成，下一步：check-quality（流水线内部自动执行——build-prototype 内部直接调用，无独立触发关键词；检查通过后衔接存档）→ NEXT-PIPE（话术库，keyword 用「保存版本」）
- `{version_dir}/prototype/working/page-inventory.md` 存在 → 页面已规划，下一步：build-prototype → NEXT-PIPE（话术库）
- `{version_dir}/prototype/working/DESIGN.md` 存在 → 风格已设定，下一步：plan-pages → NEXT-PIPE（话术库）
- `{version_dir}/prototype/working/spec.md` 存在 且 `{version_dir}/prototype/working/DESIGN.md` 不存在 → write-spec 已完成，风格待设定，路由到 set-style → NEXT-PIPE（话术库）
- `{version_dir}/prototype/working/` 已存在 但 `{version_dir}/prototype/working/spec.md` 不存在（`.extend-html.json` 存在时排除，归 extend-html 模式行） → 已初始化但规格未生成，下一步：write-spec（说「读简报」）→ NEXT-PIPE（话术库）
- `{version_dir}/prototype/working/` 不存在 → 原型未开始，下一步：initialize-structure → NEXT-PIPE（话术库）
- `{version_dir}/prd/` 下有最新 PRD（E{N}）且 `{version_dir}/prototype/` 下有最新原型快照（E{M}）→ 交叉检测：
  - **独立检测**：此规则不参与"命中即停"链——无论前序哪条规则命中，只要有 PRD 和原型快照同时存在，都必须额外执行此交叉检测。
  - 比较 PRD 最新修订时间与原型最新快照（E{max} 或 main/）保存时间
  - PRD 比原型新（PRD 修订时间 > 原型保存时间）→ 提示："PRD 已更新至 E{N}，原型是否需要同步？建议先执行 check-consistency 定位差异清单（说「一致性检查」），再按差异类型决定：revise-prd → 原型同步评估，或 build-prototype 补原型。原型已有标注时可说「更新标注」补充 PRD 溯源"
  - 原型比 PRD 新（原型保存时间 > PRD 修订时间）→ 提示："原型已更新至 E{M}，PRD 是否需要同步？建议先执行 check-consistency 定位差异清单（说「一致性检查」），再按差异类型决定：revise-prd / append-prd 更新 PRD"
  - 此规则为"额外提示"而非"路由决策"，不影响下一步动作选择；出口为审查建议（check-consistency 技能），非 NEXT 族推进话术——故不挂 NEXT-{id}，保持"状态检测表每行挂 NEXT-{id} 引用"声明与"额外提示不挂 ID"例外并存
- `{version_dir}/prototype/working/pages/` 存在 且 其最新文件 mtime > `{version_dir}/prototype/main/`（无 main 时取 `E{max}/`）最新页面文件 mtime → working 新鲜度提示（独立检测）：
  - **独立检测**：此规则不参与"命中即停"链——无论前序哪条规则命中，只要 working 比快照新，都必须额外执行此提示（同交叉检测模式）。判定方式：Glob `working/pages/*` 与 `main/pages/*`（或 `E{max}/pages/*`）取各自最新 mtime 比较；working 不新或快照不存在 → 静默。
  - 提示："working 有未存档修改（自 {日期}，{working 最新文件}）。建议先保存版本存档（说「保存版本」）再做一致性检查/部署，确保基线一致。" → NEXT-WORKING（话术库）
  - 此规则为"额外提示"而非"路由决策"，不影响下一步动作选择；与推进链行（working 完成 → check-quality）并存——一个管推进、一个管存档前置，不冲突
- `{version_dir}/prototype/.last-check.json` 的 `review.pendingPages` 非空 → 待评审改动提示（独立检测）：
  - **独立检测**：此规则不参与"命中即停"链——无论前序哪条规则命中，只要有改动尚未评审，都必须额外执行此提示（同交叉检测模式）。基线缺失/损坏/无 `review` 块 → 视为无积压，静默
  - 提示："有 {N} 页改动尚未评审（自 {lastAt}，累计 {M} 轮，攒批中）。存档前会先自动批量评审，也可现在就说「审查原型」" → NEXT-REVIEW（话术库）
  - 此规则为"额外提示"而非"路由决策"，不影响下一步动作选择
- `{version_dir}/prd/` 下存在完整 PRD（最新 E{N}）且 prd/ 下无简版PRD 文件 → 简版提示（独立检测）：
  - **独立检测**：此规则不参与"命中即停"链——无论前序哪条规则命中，只要完整 PRD 存在且无简版PRD，都必须额外执行此提示（同交叉检测模式）。
  - 提示："完整 PRD 已产出（E{N}）。可生成简版PRD 给开发快速阅读（说「简版PRD」）" → NEXT-COMPACT（话术库）
- `{version_dir}/prd/` 下存在完整 PRD（最新 E{N}）且最新简版PRD（文件名 E 编号最大者）基于的完整版 E 编号 < E{N} → 简版过期提示（独立检测）：
  - **独立检测**：此规则不参与"命中即停"链——无论前序哪条规则命中，只要完整 PRD 存在且最新简版已过期，都必须额外执行此提示（同交叉检测模式）。
  - 提示："完整 PRD 已修订至 E{N}，现有简版PRD（E{M}）基于 E{源} 已过期。可选项：重新生成简版（说「简版PRD」）" → NEXT-COMPACT-STALE（话术库）
- `{version_dir}/prd/` 下存在完整 PRD（最新 E{N}）且 testcase/ 或 flowchart/ 或 sequence/ 下最新衍生文档基于的完整版 E 编号 < E{N} → 衍生文档过期提示（独立检测）：
  - **独立检测**：此规则不参与"命中即停"链——无论前序哪条规则命中，只要完整 PRD 存在且任一衍生文档已过期，都必须额外执行此提示（同简版过期提示模式）。判定方式：取 testcase/（三序列各取最新 + 拆分文件兜底组）、flowchart/、sequence/ 最新文件名（`*_测试用例_E*.md` / `*_测试用例_中_E*.md` / `*_测试用例_高_E*.md` / `*_流程图_E*.md` / `*_时序图_E*.md`），Read 前 15 行提取源 E，**两级回退**（同 save-doc 第五阶段步骤 6）：① 文件头引用行 `源 PRD：…_PRD_E{源}.md` ② 元信息表/文档内 PRD 文件名引用；均取不到则静默跳过该组（不误报）。**拆分文件兜底组**：另 Glob `testcase/*测试用例*E*.md` 减去三套标准序列已命中的差集，按去尾部 `_E{N}` 的文件名分组、各组取 E 最大为组内最新，同样检测其源 E（防非标准命名的分模块文件逃逸检测，如 `*_测试用例_{模块名}_高_E*.md`）。
  - 提示："完整 PRD 已修订至 E{N}，现有{文档类型}（E{M}）基于 E{源} 已过期。可选项：重新生成（说「{流程图/时序图/测试用例}」）" → NEXT-DERIVED-STALE（话术库）。拆分文件组 {文档类型} 为"测试用例拆分文件"，提示中列出文件名（≤3 份逐个列出，>3 份列首份+"等 N 份"）
- `{version_dir}/e2e/` 下任意时间戳目录含 `scripts/*.spec.ts` 且任一目录均无 `run_state.json` → 脚本已就绪但未执行，建议路由到 `Skill(pmcraft-test:run-tests)` → NEXT-TEST（话术库）
- `{version_dir}/e2e/` 下最新含 `run_state.json` 的目录中 `current` 非空 → 存在未完成的测试（已完成 {n}/{total}，停在 {current}），建议 `Skill(pmcraft-test:run-tests) --resume` 或说"重测"全量重跑 → NEXT-TEST（话术库）
- `{version_dir}/e2e/` 下最新含 `run_state.json` 的目录中 `current` 已空，且 `logs/checkpoint/` 下有 `.json` 日志，但 `report/` 下无报告 → 测试结果已就绪，建议路由到 `Skill(pmcraft-test:generate-report)` → NEXT-TEST（话术库）
- `{version_dir}/e2e/` 下最新含 `run_state.json` 的目录中 `report/final-report.html` 存在 且 `walkthrough/` 下无 `walkthrough-findings.json` → 报告已生成，可选体验走查（说「体验走查」）→ NEXT-WALKTHROUGH（话术库）
- `{version_dir}/e2e/` 下最新含 `run_state.json` 的目录中 `report/final-report.html` 存在 → 报告已有（{n} 条 TC，通过率 {rate}%），建议查看现有报告 / 重新生成 / 重测（说"重测"）→ NEXT-TEST（话术库）
- `{version_dir}/e2e/` 下无任何时间戳目录含 `scripts/*.spec.ts` → 尚无测试脚本，建议路由到 `Skill(pmcraft-test:setup-tests)` → NEXT-TEST（话术库）
- 无上述任何匹配 → 根据当前域（req 域按探索阶段 / proto 域按 initialize-structure）默认开始

---

