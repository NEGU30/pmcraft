/**
 * readme-portal.cjs — README.md → HTML 门户生成器（save-doc 内嵌模块，零 LLM 参与）
 *
 * 由 save-doc.js 的 refreshReadme() 末尾同进程调用：buildPortal({ versionDir, funcName, version })。
 * 数据源 = {版本目录}/_README/README.md（refreshReadme 刚写盘的《评审与开发必读指南》）。
 * 产出（全部在 _README/ 内，与 README.md 同生命周期）：
 *   1. _README/README.html                     门户入口（分区卡片可点读、原型直达启动器）
 *   2. _README/<子目录>/<同名>.html            README 表中所列文档的烘焙阅读页（镜像源结构，含 _ 前缀系统文件的快照页）
 *   3. _README/assets/{doc.css, mermaid.min.js, portal-zoom.js}（与技能 assets 同步，大小不同才覆盖）
 *
 * 兼容：存量项目 README.md 在版本目录顶层的"吸收"收编由 save-doc.js refreshReadme 负责（写盘前执行）。
 * 离线：marked（生成期 require 技能 assets）与 mermaid（浏览器端本地文件）均随插件分发，零网络。
 * 约束：本模块被 save-doc 进程加载——**禁止任何 console 输出**（save-doc 的 stdout 是 JSON 契约通道）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const SKILL_ASSETS = path.resolve(__dirname, '..', '..', 'assets', 'readme-portal');  // 技能资产源（锚定 __dirname，不依赖 cwd）
const { Marked } = require(path.join(SKILL_ASSETS, 'marked.cjs'));

// 由 buildPortal() 按次赋值（模块级函数共享）
let README_DIR = '';                                    // …/{版本}/_README
let ROOT = '';                                          // 版本目录 …/{版本}
let OUT_INDEX = '';                                     // _README/README.html
let ASSETS = '';                                        // _README/assets
let FUNC_SIG = '';                                      // "{功能名} {版本}"（页面标题后缀）
let BUILT_AT = '';                                      // 本次门户构建时间（系统文件快照标注用，buildPortal 赋值）

/* ---------- 基础工具 ---------- */

const readUtf8 = p =>
  fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

const posix = p => p.split(path.sep).join('/');

const relFrom = (fromDir, toAbs) => posix(path.relative(fromDir, toAbs));

const escAttr = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escHtml = s => escAttr(s).replace(/'/g, '&#39;');
const stripTags = s => String(s).replace(/<[^>]*>/g, '');

const now = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/* ---------- 1) 解析 README.md（数据源） ---------- */

/**
 * 返回 { title, intro[], sections:[{ name, kind:'table'|'none', rows:[{label, raw, type, rel}] }] }
 * type: 'md'（.md 文档）| 'proto'（prototype/ 目录）| 'dir'（普通目录）| 'missing'（未产出）
 */
function parseReadme() {
  const md = readUtf8(path.join(README_DIR, 'README.md'));
  const lines = md.split('\n');

  let title = '';
  const intro = [];
  const sections = [];
  let cur = null;

  for (const line of lines) {
    if (!title && /^# /.test(line)) { title = line.replace(/^# /, '').trim(); continue; }
    if (/^> /.test(line) && !cur) { intro.push(line.replace(/^> ?/, '').trim()); continue; }
    const h2 = line.match(/^## (.+)$/);
    if (h2) { cur = { name: h2[1].trim(), kind: 'none', rows: [] }; sections.push(cur); continue; }
    if (!cur || !/^\|/.test(line)) continue;
    if (/^\|[\s:|-]+\|$/.test(line)) continue;                    // 分隔行 |:---|:---|
    const cells = line.slice(1, -1).split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
    if (cells.length < 2) continue;
    if (cells[0] === '文档') { cur.kind = 'table'; continue; }    // 表头行
    const label = cells[0];
    const m = cells[1].match(/`([^`]+)`/);
    if (!m) { cur.rows.push({ label, raw: cells[1], type: 'missing' }); continue; }
    const p = m[1];
    const type = /^prototype\//.test(p) ? 'proto'
      : p.endsWith('/') ? 'dir'
      : p.endsWith('.md') ? 'md'
      : 'missing';
    cur.rows.push({ label, raw: p, type, rel: p.replace(/\/$/, '') });
    cur.kind = 'table';
  }
  return { title: title || '评审与开发必读指南', intro, sections };
}

/* ---------- 2) 单文档烘焙 ---------- */

const bakedHref = rel => rel.replace(/\.md$/, '') + '.html';   // README.html 与烘焙页同在 readme/ 内，相对链接无前缀

/** 源 md 内相对引用 → 烘焙页内可用相对路径 */
function rewriteRel(pageDir, srcAbs, href) {
  const resolved = path.resolve(path.dirname(srcAbs), href.split('#')[0]);
  return relFrom(pageDir, resolved);
}

/** 裸文件名 → 版本目录一层子目录中查找同名 .md（文档间引用常省略子目录前缀） */
function findByName(name) {
  for (const d of fs.readdirSync(ROOT)) {
    const dp = path.join(ROOT, d);
    if (!fs.statSync(dp).isDirectory()) continue;
    if (d.startsWith('_') || d === 'prototype' || d === 'screenshots') continue;
    const cand = path.join(dp, name);
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

/** 路径文本 → 对应烘焙 html 的相对链接；解析候选（源 md 目录、版本目录、子目录同名查找），烘焙页不存在返回 null */
function resolveDocHref(pageDir, srcAbs, p) {
  const candidates = [path.resolve(path.dirname(srcAbs), p.split('#')[0]), path.resolve(ROOT, p.split('#')[0])];
  const byName = findByName(p.split('#')[0].replace(/^.*[\\/]/, ''));
  if (byName) candidates.push(byName);
  for (const resolved of candidates) {
    if (resolved.startsWith(ROOT) && resolved.endsWith('.md') && fs.existsSync(resolved)) {
      const rel = relFrom(ROOT, resolved);
      const baked = path.join(README_DIR, rel.replace(/\.md$/, '') + '.html');
      if (fs.existsSync(baked)) return relFrom(pageDir, baked);
    }
  }
  return null;
}

/** 站内 .md 链接 → 对应烘焙 html（防御：当前文档间互链为 0，兜未来） */
function rewriteMdLink(pageDir, srcAbs, href) {
  const hash = href.includes('#') ? '#' + href.split('#').slice(1).join('#') : '';
  const plain = href.split('#')[0];
  const target = resolveDocHref(pageDir, srcAbs, plain);
  if (target) return target + hash;
  return rewriteRel(pageDir, srcAbs, plain) + hash;
}

function bakeDoc(rel) {
  const srcAbs = path.join(ROOT, rel);
  const pageDir = path.dirname(path.join(README_DIR, rel));   // 镜像目录 …/readme/<子目录>
  fs.mkdirSync(pageDir, { recursive: true });

  const md = readUtf8(srcAbs);
  const h1 = md.match(/^#\s+(.+)$/m);
  const docTitle = h1 ? stripTags(h1[1]).trim() : path.basename(rel, '.md');

  const toc = [];
  let n = 0;
  const renderer = {
    code(text, lang) {
      if (lang && lang.trim().toLowerCase().startsWith('mermaid')) {
        // 剥离 fa:fa-xxx 角色图标前缀（mermaid 9.4.3 无 Font Awesome，图标仅留空位）
        let cleaned = text.replace(/fa:fa-[A-Za-z0-9-]+\s+/g, '');
        // 规范化裸中文 subgraph 标题（v9 不支持 subgraph 中文 → subgraph sgN["中文"]）
        let sg = 0;
        cleaned = cleaned.replace(/(^|\n)([ \t]*)subgraph[ \t]+([^[\]"#\n]+?)[ \t]*(?=\n)/g,
          (m, nl, ind, title) => nl + ind + 'subgraph sgfix' + (++sg) + '["' + title.trim() + '"]');
        // 边标签加引号：裸 |label| 遇全角标点会 Lexical error，|"label"| 内任意字符安全（已带引号的不动）
        cleaned = cleaned.replace(/\|([^"|\n]+)\|/g, (m, label) => '|"' + label.trim() + '"|');
        return '<figure class="diagram"><div class="mermaid">' + escHtml(cleaned) + '</div>'
          + '<button type="button" class="diagram-zoom" hidden>⤢ 放大</button></figure>';
      }
      return '<pre><code>' + escHtml(text) + '</code></pre>';
    },
    heading(text, depth) {
      n += 1;
      if (depth >= 2 && depth <= 3) toc.push({ id: 'sec-' + n, depth, text: stripTags(text).trim() });
      return `<h${depth} id="sec-${n}">${text}</h${depth}>`;
    },
    image(href, title, text) {
      const t = title ? ` title="${escAttr(title)}"` : '';
      return `<img src="${escAttr(rewriteRel(pageDir, srcAbs, href))}" alt="${escAttr(text || '')}"${t}>`;
    },
    link(href, title, text) {
      if (href && !/^(https?:|#|mailto:)/.test(href) && /\.md(\?|#|$)/.test(href)) {
        href = rewriteMdLink(pageDir, srcAbs, href);
      }
      const t = title ? ` title="${escAttr(title)}"` : '';
      return `<a href="${escAttr(href)}"${t}>${text}</a>`;
    },
  };

  const m = new Marked({ gfm: true, renderer });
  const body = m.parse(md);
  const hasMermaid = body.includes('class="mermaid"');

  const back = relFrom(pageDir, OUT_INDEX);
  // 系统文件（_ 前缀，如 _进度清单.md）：其渲染页是「门户构建时的快照」——清单由路由大脑随时刷新、
  // 刷新不触发门户重建，故面包屑右侧标注快照时间，并给「实时源文件」出口，读者可自行判断是否滞后。
  const isSystem = path.basename(rel).startsWith('_');
  const snapNote = isSystem
    ? `<span class="snap-note">本页为 ${escHtml(BUILT_AT)} 的门户快照 · <a href="${escAttr(relFrom(pageDir, path.join(ROOT, rel)))}">打开实时源文件</a></span>`
    : '';
  const css = relFrom(pageDir, path.join(ASSETS, 'doc.css'));
  const mjs = relFrom(pageDir, path.join(ASSETS, 'mermaid.min.js'));
  const zjs = relFrom(pageDir, path.join(ASSETS, 'portal-zoom.js'));   // 图表放大查看（仅含图页引入）
  const tocHtml = toc.length
    ? '<details class="toc" open><summary>目录</summary><ul>'
      + toc.map(t => `<li class="lv${t.depth}"><a href="#${t.id}">${escHtml(t.text)}</a></li>`).join('')
      + '</ul></details>'
    : '';

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(docTitle)} — ${escHtml(FUNC_SIG)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="${escAttr(css)}">
</head>
<body>
<nav class="breadcrumb${tocHtml ? ' has-toc' : ''}"><div class="inner"><a class="back" href="${escAttr(back)}">返回必读指南</a>${snapNote}</div></nav>
<div class="doc-wrap${tocHtml ? ' has-toc' : ''}">
${tocHtml ? `<aside class="toc-side">${tocHtml}</aside>` : ''}
<article class="doc">
${body}
</article>
</div>
${hasMermaid ? `<script src="${escAttr(mjs)}"></script>
<script>
mermaid.initialize({
  startOnLoad: true,
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
  flowchart: { htmlLabels: true },
  securityLevel: 'strict'
});
</script>
<script src="${escAttr(zjs)}"></script>` : ''}
</body>
</html>
`;
  const out = path.join(README_DIR, rel.replace(/\.md$/, '') + '.html');
  fs.writeFileSync(out, html, 'utf8');
  return { rel, out, hasMermaid };
}

/** 第二遍后处理：站内 .md 路径文本可点化（须在全部烘焙页就位后执行——被引用文档可能后于引用页烘焙） */
function linkifyDocs(rels) {
  for (const rel of rels) {
    const srcAbs = path.join(ROOT, rel);
    const pageDir = path.dirname(path.join(README_DIR, rel));
    const out = path.join(README_DIR, rel.replace(/\.md$/, '') + '.html');
    let html = fs.readFileSync(out, 'utf8');
    html = html.replace(/<code>([^<\s]*\.md)<\/code>/g, (mt, p) => {
      const href = resolveDocHref(pageDir, srcAbs, p);
      return href ? '<a href="' + escAttr(href) + '"><code>' + p + '</code></a>' : mt;
    });
    // 「（最新：xxx.md」引用模式（PRD 第 8 章图路径等 span 裸文本）
    html = html.replace(/（最新：([^<）\s]+\.md)/g, (mt, p) => {
      const href = resolveDocHref(pageDir, srcAbs, p);
      return href ? '（最新：<a href="' + escAttr(href) + '">' + p + '</a>' : mt;
    });
    fs.writeFileSync(out, html, 'utf8');
  }
}

/* ---------- 4) 门户页（README.html） ---------- */

function cardHtml(row, num) {
  const numBadge = num ? `<span class="num">${num}</span>` : '';
  if (row.type === 'missing') {
    return `<div class="card is-missing">${numBadge}<div class="label">${escHtml(row.label)}</div><div class="path">未产出</div></div>`;
  }
  if (row.type === 'proto') {
    const target = relFrom(README_DIR, path.join(ROOT, row.rel, 'index.html'));   // prototype/main → ../prototype/main/index.html
    return `<a class="card" href="${escAttr(target)}">${numBadge}<div class="label">${escHtml(row.label)}<span class="badge-req">启动器</span></div><div class="path">${escHtml(row.raw)}</div><div class="desc">打开原型入口页（index.html），本地双击可直接浏览交互</div></a>`;
  }
  if (row.type === 'dir') {
    const dirAbs = path.join(ROOT, row.rel);
    const children = fs.readdirSync(dirAbs).filter(f => f.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
    const links = children.map(f => {
      const rel = row.rel + '/' + f;
      return `<a href="${escAttr(bakedHref(rel))}">${escHtml(f.replace(/\.md$/, ''))}</a>`;
    }).join('');
    return `<div class="card">${numBadge}<div class="label">${escHtml(row.label)}</div><div class="path">${escHtml(row.raw)}</div><div class="children">${links}</div></div>`;
  }
  if (row.type === 'md' && row.rel.startsWith('_')) {
    // 系统文件（_进度清单.md 等）：由路由大脑动态维护、刷新不触发门户重建——烘焙快照会滞后。
    // 双入口：①「渲染版」= 门户构建时的烘焙快照（卡片与页内均标注快照时间，读者可判断新鲜度）
    //         ②「实时源文件」= 直开 .md 源文件，恒为最新（浏览器 file:// 按纯文本显示）
    const liveHref = relFrom(README_DIR, path.join(ROOT, row.rel));
    return `<div class="card">${numBadge}<div class="label">${escHtml(row.label)}</div><div class="path">${escHtml(row.raw)}</div>`
      + `<div class="children"><a href="${escAttr(bakedHref(row.rel))}">渲染版</a><a href="${escAttr(liveHref)}">实时源文件</a></div>`
      + `<div class="desc">渲染版为 ${escHtml(BUILT_AT)} 的门户快照；本文件由 pmcraft 随时刷新，以实时源文件为准</div></div>`;
  }
  return `<a class="card" href="${escAttr(bakedHref(row.rel))}">${numBadge}<div class="label">${escHtml(row.label)}</div><div class="path">${escHtml(row.raw)}</div></a>`;
}

function renderIndex(parsed) {
  const introHtml = parsed.intro.length
    ? '<div class="info-banner">' + parsed.intro.map(l => `<p>${escHtml(l)}</p>`).join('') + '</div>'
    : '';

  const sectionsHtml = parsed.sections.map(sec => {
    const head = `<div class="section-title">${escHtml(sec.name)}<span class="count">${sec.kind === 'table' ? sec.rows.length + ' 项' : ''}</span></div>`;
    let body;
    if (sec.kind !== 'table' || !sec.rows.length) {
      body = '<p class="none-note">（无）</p>';
    } else {
      body = '<div class="cards">' + sec.rows.map((row, i) => cardHtml(row, i + 1)).join('\n') + '</div>';
    }
    return head + body;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(parsed.title)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="assets/doc.css">
</head>
<body>
<header class="portal-header"><div class="inner">
<h1 class="portal-title">${escHtml(parsed.title)}</h1>
<div class="portal-sub">HTML 门户 · 由 README.md 生成 · 文档名点击即读，原型直达启动器</div>
</div></header>
<main class="portal-main">
${introHtml}
${sectionsHtml}
<footer class="portal-footer">由 pmcraft save-doc 自动生成于 ${now()} · 文档保存后自动刷新</footer>
</main>
</body>
</html>
`;
}

/* ---------- buildPortal（模块入口） ---------- */

/** 版本资产：_README/assets/ 与技能 assets 同步（大小不同才覆盖——插件升级后样式/运行时能跟进存量项目） */
function ensureAssets() {
  fs.mkdirSync(ASSETS, { recursive: true });
  for (const f of ['doc.css', 'mermaid.min.js', 'portal-zoom.js']) {
    const src = path.join(SKILL_ASSETS, f);
    const dst = path.join(ASSETS, f);
    let same = false;
    try { same = fs.statSync(dst).size === fs.statSync(src).size; } catch { same = false; }
    if (!same) fs.copyFileSync(src, dst);
  }
}

/**
 * 生成 README.html 门户与烘焙页。失败抛异常（调用方 refreshReadme 统一 try/catch 吞掉，不阻塞保存）。
 * @returns {{ baked: number, mermaidPages: number }}
 */
function buildPortal({ versionDir, funcName, version }) {
  ROOT = versionDir;
  README_DIR = path.join(versionDir, '_README');
  OUT_INDEX = path.join(README_DIR, 'README.html');
  ASSETS = path.join(README_DIR, 'assets');
  FUNC_SIG = `${funcName} ${version}`;
  BUILT_AT = now();

  ensureAssets();

  const parsed = parseReadme();

  // 门户忠实 README 表格：只烘焙表中列出的文档（md 行 + development 目录展开）。
  // README 是精选清单而非全量目录——未列出的（历史 E 版本、表外文档）不烘焙不展示。
  const readmeRels = [];
  const seen = new Set();
  for (const sec of parsed.sections) {
    for (const row of sec.rows) {
      let rels = [];
      if (row.type === 'md') { rels = [row.rel]; }  // 含系统文件（_进度清单.md 等）：烘焙快照页，卡片给「渲染版 + 实时源文件」双入口
      else if (row.type === 'dir') {
        const dirAbs = path.join(ROOT, row.rel);
        for (const f of fs.readdirSync(dirAbs).filter(f => f.endsWith('.md'))
          .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))) rels.push(row.rel + '/' + f);
      }
      for (const rel of rels) if (!seen.has(rel)) { seen.add(rel); readmeRels.push(rel); }
    }
  }

  // 清理旧产物（_README/ 下除 assets/ 与数据源 README.md），防止 README 收窄后残留孤儿页
  // maxRetries：Windows 下目录/文件可能被杀毒或索引服务瞬时占用（EPERM/EBUSY），短暂重试
  for (const name of fs.readdirSync(README_DIR)) {
    if (name === 'assets' || name === 'README.md') continue;
    fs.rmSync(path.join(README_DIR, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  let mermaidPages = 0;
  let baked = 0;
  for (const rel of readmeRels) {
    if (bakeDoc(rel).hasMermaid) mermaidPages++;
    baked++;
  }
  linkifyDocs(readmeRels);   // 第二遍：全部烘焙页就位后再做路径文本可点化

  fs.writeFileSync(OUT_INDEX, renderIndex(parsed), 'utf8');
  return { baked, mermaidPages };
}

module.exports = { buildPortal };
