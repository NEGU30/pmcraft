export const meta = {
  name: 'question-selector',
  description: 'Generate 2-3 candidate follow-up questions from different angles, then select the one with the heaviest cognitive load.',
  phases: [
    { title: 'Generate', detail: 'Generate 2-3 candidates from distinct angles per pillar constraints' },
    { title: 'Select', detail: 'Compare candidates by cognitive load, depth lift, and angle differentiation' },
  ],
}

// ── Input ──
// args.triggerNode: "pillar-entry" | "stuck-restart" | "checkpoint-extra"
// args.pillar: "🔴" | "🟡" | "🟢"
// args.topic: string — brief topic summary
// args.pmLastResponse: string — PM's most recent answer
// args.conversationHistory: string[] — last 3-5 rounds (condensed)
// args.currentDepth: "L1" | "L2" | "L3" | "L4"
// args.mode: "newcomer" | "standard" | "combat"
// args.extraContext: object — node-specific context (see schema)

// ── Input validation: guard against undefined args ──
const topic = args.topic || '(话题未提供)'
const pmLastResponse = args.pmLastResponse || '(PM 未提供回答)'
const currentDepth = args.currentDepth || 'L1'
const mode = args.mode || 'standard'
const triggerNode = args.triggerNode || 'pillar-entry'
const pillar = args.pillar || '🔴'
const conversationHistory = args.conversationHistory || []
const extraContext = args.extraContext || {}

const PILLAR_CONSTRAINTS = {
  '🔴': {
    directions: '假设探查、证据检验、替代解释、被忽略视角。不得在此支柱切入方案设计或本质剥离。',
    questionTypes: [
      '质疑一个 PM 默认但未验证的前提',
      '追问证据链——"你怎么知道的？什么证据能推翻？"',
      '引入被忽略的视角——"谁的声音没听到？"',
      '要求替代解释——"除了你说的，还有没有至少两种其他可能？"',
    ],
  },
  '🟡': {
    directions: '剥离惯例、区分物理约束 vs 惯例成本、从零重建。不得在此支柱做假设探查或方案具体落地。',
    questionTypes: [
      '区分物理约束和惯例——"这是真的动不了，还是行业都这么做？"',
      '从零重建——"如果今天从零开始，没有现成的方案，第一步做什么？"',
      '挑战约定俗成——"哪条规则最经不起推敲？"',
      '极限约束——"如果预算只有 10%，什么会被删掉？"',
    ],
  },
  '🟢': {
    directions: '精准定义问题+重构（3a）、SOP/自动化/规模化（3b）。不得在此支柱做假设探查或本质剥离。',
    questionTypes: [
      '精准定义问题——"谁在什么场景遇到了什么麻烦？当前替代方案是什么？"',
      '重构问题——用"不是…而是…"句式重新框定',
      '标准化——"第一步必须固化的 SOP 是什么？隐性知识在哪？"',
      '自动化——"哪个判断可以用 If-Then 替代？异常退回什么人工流程？"',
      '规模化——"量级扩 100 倍，瓶颈爆在哪？"',
    ],
  },
}

const NODE_STRATEGIES = {
  'pillar-entry': {
    focus: '方向选择优先。第一问决定了整根支柱的走向——选最能打开局面的角度，而不是最安全的。',
    avoid: '不要选"你刚才说的 X 怎么验证"这类安全追问——它不会错但也不会推动思考转向。',
  },
  'stuck-restart': {
    focus: '角度差异优先。PM 已连续卡壳——必须用和已尝试方向明显不同的切入角度。宁可角度新而追问不完美，也不要措辞不同的同一方向。',
    avoid: '不要问卡壳前的同一角度变体。如果之前从成本角度问过，现在必须从用户行为/组织/时间/反例等不同维度切入。',
  },
  'checkpoint-extra': {
    focus: '深度推动优先。本支柱已 ≥3 轮但未能切换——这一问的目标是推动 PM 进一层（L2→L3 给因果链，L3→L4 给最小行动）。',
    avoid: '不要停留在当前深度层的换个说法。如果当前在 L2（"什么在重复"），不要问"还有别的例子吗"——直接推 L3（"为什么会重复？"）。',
  },
}

// ── Phase: Generate ──
phase('Generate')

const constraint = PILLAR_CONSTRAINTS[pillar] || PILLAR_CONSTRAINTS['🔴']
const strategy = NODE_STRATEGIES[triggerNode] || NODE_STRATEGIES['pillar-entry']

const newcomerBlock = mode === 'newcomer'
  ? `\n## 新人模式\n- 禁用词：约束/框架/层级/剥层/反演/收敛/闭合/映射、假设（名词）、变量（名词）、上层/下层/底层\n- 禁用隐喻词：锚定/博弈/梭哈/杠杆/飞轮/阵痛/红利/闭环/对齐\n- 每条追问必须能在饭桌上跟不干这行的朋友说\n- 追问本身不需要包含例子——例子是教练在 sparring 中输出的，不是追问候选的结构要求`
  : ''

const historyBlock = conversationHistory.length > 0
  ? conversationHistory.map((r, i) => `[轮次 ${i + 1}] ${r}`).join('\n')
  : '(无对话历史)'

const generateResult = await agent(
  `你是 pmcraft-coach 教练的追问生成助手。你的任务是为一个具体场景生成 2-3 条候选追问，每条从明显不同的角度切入。

## 当前状态
- 触发节点：${triggerNode}
- 当前支柱：${pillar}
- 话题：${topic}
- PM 最近回答：${pmLastResponse}
- 当前深度：${currentDepth}

## 支柱追问方向约束
${constraint.directions}

可用的追问类型（选不同类型的做候选，不要全选同一类）：
${constraint.questionTypes.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## 节点策略
**目标**：${strategy.focus}
**避免**：${strategy.avoid}
${newcomerBlock}

## 最近对话
${historyBlock}

## 任务
生成 ${triggerNode === 'stuck-restart' ? '3' : '2-3'} 条候选追问。每条必须附带：
- question: 追问原文（1-2 句，直接问不宣告操作）
- angle: 切入角度（一句话，如"从用户行为切入""从商业模式切入""从反面证据切入"）
- expectedPush: 这会推动 PM 思考什么（一句话）

核心要求：每个候选的 angle 必须**明显不同**——如果两个候选本质上是从同一角度问的，只保留一个。

返回 JSON。`,
  { label: '生成候选追问', schema: { type: 'object', properties: { candidates: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, angle: { type: 'string' }, expectedPush: { type: 'string' } }, required: ['question', 'angle', 'expectedPush'] } } }, required: ['candidates'] } }
)

if (!generateResult || !generateResult.candidates || generateResult.candidates.length === 0) {
  return { phase: 'generate', error: 'No candidates generated', candidates: [] }
}

// ── Phase: Select ──
phase('Select')

const candidatesBlock = generateResult.candidates
  .map((c, i) => `候选 ${i + 1}:\n  追问: ${c.question}\n  角度: ${c.angle}\n  预期推动: ${c.expectedPush}`)
  .join('\n\n')

const selectResult = await agent(
  `你是 pmcraft-coach 教练的追问选择助手。从候选追问中选出最优的一条。

## 选择标准（按优先级排序）
1. **负载最重**：哪个追问的答案最能改变 PM 接下来的思考方向？不是最难答的——是答完之后，PM 对这件事的理解会有一个实质性的位移。
2. **深度推动**：哪个追问最能推动 PM 从当前深度（${currentDepth}）升一层？
3. **角度差异**：${triggerNode === 'stuck-restart' ? '⚠️ 关键——PM 已卡壳，必须选和已尝试方向明显不同的切入角度。' : '如果是 stuck-restart 或 checkpoint-extra 节点，追问应与上一轮方向不同。'}

## 节点上下文
当前节点：${triggerNode}
${JSON.stringify(extraContext, null, 2)}

## 候选追问
${candidatesBlock}

## 任务
比较所有候选，选出最优的 1 条。给出选择理由（一句话，供教练内部参考，不输出给 PM）。

返回 JSON。`,
  { label: '选最优追问', schema: { type: 'object', properties: { selectedIndex: { type: 'number' }, selectionReason: { type: 'string' } }, required: ['selectedIndex', 'selectionReason'] } }
)

if (!selectResult || selectResult.selectedIndex === undefined) {
  // 选择失败 → 返回第一个候选作为兜底
  return {
    phase: 'select',
    selected: generateResult.candidates[0],
    selectionReason: '选择阶段失败，兜底返回第一个候选',
    candidates: generateResult.candidates,
  }
}

const idx = Math.max(0, Math.min(Math.floor(selectResult.selectedIndex) - 1, generateResult.candidates.length - 1))

return {
  selected: generateResult.candidates[idx],
  selectionReason: selectResult.selectionReason,
  candidates: generateResult.candidates,
}
