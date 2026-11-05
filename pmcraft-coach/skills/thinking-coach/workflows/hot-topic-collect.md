export const meta = {
  name: 'hot-topic-collect',
  description: 'Collect hot topics across 4 domains × 2 time windows using source-specific queries, filtered through talkability sieve.',
  phases: [
    { title: 'Collect', detail: '4-domain pipeline: source-specific search → talkability filter, 2 time windows per domain' },
    { title: 'Structure', detail: 'Merge filtered results into standard display format' },
  ],
}

// ── Input ──
// args.today: string — 当前日期（如 "2026-08-06"）
// 当前月份由 args.today 推导，避免硬编码月份过时
const todayObj = new Date(args.today)
const currentMonth = `${todayObj.getFullYear()}年${todayObj.getMonth() + 1}月`

// ── 领域定义 + Chapter 8 来源映射 ──

const DOMAINS = [
  {
    key: '🟠社会民生',
    boundary: '主体是普通人/群体/公共机构——他们做了什么、遭遇了什么、如何反应。政府/公共机构的行动（政策、资金、监管）按影响对象归入对应领域',
    primarySource: '微博热搜 / 界面新闻',
    query: `${currentMonth} 社会热点 民生新闻 普通人`,
  },
  {
    key: '🔵商业科技',
    boundary: '主体是企业/技术/产品——行业竞争、技术突破、商业模式变化',
    primarySource: '36氪 / 虎嗅',
    query: `${currentMonth} 商业科技 互联网 AI 创业 产品`,
  },
  {
    key: '🟢实体消费',
    boundary: '主体是消费行为/零售业态/供应链——消费者怎么花钱、商家怎么卖、业态怎么变',
    primarySource: '36氪-未来消费 / 第一财经',
    query: `${currentMonth} 消费 零售 餐饮 实体 供应链`,
  },
  {
    key: '🟣文化生活',
    boundary: '主体是文化作品/体育赛事/娱乐方式/教育现象——人们怎么玩、怎么看、怎么学',
    primarySource: '微博热搜 / 今日热榜',
    query: `${currentMonth} 文化 娱乐 体育 教育 生活`,
  },
]

// ── 可聊性筛子 schema ──
const SCHEMA_TALKABILITY = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          date: { type: 'string' },
          tag: { type: 'string' },
          sourceUrl: { type: 'string' },
          passTalkability: { type: 'boolean' },
          talkabilityReason: { type: 'string' },
        },
        required: ['title', 'summary', 'date', 'sourceUrl', 'passTalkability', 'talkabilityReason'],
      },
    },
  },
  required: ['candidates'],
}

// ── Phase: Collect ──
phase('Collect')

// 4 领域 pipeline：每领域搜索两时间档 → 过可聊性筛子
const domainResults = await pipeline(
  DOMAINS,
  async (domain) => {
    // 两步串行：先搜本周，再搜本月
    const searchPrompts = [
      { window: '本周', timeHint: `${args.today} 最近一周（${currentMonth}）` },
      { window: '本月', timeHint: `${currentMonth} 本月（1 日至今，排除最近一周）` },
    ]

    const weekCandidates = await agent(
      `你是 pmcraft-coach 的热点采集助手。

## 任务
为 **${domain.key}** 领域搜索 **本周**（过去 7 天）的热点事件。

## 领域边界
${domain.boundary}

## 来源要求
优先从 ${domain.primarySource} 搜索。用具体来源名构造搜索 query，不要用泛关键词。

## 时间范围
${args.today} 最近一周（${currentMonth}）。

## 搜索 query
${domain.query} 最近一周

## 可聊性筛子（每条候选必须满足至少一条）
① **结构性矛盾**：存在观点对立或两难取舍
② **可追问的根因**：不只是信息公告，可以追问"为什么会这样"且至少有两层答案
③ **能映射训练支柱**：可以练到 🔴批判性思维 / 🟡第一性原理 / 🟢产品思维 中至少一根

## 输出
返回 2-4 条候选热点。每条判断是否通过可聊性筛子，标注通过理由。
不满足任意一条筛子的，passTalkability 标 false。
若该领域本周无合适热点，返回空数组。不要凑数。`,
      { label: `${domain.key}-本周`, schema: SCHEMA_TALKABILITY }
    )

    const monthCandidates = await agent(
      `你是 pmcraft-coach 的热点采集助手。

## 任务
为 **${domain.key}** 领域搜索 **本月**（本月 1 日至今，排除最近一周已搜过的）的热点事件。

## 领域边界
${domain.boundary}

## 来源要求
优先从 ${domain.primarySource} 搜索。注意：若上一个来源已经用了某个平台，本轮换另一个。来源多的领域应轮换使用不同来源。

## 时间范围
${currentMonth}，本月 1 日至今（排除最近一周）。

## 搜索 query
${domain.query} 本月

## 可聊性筛子（每条候选必须满足至少一条）
① **结构性矛盾**：存在观点对立或两难取舍
② **可追问的根因**：不只是信息公告，可以追问"为什么会这样"且至少有两层答案
③ **能映射训练支柱**：可以练到 🔴批判性思维 / 🟡第一性原理 / 🟢产品思维 中至少一根

## 输出
返回 2-4 条候选热点。每条判断是否通过可聊性筛子，标注通过理由。
不满足任意一条筛子的，passTalkability 标 false。
若该领域本月无合适热点，返回空数组。不要凑数。`,
      { label: `${domain.key}-本月`, schema: SCHEMA_TALKABILITY }
    )

    // 合并两档结果，只保留通过可聊性筛子的
    const weekPassed = (weekCandidates && weekCandidates.candidates)
      ? weekCandidates.candidates.filter(c => c.passTalkability)
      : []
    const monthPassed = (monthCandidates && monthCandidates.candidates)
      ? monthCandidates.candidates.filter(c => c.passTalkability)
      : []

    return {
      domain: domain.key,
      本周: weekPassed,
      本月: monthPassed,
    }
  }
)

// ── Phase: Structure ──
phase('Structure')

// 组装最终输出
const domains = {}
let totalCount = 0

for (const dr of domainResults) {
  if (!dr) continue
  domains[dr.domain] = { 本周: dr['本周'] || [], 本月: dr['本月'] || [] }
  totalCount += (dr['本周'] || []).length + (dr['本月'] || []).length
}

// 汇总日志
log(`${totalCount} 条热点通过可聊性筛子（4 领域 × 2 时间档）`)
for (const [domain, windows] of Object.entries(domains)) {
  const wk = (windows['本周'] || []).length
  const mo = (windows['本月'] || []).length
  if (wk + mo === 0) {
    log(`${domain}: 本周 0 条, 本月 0 条`)
  } else {
    log(`${domain}: 本周 ${wk} 条, 本月 ${mo} 条`)
  }
}

return {
  domains,
  hasWebSearch: true,
  totalCount,
}
