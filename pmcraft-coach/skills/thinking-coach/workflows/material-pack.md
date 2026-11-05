export const meta = {
  name: 'material-pack',
  description: 'Search and structure a hot topic material pack — timeline, data, perspectives, directions, sources.',
  phases: [
    { title: 'Search', detail: 'WebSearch for topic timeline, data, different perspectives, and opposing voices' },
    { title: 'Structure', detail: 'Format results into the 5-section material pack template' },
  ],
}

// ── Input ──
// args.topic: string — the hot topic the PM selected (e.g. "深圳地铁安检话题")
// args.domainCategory: string (optional) — the domain tag (🟠社会民生/🔵商业科技/🟢实体消费/🟣文化生活) for source targeting

phase('Search')

// Search for timeline, data, multiple perspectives, and opposing voices
const searchResult = await agent(
  `你是 pmcraft-coach 的研究助手。为一个热点话题搜索并整理关键信息。

## 话题
${args.topic}

## 任务
执行 3-5 次 WebSearch，覆盖以下维度（每次用不同 query 和来源）：

1. **时间线**：搜索话题相关的关键事件和时间节点
2. **关键数据**：搜索规模、增速、成本、对比数据等可验证数字
3. **各方立场**：搜索不同当事方的说法——支持方、反对方、第三方/分析师
4. **反面声音**：专门搜索反对/批评/质疑该话题主流叙事的观点
5. **参考来源**：记录每条信息的来源 URL

## 质量要求
- 每条信息必须标注来源，不编造
- 反面声音必须真实可追溯，不能为了满足格式而虚构
- 如果搜索不到反面声音，如实记录"未找到有据可查的反面声音"

## 输出格式
以结构化的 Markdown 返回搜索结果，按维度组织，每条附来源 URL。`,
  { label: '搜索话题信息', schema: { type: 'object', properties: { timeline: { type: 'array', items: { type: 'object', properties: { event: { type: 'string' }, date: { type: 'string' }, source: { type: 'string' } }, required: ['event', 'source'] } }, data: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, description: { type: 'string' }, source: { type: 'string' } }, required: ['value', 'description', 'source'] } }, perspectives: { type: 'array', items: { type: 'object', properties: { stance: { type: 'string' }, content: { type: 'string' }, source: { type: 'string' } }, required: ['stance', 'content', 'source'] } }, opposingVoices: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, source: { type: 'string' } }, required: ['content', 'source'] } }, hasRealOpposingVoices: { type: 'boolean' } }, required: ['timeline', 'data', 'perspectives', 'opposingVoices', 'hasRealOpposingVoices'] } }
)

if (!searchResult) {
  return '## 搜索失败\n\n当前无法获取该话题的公开信息。建议 PM 换话题或用自己的了解来聊。'
}

phase('Structure')

// Format into the 5-section material pack template
const materialPack = await agent(
  `你是 pmcraft-coach 的材料整理助手。将搜索结果整理为标准的五段材料包。

## 原始搜索结果
${JSON.stringify(searchResult, null, 2)}

## 输出模板
严格按照以下格式输出，逐段填充：

📋 阅读材料：${args.topic}

━━━ 时间线 ━━━
（按时间顺序列出关键事件，纯事实，每条一行）
- YYYY.MM 事件一
- YYYY.MM 事件二
…

━━━ 一组数据 ━━━
（关键数字：规模、增速、成本、对比数据等，纯事实）
- 数据项一：X
- 数据项二：Y
…

━━━ 各方怎么说 ━━━
（至少 3 个不同立场的说法，纯引用/转述，不给判断。必须包含至少一个与主流叙事相反的立场。）
- 当事方 A："…"
- 当事方 B："…"
- 第三方/用户/分析师："…"
${searchResult.hasRealOpposingVoices ? '- 反面声音："…"' : '> 注：未找到有据可查的反面声音。'}

━━━ 可聊的几个方向 ━━━
（只给开放性问题，不给答案）
- 方向一？
- 方向二？
- 方向三？

━━━ 参考来源 ━━━
- [来源标题](URL) — 一句话说明这是什么
- [来源标题](URL) — 一句话说明这是什么

## 约束
- 只从搜索结果中提取信息，不添加搜索中未出现的内容
- 反面声音必须有真实来源，${searchResult.hasRealOpposingVoices ? '从 opposingVoices 中提取' : '标注"未找到有据可查的反面声音"'}
- 参考来源必须包含实际 URL`,
  { label: '整理材料包', schema: { type: 'object', properties: { materialPack: { type: 'string' } }, required: ['materialPack'] } }
)

return materialPack ? materialPack.materialPack : '## 材料整理失败\n\n无法将搜索结果整理为材料包。建议 PM 换话题或用自己的了解来聊。'
