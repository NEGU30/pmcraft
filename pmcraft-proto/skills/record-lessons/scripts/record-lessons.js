#!/usr/bin/env node
/**
 * record-lessons.js — lessons.md 经验规则管理
 *
 * 功能：lessons.md 的增删改查（add/list/delete/edit/clear）+ 精确匹配去重 + 编号重排。
 * 语义去重（措辞不同但规则等价）由 LLM 判断——脚本返回疑似重复候选，LLM 决策。
 *
 * 用法：
 *   node record-lessons.js --file=<lessons.md路径> add "规则描述"
 *   node record-lessons.js --file=<lessons.md路径> list
 *   node record-lessons.js --file=<lessons.md路径> delete <编号>
 *   node record-lessons.js --file=<lessons.md路径> edit <编号> "新描述"
 *   node record-lessons.js --file=<lessons.md路径> clear [--answer=confirm]
 *
 * 输出：
 *   ok          操作成功（含受影响条目）
 *   error       参数/编号错误
 *   interaction clear 确认 / add 疑似重复时
 */
'use strict';
const fs = require('fs');
const path = require('path');
/** 运行时定位共享库：从本脚本位置逐级向上找 _shared/scripts/lib（源=marketplace 根，cache=插件内分发副本） */
function resolveSharedLib() {
  let dir = __dirname;
  for (;;) {
    const lib = path.join(dir, '_shared', 'scripts', 'lib');
    if (fs.existsSync(lib)) return lib;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
const sharedLib = resolveSharedLib();
if (!sharedLib) throw new Error('pmcraft 共享库缺失：请运行 setup.cmd 分发 _shared/scripts');
const { ok, fail, usage, interact } = require(path.join(sharedLib, 'json-output'));
const { readUtf8, writeUtf8, ensureDir } = require(path.join(sharedLib, 'encoding'));

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) args[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
      else args[key] = 'true';
    }
  }
  return args;
}

/** 解析 lessons.md 为条目数组（每行 `- {描述}`，空行忽略） */
function parseLessons(content) {
  const items = [];
  for (const line of (content || '').split(/\r?\n/)) {
    const m = /^\s*-\s+(.+?)\s*$/.exec(line);
    if (m && m[1].trim()) items.push(m[1].trim());
  }
  return items;
}

/** 序列化为 `- {描述}` 每行一条 */
function serialize(items) {
  return items.map(x => `- ${x}`).join('\n') + '\n';
}

/** 精确/规范化匹配去重：去除标点空白后相同视为重复 */
function normalize(s) {
  return s.replace(/[\s，。、；：""''（）()]/g, '').toLowerCase();
}

function main() {
  const args = parseArgs(process.argv);
  const answer = args.answer || '';
  const operands = process.argv.slice(2).filter(a => !a.startsWith('--'));

  if (!args.file) usage('缺少 --file（lessons.md 路径）');
  const file = path.resolve(args.file);
  const op = operands[0];

  const load = () => parseLessons(readUtf8(file));
  const save = items => {
    ensureDir(path.dirname(file));
    writeUtf8(file, items.length ? serialize(items) : '');
  };

  switch (op) {
    case 'list': {
      const items = load();
      if (!items.length) ok({ count: 0, items: [], message: '当前没有已记录的 lesson。' });
      ok({ count: items.length, items: items.map((x, i) => ({ no: i + 1, text: x })) });
      break;
    }

    case 'add': {
      const text = operands[1];
      if (!text) usage('缺少规则描述');
      const items = load();
      // 精确去重
      const normNew = normalize(text);
      const dup = items.findIndex(x => normalize(x) === normNew);
      if (dup >= 0) {
        fail('该规则已存在', `第 ${dup + 1} 条：${items[dup]}`, '无需重复添加');
      }
      // 疑似重复（高度相似但非完全一致）→ 返回候选让 LLM 语义判断
      const similar = items
        .map((x, i) => ({ no: i + 1, text: x }))
        .filter(x => normalize(x.text).includes(normNew) || normNew.includes(normalize(x.text)));
      if (similar.length > 0 && !answer.includes('confirm_add')) {
        interact('similar_exists', {
          similar: similar,
          new_rule: text,
          prompt: `新规则与第 ${similar.map(s => s.no).join('、')} 条相似，是否仍然添加？`
        });
      }
      items.push(text);
      save(items);
      ok({ action: 'add', no: items.length, text, count: items.length });
      break;
    }

    case 'delete': {
      const no = parseInt(operands[1], 10);
      if (isNaN(no)) usage('缺少条目编号');
      const items = load();
      if (no < 1 || no > items.length) fail(`第 ${no} 条不存在`, `当前共 ${items.length} 条规则`);
      const removed = items.splice(no - 1, 1)[0];
      save(items);
      ok({ action: 'delete', removed_no: no, removed_text: removed, count: items.length });
      break;
    }

    case 'edit': {
      const no = parseInt(operands[1], 10);
      const text = operands[2];
      if (isNaN(no)) usage('缺少条目编号');
      if (!text) usage('缺少新描述');
      const items = load();
      if (no < 1 || no > items.length) fail(`第 ${no} 条不存在`, `当前共 ${items.length} 条规则`);
      const old = items[no - 1];
      items[no - 1] = text;
      save(items);
      ok({ action: 'edit', no, old_text: old, new_text: text, count: items.length });
      break;
    }

    case 'clear': {
      const items = load();
      if (!items.length) fail('当前没有已记录的 lesson', '无需清空');
      if (answer !== 'confirm') {
        interact('clear_confirm', {
          count: items.length,
          prompt: `lessons.md 当前有 ${items.length} 条规则，确认全部清空？`
        });
      }
      save([]);
      ok({ action: 'clear', cleared_count: items.length });
      break;
    }

    default:
      usage('操作必须是 add / list / delete / edit / clear');
  }
}

main();
