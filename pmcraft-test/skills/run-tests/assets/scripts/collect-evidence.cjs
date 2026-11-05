#!/usr/bin/env node
// collect-evidence.cjs — run-tests Phase 5.2 录像/trace 归集（模式 A 每批执行后 MUST）
// 用法: node collect-evidence.cjs   （在 e2e 时间戳根目录执行；无路径参数，无注入面）
// 说明: Playwright 每次运行开始清空 outputDir，不归集则上一批录像/trace 被下一批运行删除。
//       tcId 从 spec 文件名目录（如 TC-F-1.spec）提取，不从测试标题目录提取
//       （标题目录为净化后的 "TC-F-1-查询功能验证"，正则截取会带尾横线/吞 ASCII 后缀，tcId 不可靠）。
//       归集目标：logs/results/{tcId}/video.webm + trace.zip（report-gen "证据存档"区块数据源）。
const fs = require('fs');
const path = require('path');

const walk = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d)) {
    const p = path.join(d, e);
    if (!fs.statSync(p).isDirectory()) continue;
    if (e.endsWith('.spec')) {
      const tc = e.replace(/\.spec$/, '');
      const dst = path.join('logs/results', tc);
      for (const t of fs.readdirSync(p)) {
        const td = path.join(p, t);
        if (!fs.statSync(td).isDirectory()) continue;
        const files = fs.readdirSync(td);
        if (files.includes('video.webm') || files.includes('trace.zip')) {
          fs.mkdirSync(dst, { recursive: true });
          for (const f of ['video.webm', 'trace.zip']) {
            if (files.includes(f)) fs.copyFileSync(path.join(td, f), path.join(dst, f));
          }
        }
      }
    } else {
      walk(p);
    }
  }
};

walk('logs/playwright-output');
console.log('[collect-evidence] 归集完成（logs/results/{tcId}/video.webm + trace.zip）');
