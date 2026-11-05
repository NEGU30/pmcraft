/**
 * .gen_survey.js — survey.json 结构校验脚本
 *
 * 用法：node .gen_survey.js <survey.json 路径>
 * 退出码：0 = 通过，1 = 校验失败
 *
 * 校验规则：
 *   1. 必需顶层字段：title, intro, thanks, terminate, boards
 *   2. intro：必须有 title + leadHtml
 *   3. thanks：必须有 title + body
 *   4. terminate：必须有 title + body
 *   5. boards 为非空数组
 *   6. 每个 question：id, type, title 必须存在
 *   7. type 合法值：single, multi, scale, text, textarea, matrix, likert5, likert7, rank
 *   8. single/multi/rank 题必须有 options 数组（rank 可另配 min/max，见 12）
 *   9. options 每项必须有 v 和 label
 *   10. scale 类型必须有 ends 数组
 *   11. matrix 类型必须有 rows 和 cols
 *   12. rank 可选 min/max（数字，max≥min≥1）；rank/single/multi 可选 filterBy
 *       （字符串，须引用问卷中真实存在的 multi 题 id——选项按该题已勾选项过滤）
 *   13. condition 中 a.<题id>.indexOf('<字母>') 引用的字母必须存在于该题（否则 error）；
 *       引用非互斥项时给出 warn（疑似选项重排后旧版「以上都没有」残留）
 *   14. boards 中的题（保留 ID 除外）应登记进 adminQdef，缺则 warn（否则后台逐题分布静默漏题）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node .gen_survey.js <survey.json>');
  process.exit(1);
}

if (!fs.existsSync(file)) {
  console.error('FAIL: file not found — ' + file);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf-8'));
} catch (e) {
  console.error('FAIL: invalid JSON — ' + e.message);
  process.exit(1);
}

const errors = [];
const warns = [];
const VALID_TYPES = new Set(['single', 'multi', 'scale', 'text', 'textarea', 'matrix', 'likert5', 'likert7', 'rank']);
const LIKERT5_DEFAULT = ['非常不同意','不同意','一般','同意','非常同意'];
const LIKERT7_DEFAULT = ['非常不同意','不同意','比较不同意','一般','比较同意','同意','非常同意'];
const VALID_SURVEY_TYPES = new Set(['internal', 'external']);

// ===== 1. 顶层字段 =====
if (!data.title) errors.push('Missing top-level field: title');

// type（可选，内部/外部标识）
if (data.type && !VALID_SURVEY_TYPES.has(data.type)) {
  warns.push('type: "' + data.type + '" is not a standard value (expected "internal" or "external")');
}

// intro
if (!data.intro) {
  errors.push('Missing top-level field: intro (must be object with title + leadHtml)');
} else {
  if (!data.intro.title) errors.push('intro: missing title');
  if (!data.intro.leadHtml) errors.push('intro: missing leadHtml (HTML string for the cover page)');
}

// thanks
if (!data.thanks) {
  errors.push('Missing top-level field: thanks (must be object with title + body)');
} else {
  if (!data.thanks.title) errors.push('thanks: missing title');
  if (!data.thanks.body) errors.push('thanks: missing body');
}

// terminate
if (!data.terminate) {
  errors.push('Missing top-level field: terminate (must be object with title + body)');
} else {
  if (!data.terminate.title) errors.push('terminate: missing title');
  if (!data.terminate.body) errors.push('terminate: missing body');
}

// boards
if (!Array.isArray(data.boards) || data.boards.length === 0) {
  errors.push('Missing or empty top-level field: boards (must be non-empty array)');
}

// ===== 2. 逐板块逐题校验 =====
if (Array.isArray(data.boards)) {
  let qCount = 0;
  data.boards.forEach((board, bi) => {
    const bLabel = board.id || ('boards[' + bi + ']');
    if (!Array.isArray(board.questions) || board.questions.length === 0) {
      errors.push(bLabel + ': questions is missing or empty');
      return;
    }
    board.questions.forEach((q, qi) => {
      qCount++;
      const qLabel = bLabel + '.questions[' + qi + ']' + (q.id ? ' (' + q.id + ')' : '');

      if (!q.id) errors.push(qLabel + ': missing id');
      if (!q.type) errors.push(qLabel + ': missing type');
      if (!q.title) errors.push(qLabel + ': missing title');

      if (q.type && !VALID_TYPES.has(q.type)) {
        errors.push(qLabel + ': invalid type "' + q.type + '" (allowed: ' + [...VALID_TYPES].join(', ') + ')');
      }

      // single/multi/rank 必须有 options
      if ((q.type === 'single' || q.type === 'multi' || q.type === 'rank') && q.skills !== true) {
        if (!Array.isArray(q.options) || q.options.length === 0) {
          errors.push(qLabel + ': single/multi question must have options array');
        } else {
          q.options.forEach((opt, oi) => {
            if (!opt.hasOwnProperty('v') || !opt.label) {
              errors.push(qLabel + '.options[' + oi + ']: must have both v and label');
            }
          });
        }
      }

      // scale 必须有 ends
      if (q.type === 'scale') {
        if (!Array.isArray(q.ends) || q.ends.length < 2) {
          errors.push(qLabel + ': scale question must have ends array with 2 items (e.g. ["极不可能","非常可能"])');
        }
      }

      // likert5/likert7 校验
      if (q.type === 'likert5' || q.type === 'likert7') {
        const expected = q.type === 'likert5' ? 5 : 7;
        const defaults = q.type === 'likert5' ? LIKERT5_DEFAULT : LIKERT7_DEFAULT;
        if (q.labels) {
          if (!Array.isArray(q.labels)) {
            errors.push(qLabel + ': labels must be an array');
          } else if (q.labels.length !== expected) {
            errors.push(qLabel + ': likert' + expected + ' requires exactly ' + expected + ' labels, got ' + q.labels.length);
          }
        }
      }

      // matrix 必须有 rows + cols
      if (q.type === 'matrix') {
        if (!Array.isArray(q.rows) || q.rows.length === 0) {
          errors.push(qLabel + ': matrix question must have rows');
        } else {
          q.rows.forEach(function(r, ri) {
            if (typeof r !== 'string') errors.push(qLabel + '.rows[' + ri + ']: must be a string, got ' + typeof r);
          });
        }
        if (!Array.isArray(q.cols) || q.cols.length === 0) {
          errors.push(qLabel + ': matrix question must have cols');
        } else {
          q.cols.forEach(function(c, ci) {
            if (typeof c !== 'string') errors.push(qLabel + '.cols[' + ci + ']: must be a string (the display label), got ' + typeof c + ' — use e.g. "cols": ["满意","不满意"] not objects like {v:"1", label:"满意"}');
          });
        }
      }

      // multi + max 警告（非 error）
      if (q.type === 'multi' && q.max) {
        if (typeof q.max !== 'number' || q.max < 1) {
          errors.push(qLabel + ': max must be a positive number');
        } else if (q.options && q.options.length < q.max) {
          warns.push(qLabel + ': max (' + q.max + ') exceeds option count (' + q.options.length + ')');
        }
      }

      // rank 排序题校验：filterBy（字符串，引用某 multi 题 id）+ min/max（max≥min≥1）
      if (q.type === 'rank') {
        if (q.filterBy !== undefined && typeof q.filterBy !== 'string') {
          errors.push(qLabel + ': rank filterBy must be a string (id of the multi question to filter options by), got ' + typeof q.filterBy);
        }
        if (q.min !== undefined && (typeof q.min !== 'number' || q.min < 1)) {
          errors.push(qLabel + ': rank min must be a positive number');
        }
        if (q.max !== undefined && (typeof q.max !== 'number' || q.max < 1)) {
          errors.push(qLabel + ': rank max must be a positive number');
        }
        if (typeof q.min === 'number' && typeof q.max === 'number' && q.max < q.min) {
          errors.push(qLabel + ': rank max (' + q.max + ') must be >= min (' + q.min + ')');
        }
        if (typeof q.min === 'number' && q.options && q.options.length < q.min) {
          warns.push(qLabel + ': rank min (' + q.min + ') exceeds option count (' + q.options.length + ')');
        }
      }

      // 条件逻辑的 condition 字段存在性（非 error，仅 warn）
      if (q.condition && typeof q.condition !== 'string') {
        warns.push(qLabel + ': condition should be a string (function body), got ' + typeof q.condition);
      }
    });
  });
  if (qCount === 0) errors.push('No questions found across all boards');
}

// ===== 3. adminQdef 建议（warning） =====
if (!Array.isArray(data.adminQdef) || data.adminQdef.length === 0) {
  warns.push('adminQdef is missing or empty — admin dashboard charts will be limited.');
} else {
  // 检查 adminQdef 与 boards 中的题号是否一致
  const boardQids = new Set();
  (data.boards || []).forEach(b => (b.questions || []).forEach(q => boardQids.add(q.id)));
  data.adminQdef.forEach((q, i) => {
    if (!q.id) warns.push('adminQdef[' + i + ']: missing id');
    else if (!boardQids.has(q.id)) warns.push('adminQdef: "' + q.id + '" not found in any board question');
  });
}

// ===== 4. 模板引擎保留 ID 校验 =====
//
// index.html 的 buildPayload() 和 server.js 依赖以下固定 ID：
//   nickname → 作为顶层字段提交，不能是普通的 answers 键
//   empId   → 同上，且服务端校验 \d{4,5} 格式
//   ATT      → 前端特殊处理（不放入 answers，单独作为 attention 对象）
const RESERVED_IDS = new Set(['nickname', 'empId', 'ATT', 'S1']);

// 辅助：通过 id 查找 question
function findQById(data, qid) {
  for (const b of (data.boards || [])) {
    const q = (b.questions || []).find(x => x.id === qid);
    if (q) return q;
  }
  return null;
}

// 收集所有 question id
const allQids = new Set();
(data.boards || []).forEach(b => (b.questions || []).forEach(q => allQids.add(q.id)));

// 4a. 内部问卷必须有 nickname + empId
if (data.type === 'internal') {
  if (!allQids.has('nickname')) {
    errors.push('internal survey MUST have a text question with id="nickname" for the nickname field');
  }
  if (!allQids.has('empId')) {
    errors.push('internal survey MUST have a text question with id="empId" for the mars ID (star ID) field');
  }
}

// 4b. empId 必须为 text 类型、有 pattern 校验
if (allQids.has('empId')) {
  const marsQ = findQById(data, 'empId');
  if (marsQ) {
    if (marsQ.type !== 'text') {
      errors.push('empId question must be type "text", got "' + marsQ.type + '"');
    }
    if (!marsQ.pattern) {
      warns.push('empId question should have pattern: "^\\\\d{4,5}$" for client-side format validation');
    }
  }
}

// 4c. nickName 必须为 text 类型（兜底）
if (allQids.has('nickname')) {
  const nickQ = findQById(data, 'nickname');
  if (nickQ && nickQ.type !== 'text') {
    errors.push('nickname question must be type "text", got "' + nickQ.type + '"');
  }
}

// 4d. 如果存在 ATT 题，必须是 scale 类型且有 attNote
if (allQids.has('ATT')) {
  const attQ = findQById(data, 'ATT');
  if (attQ) {
    if (attQ.type !== 'scale') {
      errors.push('ATT (attention check) question must be type "scale", got "' + attQ.type + '"');
    }
    if (!attQ.attNote) {
      warns.push('ATT (attention check) question should have "attNote" for visible instruction text');
    }
  }
}

// 4e. 检查其他保留 ID 未被误用（非 text/textarea 不应使用 S1）
if (allQids.has('S1')) {
  const s1q = findQById(data, 'S1');
  if (s1q && !['single', 'multi'].includes(s1q.type)) {
    warns.push('S1 is a reserved question id used for conditional screening; it is typically a single/multi type, got "' + (s1q.type || '?') + '"');
  }
}

// 4f. filterBy（rank / single / multi 通用）必须引用问卷中真实存在的 multi 题
(data.boards || []).forEach(function(b){ (b.questions || []).forEach(function(q){
  if (!q.filterBy) return;
  if (!allQids.has(q.filterBy)) {
    errors.push('question "' + q.id + '": filterBy "' + q.filterBy + '" not found in any board question');
  } else {
    const src = findQById(data, q.filterBy);
    if (src && src.type !== 'multi') {
      errors.push('question "' + q.id + '": filterBy must reference a multi question, "' + q.filterBy + '" is ' + src.type);
    }
  }
});});

// 4g. boards 中的题（保留 ID 除外）应登记进 adminQdef，否则后台逐题分布会静默漏题
//     —— 反向检查（adminQdef 里有、boards 里没有）见第 3 节；此处补正向检查。
if (Array.isArray(data.adminQdef) && data.adminQdef.length > 0) {
  const adminIds = new Set(data.adminQdef.map(x => x && x.id).filter(Boolean));
  allQids.forEach(function(qid){
    if (!RESERVED_IDS.has(qid) && !adminIds.has(qid)) {
      warns.push('adminQdef: question "' + qid + '" is missing — its distribution will not show in the admin dashboard');
    }
  });
}

// 4h. condition 中 a.<题id>.indexOf('<字母>') < 0 的引用校验
//     - 字母不存在于被引用题 → error（条件恒真/恒假，逻辑静默失效）
//     - 字母存在但不是互斥项 → warn（疑似选项重排后旧版「以上都没有」残留，如 N→Q）
const COND_IDX_RE = /a\.([A-Za-z0-9_]+)\.indexOf\(\s*(['"])([A-Z])\2\s*\)/g;
(data.boards || []).forEach(function(b){ (b.questions || []).forEach(function(q){
  if (typeof q.condition !== 'string') return;
  let m; COND_IDX_RE.lastIndex = 0;
  while ((m = COND_IDX_RE.exec(q.condition)) !== null) {
    const refId = m[1], letter = m[3];
    const refQ = findQById(data, refId);
    if (!refQ) { warns.push('condition of "' + q.id + '": references unknown question "' + refId + '"'); continue; }
    const hit = (refQ.options || []).find(o => o.v === letter);
    if (!hit) {
      errors.push('condition of "' + q.id + '": option "' + letter + '" not found in question "' + refId + '" — condition will never match as intended');
    } else if (!hit.exclusive) {
      warns.push('condition of "' + q.id + '": hides itself when non-exclusive option "' + letter + '" of "' + refId + '" is selected — if this used to mean "以上都没有", update the letter after option reordering');
    }
  }
});});

// ===== 5. 汇报 =====
if (errors.length > 0) {
  console.error('FAIL: ' + errors.length + ' validation error(s):');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}

if (warns.length > 0) {
  console.log('WARN: ' + warns.length + ' warning(s):');
  warns.forEach(w => console.log('  - ' + w));
}

console.log('OK: survey.json is valid.');
if (data.boards) {
  const totalQ = data.boards.reduce((sum, b) => sum + (b.questions ? b.questions.length : 0), 0);
  console.log('  title: ' + data.title);
  console.log('  boards: ' + data.boards.length);
  console.log('  questions: ' + totalQ);
}
process.exit(0);
