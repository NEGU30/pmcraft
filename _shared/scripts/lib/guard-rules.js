/**
 * guard-rules.js — Guard-Chat 检测与净化规则库（v1，保守列表）
 *
 * 规则与主脚本（guard-chat.js）分文件（lib/ 模式，同 version-scanner/port-finder
 * 先例），便于 dogfood 校准期迭代：v1 上线后作者 dogfood 一周，误报样本与规则
 * 调整记入 pmcraft/lessons.md，本文件即为当时的迭代点。
 *
 * 设计依据（已核实并勘误）：
 *   - arXiv 2507.21919（Ibrahim/Hafner/Rocher）——温暖/谄媚模型在任务上的错误率
 *     +10~30 个百分点（非传闻的 8-13%）。
 *   - AISI arXiv 2602.23971（Ask-Don't-Tell）——v2 改写层（陈述句→问句）依据，
 *     本期未实现，仅存档。
 *   - Sharma et al. 2023（Anthropic 谄媚研究）——谄媚倾向的基准来源。
 *
 * 锚定要求（评审新增，规则质量的成败点）：
 *   - 每条规则必须带上下文锚点，禁止裸子串——「是不是」「大家都」「难道」是
 *     自然语言高频词，裸匹配必误伤。
 *   - 中文诱导类用句尾标点/句式锚定（如「，对吧？」「，是吧？」整短语、
 *     「大家都知道」「大家都这么说」而非「大家都」）。
 *   - 英文加 \b 词边界；always/never 须搭配主语（"you always…" / "it never…"），
 *     "I never got a reply" 这类事实陈述不得命中。
 *   - 宁少勿误伤：拿不准的规则不进 v1。
 *
 * 陈述句过滤（开源吸收，hallucinate-check isFactual 思路重写）：
 *   谬误类（type=fallacy）仅在陈述句上匹配（句尾标点判定 + <5 词短句跳过）；
 *   诱导类不受限（确认性提问天然是问句）——结构性消除真疑问句误报。
 *
 * 净化准入标准（开源吸收，空社交验证判定的重述）：
 *   一条净化规则可进列表当且仅当「整条移除后不损失任何信息」。
 *
 * PROTECTED（检测与净化永不触碰，见主脚本）：
 *   代码块 / 行内代码 / URL / 表格行（^\|.*\|$）/ 标题（^#{1,6} ）/
 *   引号词（目标词带引号出现 = 被讨论而非被使用，unslop use/mention 区分）。
 */
'use strict';

/**
 * 检测规则：18 类 = 10 类诱导表述 + 8 类逻辑谬误。
 * 每类 5~12 条，中英双语。type: 'induce'（不受陈述句过滤）| 'fallacy'（仅陈述句）。
 */
const DETECT_RULES = [
  // ============ 诱导类（10 类）============
  {
    id: 'leading',
    label: '预设立场',
    type: 'induce',
    rules: [
      { re: /难道不(是|觉得|认为|应该)/g, sample: '难道不是' },
      { re: /不用(我)?说你也/g, sample: '不用我说你也知道' },
      { re: /(其实|说白了|明摆着)[^。！？，、]{0,12}(已经|就是|肯定|摆着)/g, sample: '说白了就是' },
      { re: /心里(已经|早)(有数|决定|想好)/g, sample: '心里已经有数' },
      { re: /说来说去(就是|还不是)/g, sample: '说来说去就是' },
      { re: /(这|那)还用说(吗)?/g, sample: '这还用说吗' },
      { re: /isn'?t it (obvious|clear|true) that/g, sample: "isn't it obvious that" },
      { re: /\bneedless to say\b/g, sample: 'needless to say' },
      { re: /\bas we all know\b/g, sample: 'as we all know' },
    ],
  },
  {
    id: 'authority',
    label: '权威宣称',
    type: 'induce',
    rules: [
      { re: /专家(说|都|们|认为|表示)/g, sample: '专家说' },
      { re: /权威(人士|机构|媒体|部门)(说|表示|认为|指出)/g, sample: '权威人士表示' },
      { re: /据(可靠|内部|知情)消息/g, sample: '据可靠消息' },
      { re: /业内(人士|专家|都)/g, sample: '业内专家' },
      { re: /科学(家|研究|界)(证明|表明|发现|证实)/g, sample: '科学家证明' },
      { re: /研究表明/g, sample: '研究表明' },
      { re: /\bexperts (say|agree|believe|suggest)\b/g, sample: 'experts say' },
      { re: /\bit'?s well known that\b/g, sample: "it's well known that" },
      { re: /\b(i know for a fact|according to (research|experts|studies))\b/g, sample: 'I know for a fact' },
    ],
  },
  {
    id: 'confirmation',
    label: '确认性提问',
    type: 'induce',
    rules: [
      { re: /，对吧(?=[？。！，]|$)/g, sample: '，对吧？' },
      { re: /，是吧(?=[？。！，]|$)/g, sample: '，是吧？' },
      { re: /，对不对(?=[？。！，]|$)/g, sample: '，对不对？' },
      { re: /，是不是(?=[？。！，]|$)/g, sample: '，是不是？' },
      { re: /，你说(呢|是吧)(?=[？。！，]|$)/g, sample: '，你说呢？' },
      { re: /，没错吧(?=[？。！，]|$)/g, sample: '，没错吧？' },
      { re: /，你觉得(呢|对不对)(?=[？。！，]|$)/g, sample: '，你觉得呢？' },
      { re: /，我说得(对|没错)吧(?=[？。！，]|$)/g, sample: '，我说得对吧？' },
      { re: /，大家觉得呢(?=[？。！，]|$)/g, sample: '，大家觉得呢？' },
      { re: /,\s*(right|am I right|don'?t you (think|agree)|wouldn'?t you (say|agree)|isn'?t it)\s*(?=[?.!]|$)/g, sample: ', right?' },
    ],
  },
  {
    id: 'emotional',
    label: '情绪化',
    type: 'induce',
    rules: [
      { re: /我是为(你|你们)好/g, sample: '我是为你好' },
      { re: /你怎么能这样/g, sample: '你怎么能这样' },
      { re: /你(难道)?一点都不/g, sample: '你一点都不' },
      { re: /你一定会后悔/g, sample: '你一定会后悔' },
      { re: /你这样(太|很)?让人(失望|难过|寒心)/g, sample: '你这样让人失望' },
      { re: /(我们|大家)这么辛苦(了)?[^。！？，]{0,8}你却/g, sample: '我们这么辛苦你却' },
      { re: /how could you/g, sample: 'how could you' },
      { re: /you'?ll (regret|be sorry)/g, sample: "you'll regret" },
      { re: /don'?t you care (about|at all)/g, sample: "don't you care" },
    ],
  },
  {
    id: 'urgency',
    label: '时间压力',
    type: 'induce',
    rules: [
      { re: /再不[^。！？，]{0,15}就(晚|来不及|没了|废了)/g, sample: '再不做就晚了' },
      { re: /机不可失/g, sample: '机不可失' },
      { re: /错过(今天|这次|这个|现在|机会)/g, sample: '错过这次' },
      { re: /(最后|仅剩|只剩)(机会|名额|时间|一天|三天|两天)/g, sample: '最后机会' },
      { re: /(马上|立刻|赶紧|抓紧)(决定|行动|拍板|定下来|做)/g, sample: '马上决定' },
      { re: /(时不我待|刻不容缓|迫在眉睫|错过不再)/g, sample: '时不我待' },
      { re: /\bnow or never\b/g, sample: 'now or never' },
      { re: /\b(last chance|limited (time|offer))\b/g, sample: 'last chance' },
      { re: /\b(act|decide) (now|fast|quickly)\b/g, sample: 'act now' },
      { re: /\bbefore it'?s too late\b/g, sample: "before it's too late" },
    ],
  },
  {
    id: 'social_binding',
    label: '社交绑定',
    type: 'induce',
    rules: [
      { re: /看在(我|我们|朋友|兄弟|姐妹|多年)的份上/g, sample: '看在我的份上' },
      { re: /咱们(谁跟谁|什么关系|这么熟了)/g, sample: '咱们什么关系' },
      { re: /这点忙(都|也)?不(帮|忙)/g, sample: '这点忙都不帮' },
      { re: /还当不当(我|你)是(朋友|兄弟)/g, sample: '还当不当我是朋友' },
      { re: /就当(帮|为)我/g, sample: '就当帮我' },
      { re: /多年的(交情|情分)/g, sample: '多年的交情' },
      { re: /\bas a friend\b/g, sample: 'as a friend' },
      { re: /\bdo it for me\b/g, sample: 'do it for me' },
      { re: /\bdon'?t (let me down|be a stranger)\b/g, sample: "don't let me down" },
    ],
  },
  {
    id: 'group_pressure',
    label: '群体压力',
    type: 'induce',
    rules: [
      { re: /大家都(是|在|说|这么|知道|认为|用)/g, sample: '大家都知道' },
      { re: /大家(都)?这么说/g, sample: '大家都这么说' },
      { re: /所有人都(知道|在|认为|这么|用)/g, sample: '所有人都知道' },
      { re: /人人都(知道|这么|在|用)/g, sample: '人人都知道' },
      { re: /谁都知道/g, sample: '谁都知道' },
      { re: /没人(不|会)(知道|觉得|认为|说)/g, sample: '没人会觉得' },
      { re: /\beveryone (knows|else|is doing|says)\b/g, sample: 'everyone knows' },
      { re: /\beverybody (says|thinks|else)\b/g, sample: 'everybody says' },
      { re: /\bnobody (thinks|disagrees|questions)\b/g, sample: 'nobody thinks' },
    ],
  },
  {
    id: 'explicit',
    label: '显性诱导',
    type: 'induce',
    rules: [
      { re: /听我的(准没错|准|就|没错)?/g, sample: '听我的' },
      { re: /按我说的(做|来|办)?/g, sample: '按我说的做' },
      { re: /相信我(一次|就行|准没错|，)?/g, sample: '相信我' },
      { re: /别(想|考虑|犹豫|纠结)那么多/g, sample: '别想那么多' },
      { re: /不用(多想|犹豫|纠结|考虑)/g, sample: '不用犹豫' },
      { re: /你就(只管|放心|照做|直接)/g, sample: '你就只管' },
      { re: /\btrust me\b/g, sample: 'trust me' },
      { re: /\bjust do it\b/g, sample: 'just do it' },
      { re: /\btake my word\b/g, sample: 'take my word' },
      { re: /\bbelieve me\b/g, sample: 'believe me' },
      { re: /\bdon'?t (overthink|worry about it)\b/g, sample: "don't overthink" },
    ],
  },
  {
    id: 'consistency',
    label: '制造一致性',
    type: 'induce',
    rules: [
      { re: /你(之前|刚才|以前|昨天|上次|明明)也(说|说过|同意|认为|提到|觉得)/g, sample: '你之前也说过' },
      { re: /你自己(刚)?(说的|说过|同意)/g, sample: '你自己说的' },
      { re: /你(一直|总是|始终)(认为|坚持|说|觉得)/g, sample: '你一直认为' },
      { re: /你刚刚才(说|同意)/g, sample: '你刚刚才说' },
      { re: /你刚(不是)?说(过)?/g, sample: '你刚说' },
      { re: /\byou (just|already|earlier) (said|agreed)\b/g, sample: 'you just said' },
      { re: /\byou said it yourself\b/g, sample: 'you said it yourself' },
      { re: /\bas you (said|agreed) before\b/g, sample: 'as you said before' },
      { re: /\byou'?ve (always|repeatedly) said\b/g, sample: "you've always said" },
    ],
  },
  {
    id: 'sunk_cost',
    label: '沉没成本',
    type: 'induce',
    rules: [
      { re: /(我|我们)(已经)?(花了|用了|投入|搭了)[^。！？，]{0,15}(周|月|天|年|时间|心血|精力|钱|成本|资源)/g, sample: '我花了三周' },
      { re: /(我|我们)做(了|完)?[^。！？，]{0,10}(这么久|好几个月|好几年|半年|一年|很多)/g, sample: '我做了很久' },
      { re: /都(做|走)到这一步(了|，)/g, sample: '都做到这一步了' },
      { re: /(不能|别)让(之前|前面)的(努力|付出|心血)白费/g, sample: '别让之前的努力白费' },
      { re: /半途而废(多|太)?可惜/g, sample: '半途而废多可惜' },
      { re: /(不|别)前功尽弃/g, sample: '别前功尽弃' },
      { re: /\bi'?ve (spent|invested|put in)\b/g, sample: "I've spent" },
      { re: /\ball that (work|time|effort)\b/g, sample: 'all that work' },
      { re: /\bwe can'?t (give up|stop) now\b/g, sample: "we can't give up now" },
      { re: /\btoo far to (turn back|quit)\b/g, sample: 'too far to turn back' },
    ],
  },

  // ============ 谬误类（8 类，仅陈述句）============
  {
    id: 'slippery_slope',
    label: '滑坡',
    type: 'fallacy',
    rules: [
      { re: /一步退，步步退/g, sample: '一步退，步步退' },
      { re: /开了这个头/g, sample: '开了这个头' },
      { re: /今天(让|允|放|准)[^。！？，]{0,8}(明天|以后|后面)(就|会)/g, sample: '今天让步明天就会' },
      { re: /一次(妥协|让步)[^。！？，]{0,12}(以后|从此|下次)/g, sample: '一次让步以后' },
      { re: /任由[^。！？，]{0,10}下去/g, sample: '任由发展下去' },
      { re: /(长此以往|久而久之)(就|会|必然)/g, sample: '长此以往就会' },
      { re: /如果[^。！？，]{0,12}就会[^。！？，]{0,12}(都|全|彻底|全部)/g, sample: '如果让步就会全部' },
      { re: /\bslippery slope\b/g, sample: 'slippery slope' },
      { re: /\bif we (allow|start|let)\b/g, sample: 'if we allow' },
      { re: /\bnext thing you know\b/g, sample: 'next thing you know' },
      { re: /\bwhere does it end\b/g, sample: 'where does it end' },
    ],
  },
  {
    id: 'false_dilemma',
    label: '虚假两难',
    type: 'fallacy',
    rules: [
      { re: /要么[^。！？，]{0,15}要么/g, sample: '要么A要么B' },
      { re: /不是[^。！？，]{0,12}就是/g, sample: '不是A就是B' },
      { re: /只有[^。！？，]{0,12}才(能|行|有|会)/g, sample: '只有这样做才行' },
      { re: /别无选择/g, sample: '别无选择' },
      { re: /非此即彼/g, sample: '非此即彼' },
      { re: /二选一，没有(别的|其他)(选择|路|办法)/g, sample: '二选一，没有别的选择' },
      { re: /\b(either [^.!?\n]{0,15} or [^.!?\n]{0,15})\b/g, sample: 'either A or B' },
      { re: /\bno (other|real) alternative\b/g, sample: 'no real alternative' },
      { re: /\btake it or leave it\b/g, sample: 'take it or leave it' },
    ],
  },
  {
    id: 'ad_hominem',
    label: '诉诸人身',
    type: 'fallacy',
    rules: [
      { re: /你就是(太|不够|根本|没|见不得)/g, sample: '你就是太' },
      { re: /你根本不懂/g, sample: '你根本不懂' },
      { re: /你(总是|永远|从来)这样/g, sample: '你总是这样' },
      { re: /你这种(人|想法|思维|心态)/g, sample: '你这种想法' },
      { re: /你有什么资格/g, sample: '你有什么资格' },
      { re: /you (don'?t|never) (understand|listen)/g, sample: 'you never listen' },
      { re: /\byou always (say|do) (this|that)\b/g, sample: 'you always do this' },
      { re: /\byou don'?t know what you'?re talking about\b/g, sample: "you don't know what you're talking about" },
    ],
  },
  {
    id: 'extremism',
    label: '极端化',
    type: 'fallacy',
    rules: [
      { re: /绝对(不会|不能|不可能|没有|是|不行)/g, sample: '绝对不可能' },
      { re: /百分之百/g, sample: '百分之百' },
      { re: /根本不可能/g, sample: '根本不可能' },
      { re: /从来(没有|没人|都不|没有过)/g, sample: '从来没有' },
      { re: /永远(不会|不可能|都不|没)/g, sample: '永远不会' },
      { re: /(所有人|任何人)都?不会/g, sample: '所有人都不会' },
      { re: /完完全全(没有|不可能|不行)/g, sample: '完完全全没有' },
      { re: /\bit never works\b/g, sample: 'it never works' },
      { re: /\bthat will never\b/g, sample: 'that will never' },
      { re: /\bno one ever\b/g, sample: 'no one ever' },
      { re: /\bcompletely (impossible|useless|wrong)\b/g, sample: 'completely impossible' },
    ],
  },
  {
    id: 'hasty_conclusion',
    label: '跳跃结论',
    type: 'fallacy',
    rules: [
      { re: /这(说明|表明|证明)/g, sample: '这说明' },
      { re: /由此可见/g, sample: '由此可见' },
      { re: /显然(是|因为|，|的)/g, sample: '显然是' },
      { re: /一定(是|因为|会)/g, sample: '一定是' },
      { re: /肯定(是|因为|会)/g, sample: '肯定是' },
      { re: /这就(证明|说明)/g, sample: '这就证明' },
      { re: /\bthis proves\b/g, sample: 'this proves' },
      { re: /\bclearly (means|shows|proves)\b/g, sample: 'clearly means' },
      { re: /\btherefore it must\b/g, sample: 'therefore it must' },
    ],
  },
  {
    id: 'circular',
    label: '循环论证',
    type: 'fallacy',
    rules: [
      { re: /本来就(是|应该)这样/g, sample: '本来就是' },
      { re: /因为它(就是|本来就)/g, sample: '因为它就是' },
      { re: /没有为什么，因为/g, sample: '没有为什么，因为' },
      { re: /(之所以|因为)[^。！？，]{0,12}本来就是/g, sample: '因为本来就是这样' },
      { re: /(说来说去|归根结底)还是(因为|由于)/g, sample: '归根结底还是因为' },
      { re: /\bit is what it is\b/g, sample: 'it is what it is' },
      { re: /\bbecause it'?s just\b/g, sample: "because it's just" },
      { re: /\bthat'?s just the way it is\b/g, sample: "that's just the way it is" },
    ],
  },
  {
    id: 'subjective',
    label: '主观断言',
    type: 'fallacy',
    rules: [
      { re: /(这|那)是(常识|事实|真理)/g, sample: '这是常识' },
      { re: /不用(怀疑|质疑|讨论)/g, sample: '不用怀疑' },
      { re: /众所周知/g, sample: '众所周知' },
      { re: /明摆着(的|的事)/g, sample: '明摆着的' },
      { re: /一目了然/g, sample: '一目了然' },
      { re: /无需(讨论|争辩|解释|质疑)/g, sample: '无需讨论' },
      { re: /毋庸置疑/g, sample: '毋庸置疑' },
      { re: /\bobviously\b/g, sample: 'obviously' },
      { re: /\bno doubt\b/g, sample: 'no doubt' },
      { re: /\bit'?s a fact\b/g, sample: "it's a fact" },
    ],
  },
  {
    id: 'false_causality',
    label: '伪因果',
    type: 'fallacy',
    rules: [
      { re: /因为[^。！？，]{0,12}所以(就|才会|因此)/g, sample: '因为A所以B' },
      { re: /自从[^。！？，]{0,12}(之后|以后)[^。！？，]{0,12}就/g, sample: '自从X之后Y就' },
      { re: /就是因为[^。！？，]{0,12}才/g, sample: '就是因为X才' },
      { re: /(一|每次)[^。！？，]{0,10}就[^。！？，]{0,10}(肯定|一定|必然)/g, sample: '一X就肯定Y' },
      { re: /(都怪|全怪)(因为|是)/g, sample: '都怪因为' },
      { re: /(因为|由于)[^。！？，]{0,10}导致了/g, sample: '因为X导致了' },
      { re: /\bthat'?s why\b/g, sample: "that's why" },
      { re: /\bever since\b/g, sample: 'ever since' },
      { re: /\bit'?s all because of\b/g, sample: "it's all because of" },
    ],
  },
];

/**
 * 净化规则：仅纯对话填充语（中 18 + 英 14），整条移除后零信息损失。
 * 准入标准见文件头。书面语（综上所述/毫无疑问）与标点（——）不属于填充语，
 * 不进入本表——文档是用户交付物，净化只拦填充语泄漏，不改文风。
 */
const PURIFY_RULES = {
  zh: [
    '好问题',
    '很好的问题',
    '你说得对',
    '你说得很有道理',
    '很有道理',
    '希望对你有帮助',
    '希望对你有所帮助',
    '希望这些对你有帮助',
    '欢迎随时联系',
    '欢迎随时来找我',
    '有需要随时找我',
    '随时可以找我',
    '当然可以',
    '好的，我们开始',
    '好的，让我',
    '让我想想',
    '不用客气',
    '别客气',
  ],
  en: [
    'Great question',
    'Good question',
    'That\'s a great question',
    'That\'s a great point',
    'That\'s an excellent point',
    'Hope this helps',
    'Hope that helps',
    "Let's dive in",
    "Don't hesitate to",
    'Feel free to reach out',
    "I'm happy to help",
    'No problem',
    "You're welcome",
    'Happy to help',
  ],
};

module.exports = { DETECT_RULES, PURIFY_RULES };
