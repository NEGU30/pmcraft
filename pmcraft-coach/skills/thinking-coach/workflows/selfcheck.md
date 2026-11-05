export const meta = {
  name: 'selfcheck',
  description: 'Coach output self-check: filter factual claims then run five-dimension audit. No output until 🔴 hard issues cleared.',
  phases: [
    { title: 'Filter', detail: 'Check if draft contains factual claims, judgments, or analogies' },
    { title: 'SelfCheck', detail: 'Five-dimension scan: facts→sources, consistency, doubts, wording, format' },
  ],
}

// ── Input ──
// args.draft: string — the coach's draft output text
// args.context: string — recent N rounds of dialogue (condensed), for consistency checking
// args.mode: string (optional) — "newcomer" to enable forbidden-word checks

phase('Filter')

// Phase 1: One-layer filter — does the draft contain factual claims, judgments, or analogies?
const filterResult = await agent(
  `You are a filter that checks whether a piece of text contains anything beyond pure questions.

A "pure question" is a sentence that ONLY asks, without making any factual claim, judgment, or analogy.
Examples of PURE questions (PASS the filter):
- "你怎么想到的？"
- "有反例吗？"
- "具体是哪个环节？"
- "你确认过用户真的有这个需求吗？" (still a pure question — it asks whether verification happened, doesn't claim it didn't)

Examples of NON-PURE content (FAIL the filter — contains factual claims, judgments, or analogies):
- "你提到了用户想省钱——这就像拼多多的逻辑" (analogy)
- "这个行业的利润率通常在5%左右" (factual claim)
- "我观察到小需求和大需求的用户状态不同" (judgment/observation with factual content)
- "品牌是初始筛选标签，但被太多选择稀释" (factual judgment)
- "刚才在用批判性思维找假设漏洞" (descriptive claim about what was done)

Rules:
- Questions that embed factual claims ("你怎么看LLM只学昨天的know-how这个判断？") → FAIL, the embedded claim needs checking
- Tag questions that reference PM's own words ("你刚才说用户肯定想要更便宜——确定吗？") → PASS if the claim being questioned IS the PM's own stated position, not the coach's assertion
- 🗣️ Coach perspective, 🧠 Coach trial answer, diagnostic corrections → always FAIL (they inherently contain judgments)

Analyze this draft text:

"""
${args.draft}
"""

Return JSON:
{
  "hasFactualContent": true/false,
  "reasoning": "one sentence explaining why"
}`,
  { label: '一层过滤', schema: { type: 'object', properties: { hasFactualContent: { type: 'boolean' }, reasoning: { type: 'string' } }, required: ['hasFactualContent', 'reasoning'] } }
)

if (!filterResult || !filterResult.hasFactualContent) {
  return { phase: 'pass' }
}

// Phase 2: Five-dimension self-check
phase('SelfCheck')

const contextBlock = args.context
  ? `\n\n## 最近对话上下文（用于一致性检查）\n${args.context}`
  : ''

const newcomerBlock = args.mode === 'newcomer'
  ? `\n\n## 新人模式格式要求\n- 禁用术语：锚定/锚点/约束/框架/层级/剥层/反演/收敛/闭合/映射/假设（作为名词单独使用）/变量（作为名词单独使用）\n- 禁用空间隐喻：上层/下层/底层/回到XX层/跳出XX层\n- 禁用亚文化/隐喻词：博弈/梭哈/杠杆/飞轮/阵痛/红利/闭环/对齐\n- emoji标注保留但后面必须跟自然语言\n- 首次出现的抽象概念必须先给一个独立例子`
  : ''

const selfcheckResult = await agent(
  `你是 pmcraft-coach 教练的质量门禁。对教练准备输出的草稿执行五维自检，逐项标注严重度。

## 评分标准

| 等级 | 含义 | 处理 |
|:---|:---|:---|
| 🔴 硬伤 | 事实错误/无来源声称/与已有立场矛盾/格式硬性缺失 | 必须修正后重检 |
| 🟡 软伤 | 概括过度/类比不太对/信心标定偏高 | 教练修正后即可输出 |
| ⚪ 标注 | 不确定但无法验证/边界模糊 | 输出时口头标定不确定 |

---

## 维度①：事实声称 → 来源

逐句扫描草稿中每条事实声称（数据、事件、案例细节、归因判断、商业模型推断、行业惯例断言）。
对每条事实声称判断：
- 有可追溯来源 → ⚪（标注来源类型）
- 无来源 → 🔴 硬伤。标注具体语句和建议操作（删除/改追问/标不确定）

注意：引用 PM 自己说过的话不算事实声称——那是 sparring 对话内容，不需要外部验证。

## 维度②：逻辑一致性 → 与已有立场

检查草稿内容是否与上下文中教练已建立的立场存在无标记矛盾。
- 无矛盾或已显式标记 → ⚪
- 存在无标记矛盾 → 🔴 硬伤。标注矛盾点。

## 维度③：可能错在哪

对草稿中的每个关键判断（不只是事实声称，也含推理和归因），从"如果这个判断是错的"的角度思考 ≥1 种可能的错误方式。
- 能想到具体错误路径 → 🟡（说明路径，但不要求修正——教练自己判断）
- 想不到错误路径 → ⚪（标注"未发现明显错误路径"）

## 维度④：措辞过滤

检查草稿中的措辞问题：
- 概括范围失准："所有/都/必然/总是"等全称量词，实际只适用于部分情况 → 🟡
- 类比不对等：对不上的结构要素 ≥ 对得上的 → 🟡，建议放弃类比或补充限制条件
- 信心标定不匹配：推断措辞成事实（"这会导致""必然带来"但实际只是可能性）→ 🟡

## 维度⑤：格式合规

检查以下格式硬要求：
- 是🗣️教练视角？→ 必须以 🗣️ emoji 开头，结尾必须有反向邀请（"有不同意的地方吗？"）
- 是🧠教练试答？→ 必须以 🧠 emoji 开头，结尾必须有差异追问（"我的框架和你的判断，差异在哪？"）
- 是支柱切换？→ 必须包含对应 emoji（🔴/🟡/🟢）
- 是新人模式？→ 扫描禁用词（见上方新人模式格式要求）
- 任何格式缺失 → 🔴 硬伤

${newcomerBlock}

---

## 草稿内容

${args.draft}
${contextBlock}

---

请按以下 JSON 格式返回自检结果：

{
  "findings": [
    {
      "dimension": "①事实声称→来源" | "②逻辑一致性" | "③可能错在哪" | "④措辞过滤" | "⑤格式合规",
      "summary": "one-line description",
      "detail": "具体指出草稿中哪句话/哪个词有问题",
      "severity": "🔴" | "🟡" | "⚪",
      "suggestion": "修正建议（🔴/🟡时必填）"
    }
  ],
  "hasHardIssue": true/false,
  "hardIssuesCount": 0,
  "overallVerdict": "PASS" | "FIX_THEN_OUTPUT" | "HARD_STOP"
}`,
  { label: '五维自检', schema: { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { dimension: { type: 'string' }, summary: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string' }, suggestion: { type: 'string' } }, required: ['dimension', 'summary', 'detail', 'severity'] } }, hasHardIssue: { type: 'boolean' }, hardIssuesCount: { type: 'number' }, overallVerdict: { type: 'string' } }, required: ['findings', 'hasHardIssue', 'hardIssuesCount', 'overallVerdict'] } }
)

if (!selfcheckResult) {
  return { phase: 'selfcheck', error: 'Agent returned null', results: null }
}

// No hard issues → coach fixes 🟡 issues and outputs
if (!selfcheckResult.hasHardIssue) {
  return {
    phase: 'selfcheck',
    passed: true,
    results: selfcheckResult,
    instruction: '无🔴硬伤。修正🟡软伤后即可输出。'
  }
}

// Has hard issues → coach fixes draft, then round 2
// (The coach in the main session handles the re-check loop;
// this workflow just returns the findings)
return {
  phase: 'selfcheck',
  passed: false,
  results: selfcheckResult,
  instruction: '有🔴硬伤（' + selfcheckResult.hardIssuesCount + '条）。修正草稿后需第2轮自检。第2轮仍有🔴硬伤 → 硬停，输出时口头标定不确定处。'
}
