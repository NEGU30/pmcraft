export const meta = {
  name: 'coach-demo',
  description: 'Generate a complete coach walkthrough: framework choice → dual-role/Q&A/extension → methods → self-critique → selfcheck. Three modes: blank (AI own framework, zero PM context), contrast (same questions, forking chains), continuation (learn PM framework, push deeper).',
  phases: [
    { title: 'Framework', detail: 'Choose analytical framework based on mode and topic' },
    { title: 'Walkthrough', detail: 'Generate the main walkthrough body per mode branch' },
    { title: 'Methods', detail: 'Extract 2-4 reusable analysis methods from the walkthrough' },
    { title: 'Critique', detail: 'Self-critique: 3 questions with honest answers' },
    { title: 'SelfCheck', detail: 'Run full five-dimension selfcheck before returning' },
  ],
}

// ── Input ──
// args.topic: string — the sparring topic title
// args.mode: "blank" | "contrast" | "continuation"
// args.sparringContext: object (optional by mode)
//   .pmAnswers: string[] — PM's key answers during sparring (for contrast/continuation)
//   .coachQuestions: string[] — corresponding coach questions (for contrast/continuation)
//   .pmStuckPoints: string[] — where PM paused or got stuck (for continuation)
//   .pillarCoverage: string — which pillars were covered and key turning points

// ── Input validation: guard against undefined args ──
const sc = args.sparringContext || {}

phase('Framework')

// ── Phase 1: Framework Decision ──
// All three modes start here. Context varies by mode.

let frameworkContext = ''
if (args.mode === 'blank') {
  frameworkContext = `话题：${args.topic}\n\n仅基于话题本身做框架决策。不要参考任何 sparring 对话——你没有 sparring 上下文。`
} else if (args.mode === 'contrast') {
  frameworkContext = `话题：${args.topic}

PM 在 sparring 中的关键回答：
${sc.pmAnswers ? sc.pmAnswers.map((a, i) => `- 回答${i + 1}: ${a}`).join('\n') : '(无)'}

你需要识别 PM 使用的框架/切入角度，然后自己选一个不同的框架。两个框架将并排对比。`
} else if (args.mode === 'continuation') {
  frameworkContext = `话题：${args.topic}

PM 在 sparring 中的关键回答：
${sc.pmAnswers ? sc.pmAnswers.map((a, i) => `- 回答${i + 1}: ${a}`).join('\n') : '(无)'}

PM 卡壳/停住的节点：
${sc.pmStuckPoints ? sc.pmStuckPoints.map((p, i) => `- 节点${i + 1}: ${p}`).join('\n') : '(无)'}

你需要理解 PM 自己的框架——不要换框架，用 PM 的框架继续推到深处。`
}

const frameworkResult = await agent(
  `你是 pmcraft-coach 教练的框架决策器。根据话题和模式选择分析框架。

## 可用框架库

| 框架 | 适用场景 | 核心步骤 |
|:---|:---|:---|
| 三层信号链 | 多方博弈、信号不对称、表面混乱实际每方都在发信号 | ①识别每一方作为信号发送者 ②拆解行动信号/语言信号/沉默信号 ③串联信号链找出断裂点 |
| JTBD 深度版 | 用户行为分析、需求本质挖掘 | ①定义待办任务 ②列出当前替代方案 ③识别雇佣/解雇时刻 ④挖掘情感障碍 |
| 约束剥层 | 第一性原理推演、挑战行业惯例 | ①列出所有当前约束 ②区分物理约束 vs 惯例约束 vs 心理约束 ③从物理约束重建方案 |
| 反事实推演 | 检验鲁棒性、"如果关键变量反转" | ①识别最关键假设 ②反转该假设 ③推演新结论链 ④对比原结论的脆弱点 |
| 五力改编版 | 竞争/平台话题、多方力量博弈 | ①供应商力量 ②买方力量 ③替代方案威胁 ④新进入者威胁 ⑤现有竞争强度——从产品化视角重新定义五力 |
| S曲线定位 | 技术/产品生命周期话题 | ①定位当前在 S 曲线位置 ②识别下一个拐点信号 ③推演拐点后的竞争格局变化 |

## 任务

${frameworkContext}

返回 JSON：
{
  "frameworkName": "选定的框架名",
  "whyThis": "2-3句——为什么这个框架匹配这个话题的特征",
  "notSelected": "一个没选的框架名及不选的原因",
  "pmFramework": ${args.mode === 'contrast' ? '{"angle": "PM的切入角度（从回答中提取）", "keyVariables": ["变量1"], "reasoningDirection": "PM往哪推"}' : 'null'},
  "pmFrameworkUnderstood": ${args.mode === 'continuation' ? '"2-3句——如果我没有理解错，PM的框架核心是……"' : 'null'}
}`,
  { label: '框架决策', schema: { type: 'object', properties: { frameworkName: { type: 'string' }, whyThis: { type: 'string' }, notSelected: { type: 'string' }, pmFramework: { type: 'object', properties: { angle: { type: 'string' }, keyVariables: { type: 'array', items: { type: 'string' } }, reasoningDirection: { type: 'string' } }, required: ['angle', 'keyVariables', 'reasoningDirection'] }, pmFrameworkUnderstood: { type: 'string' } }, required: ['frameworkName', 'whyThis', 'notSelected'] } }
)

if (!frameworkResult) return { phase: 'framework', error: 'Agent returned null' }

// ── Phase 2: Walkthrough Generation ──
phase('Walkthrough')

let walkthroughBody = ''

if (args.mode === 'blank') {
  // ⚠️ ZERO PM context — agent only sees topic + framework
  const blankResult = await agent(
    `你是 pmcraft-coach 教练。用一个完全独立的全新视角分析以下话题。

⚠️ 你没有 sparring 对话的任何上下文——你是从零开始分析。不要猜测 PM 说了什么，不要引用 sparring。

话题：${args.topic}
选定框架：${frameworkResult.frameworkName}（${frameworkResult.whyThis}）

## 任务：生成双角色推演对话

模拟两个角色交替推演：
- 🔵 **分析师**：用选定框架给出结构化分析
- 🔴 **追问者**：对分析师提出挑战——质疑假设、追问证据、找反例、测试边界

要求：
- 最少 2 轮，最多 5 轮来回
- 追问者必须提出真正的、会让分析师停顿修正的挑战，不是走过场
- 分析师必须有一次明显的修正（不能全部对答如流）
- 最后一轮收敛为"🔵 最终判断"
- 整段输出为对话体，每个角色一行，自然节奏

返回 JSON：
{
  "dialogue": "完整的双角色推演对话文本（含 emoji 标注：🔵 🔴），每个角色一段，自然换行。格式如：\n🔵 分析师\n{内容}\n\n🔴 追问者\n{内容}",
  "finalJudgment": "推演后的核心结论（1-2句）",
  "stillUncertain": "推演后仍然不确定的点（1句）"
}`,
    { label: '白纸推演', schema: { type: 'object', properties: { dialogue: { type: 'string' }, finalJudgment: { type: 'string' }, stillUncertain: { type: 'string' } }, required: ['dialogue', 'finalJudgment', 'stillUncertain'] } }
  )
  if (!blankResult) return { phase: 'walkthrough', error: 'Blank mode agent returned null' }
  walkthroughBody = {
    mode: 'blank',
    dialogue: blankResult.dialogue,
    finalJudgment: blankResult.finalJudgment,
    stillUncertain: blankResult.stillUncertain,
  }

} else if (args.mode === 'contrast') {
  // ⚠️ Forking chains: AI chain agent only sees question text, NOT PM answers
  const questionsText = sc.coachQuestions
    ? sc.coachQuestions.map((q, i) => `问题${i + 1}: ${q}`).join('\n\n')
    : '(无追问记录)'

  const aiChainResult = await agent(
    `你是 pmcraft-coach 教练。回答以下追问——就像你是一个第一次看到这些问题的独立分析者。

⚠️ 你只能看到问题文本，看不到 PM 的答案。不要猜测 PM 说了什么。

话题：${args.topic}
框架：${frameworkResult.frameworkName}

## 追问列表（来自 sparring）

${questionsText}

## 任务

对每个追问：
1. 给出你自己的答案（AI 链的第一答）
2. 基于你的答案，生成本应出现的下一个追问（AI 链的追问方向）
3. 再给第二答（回应追问——允许修正）

返回 JSON：
{
  "chains": [
    {
      "questionIndex": 1,
      "questionText": "原问题文本",
      "firstAnswer": "AI 的第一答",
      "followUpQuestion": "基于 AI 答案的追问",
      "secondAnswer": "AI 的回应（可修正第一答）",
      "furtherFollowUp": "如有——继续追问",
      "furtherAnswer": "如有——继续回答"
    }
  ],
  "forkAnalysis": "分叉总结：两条链从哪里开始分的？为什么在那个点分了？"
}`,
    { label: 'AI链生成（无PM上下文）', schema: { type: 'object', properties: { chains: { type: 'array', items: { type: 'object', properties: { questionIndex: { type: 'number' }, questionText: { type: 'string' }, firstAnswer: { type: 'string' }, followUpQuestion: { type: 'string' }, secondAnswer: { type: 'string' }, furtherFollowUp: { type: 'string' }, furtherAnswer: { type: 'string' } }, required: ['questionIndex', 'questionText', 'firstAnswer', 'followUpQuestion', 'secondAnswer'] } }, forkAnalysis: { type: 'string' } }, required: ['chains', 'forkAnalysis'] } }
  )

  if (!aiChainResult) return { phase: 'walkthrough', error: 'Contrast mode AI chain agent returned null' }

  // Assemble PM chain + AI chain side by side
  const pmChainText = sc.pmAnswers
    ? sc.pmAnswers.map((a, i) => `PM 答 ${i + 1}: ${a}`).join('\n')
    : '(无)'

  const assemblerResult = await agent(
    `将 PM 链和 AI 链组装成同题分叉表。

PM 回答：
${pmChainText}

AI 链数据：
${JSON.stringify(aiChainResult.chains)}

框架信息：
- PM 框架：${frameworkResult.pmFramework ? frameworkResult.pmFramework.angle : '未识别'}
- AI 框架：${frameworkResult.frameworkName}

分叉分析草稿：${aiChainResult.forkAnalysis}

## 任务

为每个追问生成一张分叉表（直接可展示的 markdown）。每个追问：

| | PM 链 | AI 链 |
|:---|:---|:---|
| **追问 N** | {原问题} |
| 第一答 | {PM answer} | {AI firstAnswer} |
| → 追问 | {PM follow-up from sparring} | {AI followUpQuestion} |
| 第二答 | {PM answer} | {AI secondAnswer} |
| … | … | … |

最后附分叉总结表。

返回 JSON：
{
  "forkTables": "所有追问的分叉表 markdown 文本（逐个追问）",
  "forkSummary": "分叉总结的 markdown 表格文本",
  "earliestForkPoint": "最早分叉点是第几个追问",
  "forkReason": "为什么在那个点分了——一句"
}`,
    { label: '组装分叉表', schema: { type: 'object', properties: { forkTables: { type: 'string' }, forkSummary: { type: 'string' }, earliestForkPoint: { type: 'string' }, forkReason: { type: 'string' } }, required: ['forkTables', 'forkSummary', 'earliestForkPoint', 'forkReason'] } }
  )

  if (!assemblerResult) return { phase: 'walkthrough', error: 'Contrast assembler agent returned null' }
  walkthroughBody = {
    mode: 'contrast',
    forkTables: assemblerResult.forkTables,
    forkSummary: assemblerResult.forkSummary,
    earliestForkPoint: assemblerResult.earliestForkPoint,
    forkReason: assemblerResult.forkReason,
  }

} else if (args.mode === 'continuation') {
  // Full sparring context — this mode needs it
  const stuckPointsText = sc.pmStuckPoints
    ? sc.pmStuckPoints.map((p, i) => `- 节点${i + 1}: ${p}`).join('\n')
    : '(无)'

  const pmAnswersText = sc.pmAnswers
    ? sc.pmAnswers.map((a, i) => `- 回答${i + 1}: ${a}`).join('\n')
    : '(无)'

  const continuationResult = await agent(
    `你是 pmcraft-coach 教练。学习 PM 的框架，用 PM 自己的框架继续推到 PM 没推到的地方。

话题：${args.topic}

PM 的框架：${frameworkResult.pmFrameworkUnderstood || '从回答中已理解'}

PM 在 sparring 中的回答：
${pmAnswersText}

PM 卡壳/停住的节点：
${stuckPointsText}

## 任务

1. 从 PM 停住的节点中选取 3-4 个最值得继续推的
2. 对每个节点——推测 PM 为什么可能停了，然后用 PM 自己的框架继续往下推一步
3. 每个节点输出一段叙事：
   - 📍 节点 N：{停住的位置——一句话}
   - PM 原话引用
   - 推测停的原因
   - 按 PM 框架继续推——{追问} → {回答} → {新结论}
   - 收束："这没有推翻你原来的判断——只是多走了一步。"

返回 JSON：
{
  "nodes": [
    {
      "nodeTitle": "节点标题（一句话）",
      "pmQuote": "PM 在该节点的原话",
      "stuckReason": "推测 PM 为什么停在这里",
      "continuation": "按 PM 框架继续推的叙事文本（追问→回答→新结论）"
    }
  ],
  "summary": "续推总结：PM 的框架在哪些节点可以继续推？推到的新位置是什么？"
}`,
    { label: '延续推演', schema: { type: 'object', properties: { nodes: { type: 'array', items: { type: 'object', properties: { nodeTitle: { type: 'string' }, pmQuote: { type: 'string' }, stuckReason: { type: 'string' }, continuation: { type: 'string' } }, required: ['nodeTitle', 'pmQuote', 'stuckReason', 'continuation'] } }, summary: { type: 'string' } }, required: ['nodes', 'summary'] } }
  )

  if (!continuationResult) return { phase: 'walkthrough', error: 'Continuation mode agent returned null' }
  walkthroughBody = {
    mode: 'continuation',
    nodes: continuationResult.nodes,
    summary: continuationResult.summary,
  }
}

// ── Phase 3: Method Extraction ──
phase('Methods')

let methodsContext = `推演模式：${args.mode}\n\n`
if (args.mode === 'blank') {
  methodsContext += `双角色对话内容：\n${JSON.stringify(walkthroughBody.dialogue)}\n\n最终判断：${walkthroughBody.finalJudgment}`
} else if (args.mode === 'contrast') {
  methodsContext += `分叉表内容：\n${walkthroughBody.forkTables}\n\n分叉总结：${walkthroughBody.forkSummary}\n最早分叉点：${walkthroughBody.earliestForkPoint}`
} else if (args.mode === 'continuation') {
  methodsContext += `续推节点：\n${JSON.stringify(walkthroughBody.nodes)}\n\n续推总结：${walkthroughBody.summary}`
}

const methodsResult = await agent(
  `从推演内容中提取 2-4 个具体的、可复用的分析方法。

${methodsContext}

${args.mode === 'contrast' ? '对照模式：每个方法标注"来自哪个分叉"——和 sparring 中哪个追问的分叉暴露了这个方法。' : ''}
${args.mode === 'continuation' ? '延续模式：每个方法标注"和 PM 已有思路的关联"——PM 已经在用这个方法了，只是在某个节点停了。' : ''}

## 要求
- 每个方法必须包含：方法名、什么时候用、怎么用（3步）、失效条件（什么时候不灵）
- 方法名不要用通用术语（"对比法""排除法"）——用本话题的具体变形
- 失效条件必须具体——不能是"不适用时失效"，必须是具体的场景特征
- 步骤是操作性的——PM 下次拿到就能用

返回 JSON：
{
  "methods": [
    {
      "name": "方法名",
      "whenToUse": "触发场景",
      "steps": ["步骤1", "步骤2", "步骤3"],
      "failureCondition": "失效条件",
      ${args.mode === 'contrast' ? '"fromFork": "来自追问N的分叉",' : ''}
      ${args.mode === 'continuation' ? '"pmConnection": "和PM思路的关联——一句话",' : ''}
    }
  ]
}`,
  { label: '方法论提取', schema: { type: 'object', properties: { methods: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, whenToUse: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } }, failureCondition: { type: 'string' }, fromFork: { type: 'string' }, pmConnection: { type: 'string' } }, required: ['name', 'whenToUse', 'steps', 'failureCondition'] } } }, required: ['methods'] } }
)

if (!methodsResult) return { phase: 'methods', error: 'Agent returned null' }

// ── Phase 4: Self-Critique ──
phase('Critique')

const critiqueContext = `
推演模式：${args.mode}
推演内容：${JSON.stringify(walkthroughBody).substring(0, 3000)}
${args.mode === 'contrast' || args.mode === 'continuation' ? 'PM sparring 上下文：' + (sc.pmAnswers ? sc.pmAnswers.join(' | ') : '(无)') : ''}`

const critiqueResult = await agent(
  `对教练推演进行自我批判。提出 3 个具体的追问，并诚实回答。

${critiqueContext}

## 要求
- 质疑必须具体到推演中的某个推理节点——不能是"可能不全面"这种空话
- 回答必须诚实——承认局限比假装完美更有价值
- 追问 1：最薄弱的推理节点
- 追问 2：另一个值得质疑的点
- 追问 3 按模式区分：
  - 白纸模式：这个推演最薄弱的环节在哪？
  - 对照模式：PM 在 sparring 中推到的、但教练推演完全没覆盖的视角是什么？
  - 延续模式：PM 的框架在什么条件下会失效？

返回 JSON：
{
  "questions": [
    {"question": "追问1", "answer": "回答1"},
    {"question": "追问2", "answer": "回答2"},
    {"question": "追问3（模式特定）", "answer": "回答3"}
  ]
}`,
  { label: '自我批判', schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] } } }, required: ['questions'] } }
)

if (!critiqueResult) return { phase: 'critique', error: 'Agent returned null' }

// ── Phase 5: SelfCheck ──
phase('SelfCheck')

// Assemble full draft
const fullDraft = `
# 🎬 教练推演：${args.topic}

## 一、框架
${JSON.stringify(frameworkResult)}

## 二、推演
${JSON.stringify(walkthroughBody)}

## 三、方法论
${JSON.stringify(methodsResult)}

## 四、自我批判
${JSON.stringify(critiqueResult)}
`

const selfcheckResult = await agent(
  `你是 pmcraft-coach 教练的质量门禁。对教练推演草稿执行五维自检。

## 五维标准

① 事实声称→来源：逐句扫描——框架引用、行业数据、案例细节是否有据？无来源→🔴硬伤
② 逻辑一致性：${args.mode === 'contrast' || args.mode === 'continuation' ? '分析师/追问者立场不与 sparring 中教练立场矛盾' : '双角色追问中分析师修正是否真正回应了追问'}
③ 可能错在哪：方法论"失效条件"是否具体？（"不适用时失效"→🟡软伤）
④ 措辞过滤：类比完整性、全称量词、信心标定
⑤ 格式合规：${args.mode === 'blank' ? '对话体格式、结局标注' : args.mode === 'contrast' ? '分叉表格式、追问节点≥4' : '叙事格式、节点≥3'}

## 草稿

${fullDraft}

返回 JSON：
{
  "findings": [
    {"dimension": "①|②|③|④|⑤", "summary": "一句", "detail": "具体哪有问题", "severity": "🔴|🟡|⚪", "suggestion": "修正建议"}
  ],
  "hasHardIssue": true/false,
  "hardIssuesCount": 0,
  "overallVerdict": "PASS|FIX_THEN_OUTPUT|HARD_STOP"
}`,
  { label: '五维自检', schema: { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { dimension: { type: 'string' }, summary: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string' }, suggestion: { type: 'string' } }, required: ['dimension', 'summary', 'detail', 'severity'] } }, hasHardIssue: { type: 'boolean' }, hardIssuesCount: { type: 'number' }, overallVerdict: { type: 'string' } }, required: ['findings', 'hasHardIssue', 'hardIssuesCount', 'overallVerdict'] } }
)

// ── Return assembled result ──
return {
  mode: args.mode,
  framework: frameworkResult,
  walkthrough: walkthroughBody,
  methods: methodsResult.methods,
  critique: critiqueResult.questions,
  selfcheck: selfcheckResult,
  passed: selfcheckResult ? !selfcheckResult.hasHardIssue : false,
}
