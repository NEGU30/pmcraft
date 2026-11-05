# 智能体调度关系（pmcraft 参考）

> 从 CLAUDE.md 拆出，供路由按需读取。插件根解析规则同 CLAUDE.md 路由表。

## 智能体调度关系

```
用户 → CLAUDE.md
         │
         ├── sparring/思维训练 → Skill(pmcraft-coach:thinking-coach)
         │      内部调用 6 个 workflow
         │
         ├── 讲讲/解释概念 → Skill(pmcraft-coach:concept-coach)
         │      白话类比讲解，可对比/学习路径/引导/检验/压缩/做成网页（可视化）
         │
         ├── 拷问方案/拷问想法/grill me → Skill(pmcraft-coach:grilling-coach)
         │      设计树 + 前沿轮询，每题附推荐答案，收敛输出决策清单
         │
         ├── 写提示词/设计prompt → Skill(pmcraft-prompt:write-prompt)
         │      以「提示词工程师」人设执行，6 阶段流程（含技巧决策子阶段）
         │
         ├── 写需求/出PRD/竞品/问卷... → Skill(pmcraft-req:write-brief) 等
         │      以「需求分析师」人设执行
         │      审查类任务 spawn doc-reviewer 子智能体
         │
         ├── 做原型/改页面/设风格... → Skill(pmcraft-proto:initialize-structure) 等
         │      以「交互设计师」人设执行
         │      流水线：见下方「pmcraft-proto 流水线」节（唯一权威定义）
         │      ├── singleFile/直接改这个HTML → Skill(pmcraft-proto:extend-html)
         │      ├── 项目代码/读项目代码 → Skill(pmcraft-proto:extract-design) --project
         │
         ├── 加标注/更新标注 → Skill(pmcraft-proto:annotate-prototype)
         │      以「交互设计师」人设执行；build（首次/增量）/ refresh（PRD 定稿补溯源）
         │      save-doc 保存 PRD 后自动衔接 refresh（增量，仅变化页）；build-prototype edit 后自动衔接 refresh（增量，仅变化页）；extend-html 收尾自动衔接（首轮补全数据文件后 build 全量 / 后续轮 refresh 增量，Phase 3 末质检前 + Phase 5 存档前）
         │
         ├── 加演示入口/场景演示 → Skill(pmcraft-proto:build-prototype) edit 或 Skill(pmcraft-proto:extend-html)
         │      以「交互设计师」人设执行；状态演示面板（右下角「演示」开关），数据从标注 state 项派生
         │      （extend-html 无标注场景从 page-inventory 状态字段派生）；build-prototype 第八步B 自动生成；
         │      annotate refresh 后自动重派生 demo 数据；check-quality 维度 8 检查 5 项
         ├── 审查 PRD/简报/一致性 → spawn doc-reviewer 子智能体
         │      独立上下文，读文件→分析→出报告
         │
         ├── 关闭服务/停止服务 → 运行 stop-services.js 脚本关闭所有服务
         │      同时检查 prototype/*/mock/ 和 survey/web/mock/ 两个位置
         │      脚本不可用时回退手动：读 .server.pid → taskkill 终止进程
         │
         ├── 开启/关闭Guard-Chat → 运行 guard-chat.js 切换守卫开关
         │      教练域/需求域守卫，其余域不生效
         │
         ├── 跑测试/验收测试/全流程测试... → Skill(pmcraft-test:setup-tests) / run-tests 等
         │      以「测试工程师」人设执行（加载 test-engineer agent，主对话交互，不 spawn）
         │      流水线：setup-tests → run-tests → collect-manual（可选） → generate-report → walkthrough（可选，体验走查） → review-tests（可选）
         │
         ├── 记下这条/查看 lesson/删掉 lesson/清空 lesson → Skill(pmcraft-proto:record-lessons)
         │      操作原型设计经验规则（增/查/删/清空）
         │
         ├── 启动pmcraft/初始化项目 → Skill(pmcraft-infra:init-project)
         │      创建版本目录 + pmcraft/ 骨架 + 项目 CLAUDE.md
         │
         ├── 升级pmcraft/更新pmcraft → Skill(pmcraft-infra:init-project) --upgrade
         │      比对模板差异 → 确认 → 备份到 pmcraft/backup/ → 覆盖 CLAUDE.md + 9 agents
         │
         └── 审查原型/交互质量 → spawn design-reviewer 子智能体
                独立上下文，读原型→按 pmcraft-proto:review-ux 技能定义执行（六大维度诊断，非构建期 5 维评审）
                审查完成后，将完整报告写入 prototype/E{N}/{功能名}_{版本号}_UX审查报告_E{编号}.md
```

审查类技能不在主对话执行——review-brief / review-prd / review-journey / check-consistency 均 spawn doc-reviewer；review-ux 由 spawn design-reviewer 执行（check-quality 由 build-prototype 内部直接调用，不经 design-reviewer）。

> **去重规则**：当流水线自动触发审查步骤后，用户再用关键词手动触发同类型审查时，若审查结果仍在返回途中或刚返回，应告知用户"审查正在进行/刚完成"而非重复 spawn。

---

