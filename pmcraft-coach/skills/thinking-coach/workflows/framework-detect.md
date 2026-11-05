export const meta = {
  name: 'framework-detect',
  description: 'Compare PM and coach thinking frameworks — detect structural differences to decide whether a trial answer is warranted.',
  phases: [
    { title: 'Detect', detail: 'Extract PM framework, reverse-infer coach framework, compare for structural differences' },
  ],
}

// ── Input ──
// args.pmResponses: string[] — PM's last 3-5 answers
// args.coachQuestions: string[] — coach's corresponding questions
// args.pillarContext: string (optional) — which pillar and what's been explored

phase('Detect')

const pmBlock = args.pmResponses
  ? args.pmResponses.map((r, i) => `PM回答${i + 1}: ${r}`).join('\n\n')
  : '(无PM回答数据)'

const coachBlock = args.coachQuestions
  ? args.coachQuestions.map((q, i) => `教练追问${i + 1}: ${q}`).join('\n\n')
  : '(无教练追问数据)'

const pillarBlock = args.pillarContext
  ? `\n## 当前支柱与上下文\n${args.pillarContext}`
  : ''

const result = await agent(
  `你是 pmcraft-coach 教练的"框架自觉"辅助——你的任务是分析教练和 PM 的思考框架是否存在结构性差异，帮助教练判断是否需要做教练试答。

## 什么是"框架"？

框架 = 切入角度 + 关键变量 + 推理路径。

两个人在讨论同一话题，但可能有完全不同的框架：
- PM 从"品牌忠诚度"切入，关键变量是"用户怕选错"；教练从"成交关系"切入，关键变量是"买卖双方的权力结构"
- PM 从"功能优先级"切入，关键变量是"开发成本"；教练从"用户行为"切入，关键变量是"用户当前替代方案"
- PM 和教练框架相同：都从"成本结构"切入，都关注"固定成本 vs 可变成本"

框架相同 = 方向一致的追问是回声，不值得做试答。
框架不同 = 教练可以亮出自己的不同切入角度，作为"平行参照系"给 PM 看。

## 任务

1. 从 PM 最近 3-5 轮回答中提取 PM 的思考框架：
   - 切入角度：PM 主要从哪个角度分析问题？
   - 关键变量：PM 最关注哪些变量？
   - 推理路径：PM 的推理方向是什么？

2. 从教练最近 3-5 轮追问中**逆向推断**教练的隐含框架：
   - 切入角度：教练的追问引导 PM 看哪个方向？
   - 关键变量：教练的追问最关注哪些变量？
   - 推理路径：教练想推动的推理方向是什么？

3. 比较两个框架的结构差异：
   - 框架相同 → hasDifference: false（切入角度同类、关键变量重叠、推理方向一致）
   - 框架不同 → hasDifference: true，给出差异描述

## 数据

### PM 最近回答
${pmBlock}

### 教练对应追问
${coachBlock}
${pillarBlock}

---

返回 JSON：

{
  "hasDifference": true/false,
  "pmFramework": {
    "angle": "PM的切入角度（一句话）",
    "keyVariables": ["变量1", "变量2"],
    "reasoningPath": "PM的推理路径方向（一句话）"
  },
  "coachFramework": {
    "angle": "教练的切入角度（从追问逆向推断，一句话）",
    "keyVariables": ["变量1", "变量2"],
    "reasoningPath": "教练想推动的推理方向（一句话）"
  },
  "difference": "如果框架不同，具体描述差异在哪——切入角度、关键变量还是推理路径？如果框架相同，写'框架结构一致'",
  "trialAnswerSuggestion": "如果框架不同，给出2-3句试答建议（教练的切入角度和关键变量是什么，可以落到什么可验证方向）。如果框架相同，此字段为null"
}`,
  { label: '框架比对', schema: { type: 'object', properties: { hasDifference: { type: 'boolean' }, pmFramework: { type: 'object', properties: { angle: { type: 'string' }, keyVariables: { type: 'array', items: { type: 'string' } }, reasoningPath: { type: 'string' } }, required: ['angle', 'keyVariables', 'reasoningPath'] }, coachFramework: { type: 'object', properties: { angle: { type: 'string' }, keyVariables: { type: 'array', items: { type: 'string' } }, reasoningPath: { type: 'string' } }, required: ['angle', 'keyVariables', 'reasoningPath'] }, difference: { type: 'string' }, trialAnswerSuggestion: { type: 'string' } }, required: ['hasDifference', 'pmFramework', 'coachFramework', 'difference'] } }
)

return result
