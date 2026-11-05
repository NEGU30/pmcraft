/**
 * json-output.js — 统一 stdout JSON 输出契约
 *
 * 所有 pmcraft Node 脚本通过本模块输出结构化结果，LLM 只解析 JSON。
 *
 * 输出格式：
 *   {"status":"ok"|"error"|"interaction","data":{...}}
 *
 * status 语义：
 *   - ok          操作成功完成，data 为结果
 *   - error       不可恢复错误，data.message/detail/suggestion 为错误信息
 *   - interaction 需要 LLM 交互决策，data.ask 为交互类型，data.options 为选项
 *
 * 退出码：
 *   0  ok / interaction
 *   1  error / 参数错误
 *   2  Node.js 未找到（由 deploy-* 等需要子进程的脚本使用）
 */
'use strict';
const fs = require('fs');

function out(status, data) {
  const payload = { status, data: data || {} };
  // 同步写 stdout（fd 1）：ok/fail/interact 调用后立即 process.exit，
  // 异步 process.stdout.write 在 Windows 管道下未刷新即退出，大输出会被截断
  //（实测 >1MB 时截断在管道缓冲边界、退出码变 null）。writeSync 保证完整落盘。
  fs.writeSync(1, JSON.stringify(payload));
  return payload;
}

/** 成功输出并退出 0 */
function ok(data) {
  out('ok', data);
  process.exit(0);
}

/** 错误输出并退出 1 */
function fail(message, detail, suggestion) {
  out('error', { message, detail: detail || '', suggestion: suggestion || '' });
  process.exit(1);
}

/** 交互输出并退出 0（LLM 收集用户选择后带答案重调脚本） */
function interact(ask, data) {
  out('interaction', Object.assign({ ask }, data || {}));
  process.exit(0);
}

/** Node.js 未找到：退出码 2 + 友好提示 */
function nodeMissing() {
  out('error', {
    message: '未检测到 Node.js',
    detail: '运行 pmcraft 脚本需要 Node.js。命令 node --version 无法执行。',
    suggestion: '请到 https://nodejs.org 下载 LTS 版安装，重开终端验证 node --version 有版本号后重试。'
  });
  process.exit(2);
}

/** 参数错误（退出码 1） */
function usage(message) {
  out('error', { message: '参数错误', detail: message || '', suggestion: '请按 SKILL.md 中的参数说明重新调用。' });
  process.exit(1);
}

module.exports = { out, ok, fail, interact, nodeMissing, usage };
