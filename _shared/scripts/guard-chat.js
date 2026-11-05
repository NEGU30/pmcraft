#!/usr/bin/env node
/**
 * guard-chat.js — Guard-Chat 守卫开关 + 轻量守卫（pmcraft 2.3.1）
 *
 * 零依赖（仅 fs/path/os），复用 lib/json-output.js（ok/fail/usage）与
 * lib/guard-rules.js（18 类检测规则 + 净化规则）。
 *
 * 子命令：
 *   status          → {"enabled":bool,"prompted":bool,"dir":"…"}  只读，不建目录
 *   enable/disable  → {"enabled":bool,"dir":"…"}                  原子写（.tmp+rename），懒建目录
 *   mark-prompted   → {"prompted":true,"dir":"…"}                 置 session.json
 *   detect          → {"hits":[{category,label,matched,idx}],"total":n}   stdin（多行全文）
 *   purify          → {"purified":"…","removals":[…],"structure_safe":bool}   stdin（多行全文）
 *
 * 状态文件：~/.claude/user-data/pmcraft-guard-chat/
 *   guard-chat.json（持久 enabled）+ session.json（每会话 prompted）
 * 损坏/缺失一律回退默认（enabled=false, prompted=false）并正常输出，绝不 fail 阻塞。
 *
 * detect 命中追加写 detect-log.jsonl（每行 {ts,category,matched}，为 v1.1 校准供数据；
 * stdout 契约不变，写失败静默）。
 *
 * detect/purify 一律 stdin：引号定界 heredoc 零 shell 展开，消除 `--text=` 剥离
 * 引号/括号等字符造成的规则盲区。保护段（代码块/行内代码/URL/表格行/标题/
 * 引号词）检测与净化永不触碰；净化失败静默降级原文。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { ok, fail, usage } = require('./lib/json-output');
const { DETECT_RULES, PURIFY_RULES } = require('./lib/guard-rules');

const HOME = process.env.USERPROFILE || process.env.HOME || '.';
const DATA_DIR = path.join(HOME, '.claude', 'user-data', 'pmcraft-guard-chat');
const STATE_FILE = path.join(DATA_DIR, 'guard-chat.json');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');
const LOG_FILE = path.join(DATA_DIR, 'detect-log.jsonl');

/* ---------------- 状态读写 ---------------- */

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null; // 缺失/损坏 → 回退默认
  }
}

function getEnabled() {
  const s = readJson(STATE_FILE);
  return !!(s && s.enabled === true);
}

function getPrompted() {
  const s = readJson(SESSION_FILE);
  return !!(s && s.prompted === true);
}

function atomicWrite(file, obj) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* 下面写文件时会再抛 */ }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  fs.renameSync(tmp, file);
}

/* ---------------- stdin 读取（同步，管道/heredoc 跨平台安全） ---------------- */

function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  for (;;) {
    let n;
    try { n = fs.readSync(0, buf, 0, buf.length, null); } catch (e) { break; }
    if (n <= 0) break;
    chunks.push(buf.slice(0, n));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/* ---------------- 保护段（检测与净化永不触碰） ---------------- */

/**
 * 保护段：代码块/行内代码/URL/表格行/标题/引号词（被讨论而非被使用的目标词）。
 * 返回合并去重的 [start, end) 区间数组。
 */
function buildProtectedRanges(text) {
  const ranges = [];
  const pats = [
    /```[^\n]*\n[\s\S]*?```/g,        // 围栏代码块
    /~~~[^\n]*\n[\s\S]*?~~~/g,        // 波浪线代码块
    /`[^`\n]+`/g,                     // 行内代码
    /(?:https?|ftp|file):\/\/[^\s<>"']+/g, // URL
    /www\.[^\s<>"']+/g,               // www 短 URL
    /^[ \t]*\|[^\n]*\|[ \t]*$/gm,     // 表格行
    /^[ \t]*#{1,6}[ \t]+[^\n]*$/gm,   // 标题
    /「[^」\n]*」/g,                   // 中文引号词（use/mention 区分）
    /『[^』\n]*』/g,
    /“[^”\n]*”/g,
    /‘[^’\n]*’/g,
    /"[^"\n]*"/g,                     // ASCII 双引号词（单引号与撇号歧义，不启用）
  ];
  for (const re of pats) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length > 0) ranges.push([m.index, m.index + m[0].length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) {
      if (r[1] > last[1]) last[1] = r[1];
    } else {
      merged.push([r[0], r[1]]);
    }
  }
  return merged;
}

function isInRanges(ranges, idx) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (idx < ranges[mid][0]) hi = mid - 1;
    else if (idx >= ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/* ---------------- 陈述句过滤（谬误类专用） ---------------- */

function splitSentences(text) {
  const res = [];
  const re = /[^。！？!?\n]+[。！？!?]?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].replace(/\r/g, '');
    if (!s.trim()) continue;
    const last = s[s.length - 1];
    const isStatement = !(last === '？' || last === '！' || last === '?' || last === '!');
    res.push({ start: m.index, end: m.index + m[0].length, isStatement, units: countUnits(s) });
  }
  return res;
}

function countUnits(s) {
  const cjk = (s.match(/[一-鿿]/g) || []).length;
  const words = (s.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + words;
}

function isStatementAt(sentences, idx) {
  if (!sentences) return true;
  for (const sent of sentences) {
    if (idx >= sent.start && idx < sent.end) {
      return sent.isStatement && sent.units >= 5; // 句尾标点判定 + <5 词短句跳过
    }
  }
  return true;
}

/* ---------------- detect ---------------- */

function appendLog(entries) {
  if (!entries.length) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  } catch (e) { /* 写失败静默，stdout 契约不变 */ }
}

function detect(text) {
  const ranges = buildProtectedRanges(text);
  const sentences = splitSentences(text);
  const hits = [];
  const logged = [];
  outer:
  for (const cat of DETECT_RULES) {
    if (hits.length >= 6) break;
    let catCount = 0;
    let lastEnd = -1;
    for (const rule of cat.rules) {
      if (catCount >= 2 || hits.length >= 6) break;
      // 规则字面量带 /g；统一加 i（英文句首大写如 "It/You" 必须命中，中文无大小写不受影响）
      const re = new RegExp(rule.re.source, 'gi');
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (catCount >= 2 || hits.length >= 6) break;
        const idx = m.index;
        if (idx < lastEnd) continue; // 同类同位置去重
        if (isInRanges(ranges, idx)) continue; // 保护段不命中
        if (cat.type === 'fallacy' && !isStatementAt(sentences, idx)) continue; // 陈述句过滤
        lastEnd = re.lastIndex;
        catCount++;
        const matched = m[0].slice(0, 40);
        hits.push({ category: cat.id, label: cat.label, matched, idx });
        logged.push({ ts: new Date().toISOString(), category: cat.id, matched: m[0].slice(0, 60) });
        if (hits.length >= 6) break outer;
      }
    }
  }
  appendLog(logged);
  return ok({ hits, total: hits.length });
}

/* ---------------- purify ---------------- */

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 净化规则编译：短语 + 前置边界 + 尾部延伸（粘性）。见 guard-rules.js 准入标准。 */
function buildPurifyRegexes() {
  const zh = PURIFY_RULES.zh.map((p) => ({
    phrase: p,
    re: new RegExp('(^|[，。！？；;,.!?：:\\s])' + esc(p) + '(?![A-Za-z0-9])', 'g'),
    // trail 不含 \n\r：尾部延伸不得跨行（否则段落空行/标题行首会被一并删除，破坏文档结构）
    trail: /[，。！？；;,.!?：: \t]*/y,
  }));
  const en = PURIFY_RULES.en.map((p) => ({
    phrase: p,
    re: new RegExp('(^|(?:[.!?][ \\t\\r\\n]+)|[\\r\\n])' + esc(p) + '(?![A-Za-z0-9])', 'gi'),
    trail: /(?:[.,!?;][ \t]*|[ \t]+)/y,
  }));
  return zh.concat(en);
}

function purify(text) {
  const ranges = buildProtectedRanges(text);
  const allSpans = []; // {start, end, phrase}
  for (const rule of buildPurifyRegexes()) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      const idx = m.index;
      if (isInRanges(ranges, idx)) continue; // 保护段（含引号词）永不触碰
      let end = rule.re.lastIndex;
      rule.trail.lastIndex = end;
      const t = rule.trail.exec(text);
      if (t && t[0].length > 0) end = t.index + t[0].length;
      allSpans.push({ start: idx, end, phrase: rule.phrase });
    }
  }
  // 跨规则重叠：按起点排序，重叠的后到者丢弃（防双重拼接损坏文本）
  allSpans.sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted = [];
  let lastEnd = -1;
  for (const span of allSpans) {
    if (span.start < lastEnd) continue;
    accepted.push(span);
    lastEnd = span.end;
  }
  // 从后往前拼接，索引不失效
  let purified = text;
  const removals = [];
  const countMap = new Map();
  for (let i = accepted.length - 1; i >= 0; i--) {
    const span = accepted[i];
    purified = purified.slice(0, span.start) + purified.slice(span.end);
    countMap.set(span.phrase, (countMap.get(span.phrase) || 0) + 1);
  }
  for (const [phrase, count] of countMap) removals.push({ phrase, count });
  // 结构保真校验：保护段内容字节级原样；不一致 → 静默降级原文
  if (!structurePreserved(text, purified)) {
    return ok({ purified: text, removals: [], structure_safe: false });
  }
  return ok({ purified, removals, structure_safe: true });
}

function structurePreserved(orig, result) {
  const a = buildProtectedRanges(orig).map(([s, e]) => orig.slice(s, e));
  const b = buildProtectedRanges(result).map(([s, e]) => result.slice(s, e));
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ---------------- 子命令 ---------------- */

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'status': {
      // 只读，不建目录
      return ok({ enabled: getEnabled(), prompted: getPrompted(), dir: DATA_DIR });
    }
    case 'enable': {
      atomicWrite(STATE_FILE, { enabled: true });
      return ok({ enabled: true, dir: DATA_DIR });
    }
    case 'disable': {
      atomicWrite(STATE_FILE, { enabled: false });
      return ok({ enabled: false, dir: DATA_DIR });
    }
    case 'mark-prompted': {
      atomicWrite(SESSION_FILE, { prompted: true });
      return ok({ prompted: true, dir: DATA_DIR });
    }
    case 'detect': {
      try {
        return detect(readStdin());
      } catch (e) {
        return fail('detect 执行失败', e && e.message);
      }
    }
    case 'purify': {
      try {
        return purify(readStdin());
      } catch (e) {
        return fail('purify 执行失败', e && e.message);
      }
    }
    default:
      return usage('未知子命令：' + (cmd || '(空)') + '（支持 status/enable/disable/mark-prompted/detect/purify）');
  }
}

main();
