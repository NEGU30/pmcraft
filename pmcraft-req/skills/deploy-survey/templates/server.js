/*
 * pmcraft 问卷调研 —— 本地问卷收集服务
 * 纯 Node 内置模块（http / fs / path），无需 npm install。
 * 启动：node server.js  或双击 start.bat
 * 关闭：双击 close.bat，或对助手说“关闭服务”
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 5178;
const ROOT = __dirname;
const MOCK_DIR = path.join(ROOT, 'mock');
const DATA_FILE = path.join(MOCK_DIR, 'responses.jsonl');
const PID_FILE = path.join(MOCK_DIR, '.server.pid');

// 确保 mock/ 目录存在
if (!fs.existsSync(MOCK_DIR)) fs.mkdirSync(MOCK_DIR, { recursive: true });
// 写入 PID，供关闭脚本使用
try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch (e) {}
/* ---------- 工具 ---------- */
function beijingTime(d) {
  // 转北京时间 (UTC+8) 字符串 YYYY-MM-DD HH:mm:ss
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ` +
         `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}
function genId() {
  return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
function genPassword() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 位数字
}
function stampForFile(d) {
  // 北京时间、文件名安全（无冒号/空格）：YYYYMMDD-HHmmss
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}-` +
         `${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}
function readAll() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return fs.readFileSync(DATA_FILE, 'utf8')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter(Boolean);
}
// 按昵称去重标记：组内 submittedAt 最新一条 _kept=true（并列后入库者胜），其余 _kept=false；
// 组大小>1 的昵称，其所有行 _dupNickname=true。空昵称（终止记录）不参与去重：_kept=true、_dupNickname=false。
// 只做标记，不改磁盘数据。
function annotate(rows) {
  const groups = {};
  rows.forEach((r, i) => {
    const nk = (r.nickname || '').trim();
    if (nk) (groups[nk] = groups[nk] || []).push(i);
  });
  const keptIdx = new Set();
  const dupNick = new Set();
  Object.keys(groups).forEach(nk => {
    const idxs = groups[nk];
    if (idxs.length > 1) dupNick.add(nk);
    let best = idxs[0];
    idxs.forEach(i => {
      const a = rows[i].submittedAt || '', b = rows[best].submittedAt || '';
      if (a > b || (a === b && i > best)) best = i; // 最新胜，并列取后入库
    });
    keptIdx.add(best);
  });
  return rows.map((r, i) => {
    const nk = (r.nickname || '').trim();
    return Object.assign({}, r, {
      _dupNickname: nk ? dupNick.has(nk) : false,
      _kept: nk ? keptIdx.has(i) : true
    });
  });
}
/* ---------- 开放时间设置 + 后台密码 ---------- */
const SETTINGS_FILE = path.join(MOCK_DIR, 'settings.json');
function defaultSettings() { return { startTime: null, endTime: null, adminPassword: null, allowMulti: false }; }
function readSettings() {
  try {
    return Object.assign(defaultSettings(), JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
  }
  catch (e) { return defaultSettings(); }
}
function writeSettings(s) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }
// 确保 settings 存在且含 adminPassword（首次启动自动生成）
function initSettings() {
  const s = readSettings();
  if (!s.adminPassword) { s.adminPassword = genPassword(); writeSettings(s); }
  return readSettings();
}
initSettings();

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/* ---------- CSV 导出（从 survey.json 动态生成列）---------- */
const SURVEY_FILE = path.join(MOCK_DIR, 'survey.json');
function readSurvey() {
  try { return JSON.parse(fs.readFileSync(SURVEY_FILE, 'utf8')); }
  catch (e) { return { title: '问卷调查', adminQdef: [], skills: {} }; }
}
function genCSVCols() {
  const s = readSurvey();
  const cols = [['id','记录ID'],['submittedAt','提交时间(北京)'],['completed','是否完成'],['terminated','是否终止'],['nickname','昵称'],['empId','工号'],['dupNickname','重复昵称'],['kept','是否采纳']];
  (s.adminQdef||[]).forEach(function(q){
    var qt = q.t || q.type;  // adminQdef 契约字段为 type（旧版为 t）——与 admin.html 归一化口径一致
    if (qt === 'text' || qt === 'scale') cols.push([q.id, q.title]);
    else if (qt === 'multi') cols.push([q.id, q.title.replace(/（.*?）.*/,'')+'（多选）']);
    else if (qt === 'rank') cols.push([q.id, q.title.replace(/（.*?）.*/,'')+'（排序）']);
    else cols.push([q.id, q.title.replace(/（.*?）.*/,'')]);
  });
  // 「其他」文本列：按 survey.json boards 中带 isOther 选项的题动态生成（旧版写死 Q7/Q9——
  // 题号一变/一挪，实际填写的「其他」文本就会在导出中静默丢失，如 Q4_other / Q10_other）
  (s.boards||[]).forEach(function(b){
    (b.questions||[]).forEach(function(q){
      if ((q.options||[]).some(function(o){ return o && o.isOther; })) cols.push([q.id+'_other', q.title.replace(/（.*?）.*/,'') + ' 其他']);
    });
  });
  cols.push(['ATT_value','注意力检测值'],['ATT_passed','注意力检测通过']);
  cols.push(['durationSec','用时(秒)'],['userAgent','UA']);
  return cols;
}
function cell(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) v = v.join(';');
  v = String(v);
  if (/[",\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}
function toCSV(rows) {
  const CSV_COLS = genCSVCols();
  const head = CSV_COLS.map(function(c){return c[1];}).join(',');
  const lines = rows.map(function(r){
    const a = r.answers || {};
    var flat = {
      id: r.id, submittedAt: r.submittedAt, completed: r.completed ? '是' : '否',
      terminated: r.terminated ? '是' : '否', nickname: r.nickname, empId: r.empId || '',
      dupNickname: r._dupNickname ? '是' : '否', kept: r._kept ? '采纳' : '不采纳'
    };
    // 动态列
    (readSurvey().adminQdef||[]).forEach(function(q){
      var v = a[q.id];
      if ((q.t || q.type) === 'multi' && Array.isArray(v)) flat[q.id] = v.join(';');
      else flat[q.id] = v || '';
    });
    // 「其他」文本列：与 genCSVCols 同一取数口径（boards 中带 isOther 选项的题）
    (readSurvey().boards||[]).forEach(function(b){
      (b.questions||[]).forEach(function(q){
        if ((q.options||[]).some(function(o){ return o && o.isOther; })) flat[q.id+'_other'] = a[q.id+'_other'] || '';
      });
    });
    flat.ATT_value = r.attention ? r.attention.value : ''; flat.ATT_passed = r.attention ? (r.attention.passed ? '是' : '否') : '';
    flat.durationSec = r.meta ? r.meta.durationSec : ''; flat.userAgent = r.meta ? r.meta.userAgent : '';
    return CSV_COLS.map(function(c){return cell(flat[c[0]]);}).join(',');
  });
  return '﻿' + head + '\n' + lines.join('\n');
}

/* ---------- MD 表格导出 ---------- */
function toMD(rows, title) {
  var cols = ['ID','提交时间','昵称','工号','是否完成','重复昵称','是否采纳','用时'];
  var hdr = '| ' + cols.map(escMd).join(' | ') + ' |';
  var sep = '| ' + cols.map(function(){return '---';}).join(' | ') + ' |';
  var lines = rows.map(function(r){
    return '| ' + [r.id, r.submittedAt, r.nickname||'', r.empId||'', r.completed?'是':'否',
      r._dupNickname?'是':'否', r._kept?'采纳':'不采纳', (r.meta&&r.meta.durationSec)||''].map(escMd).join(' | ') + ' |';
  });
  return hdr + '\n' + sep + '\n' + lines.join('\n');
}
function escMd(s) { return String(s||'').replace(/\|/g,'\\|'); }

/* ---------- 路由 ---------- */
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];

  // 提交
  if (req.method === 'POST' && u === '/api/submit') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch (e) { return json(res, 400, { ok: false, error: 'invalid json' }); }
      if (!data || typeof data !== 'object') return json(res, 400, { ok: false, error: 'invalid payload' });
      // 开放时间窗口校验
      const s = readSettings();
      const n = new Date();
      if (s.startTime && n < new Date(s.startTime.replace(' ', 'T'))) return json(res, 403, { ok: false, error: 'survey not started' });
      if (s.endTime && n > new Date(s.endTime.replace(' ', 'T'))) return json(res, 403, { ok: false, error: 'survey ended' });
      // 服务端校验工号格式（终止记录无 empId，跳过）
      if (!data.terminated) {
        const mid = (data.empId || '').toString().trim();
        if (!mid || !/^\d{4,5}$/.test(mid)) return json(res, 400, { ok: false, error: 'invalid empId' });
        // 重复提交校验（allowMulti = false 时，同一工号+已完成的不允许再次提交）
        if (!s.allowMulti) {
          var existing = readAll();
          var dup = existing.find(function(r){ return r.empId === mid && r.completed && !r.terminated; });
          if (dup) return json(res, 403, { ok: false, error: 'duplicate submission', existingId: dup.id });
        }
      }
      const rec = {
        id: genId(),
        submittedAt: beijingTime(new Date()),
        completed: !!data.completed,
        terminated: !!data.terminated,
        nickname: (data.nickname || '').toString().slice(0, 100),
        empId: (data.empId || '').toString().trim().slice(0, 10),
        answers: data.answers || {},
        attention: data.attention || null,
        meta: data.meta || {}
      };
      try {
        fs.appendFileSync(DATA_FILE, JSON.stringify(rec) + '\n');
        json(res, 200, { ok: true, id: rec.id });
      } catch (e) {
        json(res, 500, { ok: false, error: 'write failed' });
      }
    });
    return;
  }

  // 取数（结果后台用）
  if (req.method === 'GET' && u === '/api/responses.json') {
    return json(res, 200, annotate(readAll()));
  }

  // CSV 导出
  if (req.method === 'GET' && u === '/api/export.csv') {
    const csv = toCSV(annotate(readAll()));
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="pmcraft-survey-responses.csv"'
    });
    res.end(csv);
    return;
  }

  // 问卷配置（survey.json）
  if (req.method === 'GET' && u === '/api/survey.json') {
    return json(res, 200, readSurvey());
  }

  // 开放时间设置读写
  if (req.method === 'GET' && u === '/api/settings') {
    return json(res, 200, readSettings());
  }
  if (req.method === 'POST' && u === '/api/settings') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(body), cur = readSettings();
        cur.startTime = d.startTime || null;
        cur.endTime = d.endTime || null;
        if (typeof d.allowMulti === 'boolean') cur.allowMulti = d.allowMulti;
        writeSettings(cur);
        return json(res, 200, { ok: true });
      } catch (e) { return json(res, 400, { ok: false, error: 'invalid settings' }); }
    });
    return;
  }

  // 后台密码相关
  if (req.method === 'POST' && u === '/api/admin/login') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try { const d = JSON.parse(body); const s = readSettings(); return json(res, 200, { ok: d.password === s.adminPassword }); }
      catch (e) { return json(res, 400, { ok: false, error: 'invalid' }); }
    });
    return;
  }
  if (req.method === 'GET' && u === '/api/admin/meta') {
    // 返回是否设置了密码（不暴露密码本身）
    return json(res, 200, { hasPassword: !!readSettings().adminPassword });
  }

  // MD 表格导出
  if (req.method === 'GET' && u === '/api/export.md') {
    const rows = annotate(readAll());
    const now = beijingTime(new Date());
    var _stitle = readSurvey().title || '问卷调查';
    var md = '# ' + _stitle + ' - 答卷数据\n\n';
    md += '**导出时间**: ' + now + '  |  **总记录**: ' + rows.length + '  |  **采纳**: ' + rows.filter(function(r){return r._kept;}).length + '\n\n';
    md += toMD(rows) + '\n\n---\n\n';
    // 逐题统计摘要
    md += '### 统计摘要\n\n';
    var doneKept = rows.filter(function(r){return r._kept && r.completed;});
    var attPass = doneKept.filter(function(r){return r.attention && r.attention.passed;}).length;
    // NPS 题数据驱动：取 adminQdef 中 nps:true 的 0-10 量表题（可多题并存，各出一行）；未标记时回退旧口径 Q10（兼容存量问卷）
    var npsQs = (readSurvey().adminQdef||[]).filter(function(q){ var t=q.t||q.type; return q.nps && t==='scale'; });
    if (!npsQs.length) npsQs = [{ id: 'Q10', title: '' }];
    md += '| 指标 | 值 |\n| --- | --- |\n';
    md += '| 有效完成 | ' + doneKept.length + ' |\n';
    md += '| ATT 通过率 | ' + (doneKept.length ? Math.round(attPass/doneKept.length*100) + '%' : '—') + ' |\n';
    npsQs.forEach(function(nq){
      var label = (npsQs.length > 1 && nq.title) ? '（' + nq.title + '）' : '';
      var npsVals = doneKept.map(function(r){return r.answers&&r.answers[nq.id];}).filter(function(v){return typeof v==='number'&&v>=0&&v<=10;});
      var p = npsVals.filter(function(v){return v>=9;}).length, d = npsVals.filter(function(v){return v<=6;}).length;
      var nps = npsVals.length ? Math.round((p-d)/npsVals.length*100) : '—';
      md += '| NPS' + label + ' | ' + nps + ' |\n';
      md += '| 推荐者/中立/贬损' + label + ' | ' + p + '/' + (npsVals.length-p-d) + '/' + d + ' |\n';
    });
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="pmcraft-survey-responses.md"' });
    res.end(md);
    return;
  }

  // 清空数据（安全：先归档到 mock/archive/ 再清空，软删可恢复）
  if (req.method === 'POST' && u === '/api/clear') {
    try {
      const count = readAll().length;
      if (fs.existsSync(DATA_FILE) && count > 0) {
        const ARCHIVE_DIR = path.join(MOCK_DIR, 'archive');
        if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
        const name = 'responses-' + stampForFile(new Date()) + '.jsonl';
        fs.copyFileSync(DATA_FILE, path.join(ARCHIVE_DIR, name)); // 先归档
        fs.writeFileSync(DATA_FILE, '');                          // 再清空（保留空文件）
        return json(res, 200, { ok: true, count, archive: 'mock/archive/' + name });
      }
      return json(res, 200, { ok: true, count: 0, archive: null });
    } catch (e) {
      return json(res, 500, { ok: false, error: 'clear failed' });
    }
  }

  // 静态页面
  if (req.method === 'GET') {
    if (u === '/' || u === '/index.html') return serveFile(res, path.join(ROOT, 'index.html'));
    if (u === '/admin' || u === '/admin.html') return serveFile(res, path.join(ROOT, 'admin.html'));
    // 允许 working/ 下的白名单静态资源
    const safe = u.replace(/^\/+/, '').replace(/\.\.+/g, '');
    if (/^[\w.-]+\.(css|js|html)$/.test(safe)) return serveFile(res, path.join(ROOT, safe));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

function lanIPv4() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPv4();
  console.log('====================================================');
  console.log('  pmcraft survey - server started');
  console.log('  Local test :  http://localhost:' + PORT + '/');
  if (ips.length) {
    console.log('  ---- Send this link to respondents (same LAN) ----');
    ips.forEach(ip => console.log('  Fill page  :  http://' + ip + ':' + PORT + '/'));
    if (ips.length > 1) console.log('  (Multiple NICs: pick the IP on the same subnet as them)');
  } else {
    console.log('  (No LAN IP detected - maybe offline)');
  }
  console.log('  Results    :  http://localhost:' + PORT + '/admin');
  var _p = readSettings().adminPassword || 'none';
  console.log('  Admin pwd  :  ' + _p + '  (needed for /admin)');
  console.log('  Data file  :  mock/responses.jsonl');
  console.log('  First LAN access needs firewall: run allow-firewall.bat as admin');
  console.log('  Stop server:  double-click close.bat');
  console.log('====================================================');
});

// 优雅退出：清理 PID
function cleanup() { try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {} process.exit(0); }
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
