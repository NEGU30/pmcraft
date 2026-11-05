/**
 * checkpoint/shared.ts — 常量与共享类型
 *
 * framework.ts 与 reporter.ts 共用同一份常量与类型定义，
 * 避免两文件间数据模型漂移（此前 playWrightStatus 值域不一致、
 * duration/durationMs 命名分裂等 bug 均源于此）。
 *
 * 本文件纯自足：不 import @playwright/test，仅 Node 标准库 / 纯类型。
 */

import * as path from 'path';

// ============================================================
// 常量
// ============================================================

export const DEFAULT_LOG_DIR = 'logs/checkpoint';
export const OPS_JSONL_SUFFIX = '_ops.jsonl';
export const CHECKPOINT_LOG_SUFFIX = '_checkpoint_log.json';
export const BEFORE_SCREENSHOT_SUFFIX = '_before.png';
export const AFTER_SCREENSHOT_SUFFIX = '_after.png';
export const IMAGE_PNG_MIME = 'image/png';
export const UTF8 = 'utf-8';
export const CHECKPOINT_TIMEOUT_MS = 30000;      // 单操作超时
export const MAX_CAPTURED_MESSAGES = 500;        // console/network 截断上限

// 绝对路径 → 相对 base 的相对路径（截图路径写入 checkpoint 日志时统一相对化，
// 供 framework.ts 与 reporter.ts 共用，避免两处实现漂移）
export function relativize(absPath: string, base: string): string {
  try {
    return path.relative(base, absPath).replace(/\\/g, '/');
  } catch {
    return absPath.replace(/\\/g, '/');
  }
}

// ============================================================
// 类型
// ============================================================

export interface CheckpointContext {
  tcId: string;
  operationIndex: number;
  operationName: string;
  selector: string;
  description: string;
}

export interface CheckpointError {
  type: string;
  message: string;
  stack?: string;
  failureCategory?: FailureCategory;  // 失败分类（framework catch 时 compute，供 run-tests Phase 5.3 修复分流）
}

export interface CheckpointResult {
  checkpointId: string;
  tcId: string;
  operationIndex: number;
  status: 'PASSED' | 'FAILED';  // 统一值域，仅这两个值
  operationName: string;
  description: string;
  selector: string;
  beforeScreenshotPath: string;
  afterScreenshotPath: string;
  durationMs: number;
  pageUrl: string;
  pageTitle: string;
  error?: CheckpointError;
  repairAttempts: number;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: number;
  location?: string;
  tcId: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  statusText: string;
  duration: number;
  timestamp: number;
  tcId: string;
  isError: boolean;
}

// ============================================================
// 失败分类（failureSummary）— 供 run-tests Phase 5.3 修复分流
// ============================================================

export type FailureCategory = 'env' | 'selector' | 'assertion' | 'data' | 'unknown';

export interface FailureSummary {
  category: FailureCategory;
  firstFailedOperationIndex: number;
  message: string;
}

export interface ClassifyContext {
  networkRequests?: NetworkRequest[];  // 失败 op 之前的请求（前置 5xx 信号，调用方按 timestamp 过滤）
  consoleMessages?: ConsoleMessage[];  // 失败 op 之前的 console（前置 error 级信号，调用方按 timestamp 过滤）
}

// 失败分类启发式（纯函数，framework 与 reporter 共用；判定顺序先后即优先级，前者命中即止）：
//   1. env    — 网络/服务端错误（net::ERR / ECONNREFUSED / 5xx），或失败 op 之前有 5xx 请求 / error 级 console
//   2. assertion — 断言类（expect / Expected/Received / toHave / toContain / toBe caller）
//      注意：必须在 selector 之前——真实 Playwright 断言失败消息的 Call log 含 "waiting for"，
//      而纯 locator 超时（waitFor/click/fill）消息从不含 expect(，故 expect( 是更强信号
//      （2026-08-26 迷你真跑实测修正）。
//   3. selector — 定位类（strict mode violation / 多元素命中 / locator 超时 / waiting for）
//   4. data   — 数据失效类（第 N 行 / rowIndex / 无结果 / 未命中；与 assertion 有天然模糊区）
//   5. unknown — 兜底（run-tests Phase 5.3 走现有人工诊断，不降级诊断质量）
export function classifyFailure(error: CheckpointError | undefined, context?: ClassifyContext): FailureCategory {
  const msg = (error?.message || '').toLowerCase();
  if (/net::err|econnrefused|status.*5\d\d/.test(msg)) return 'env';
  if (context) {
    // 复用既有捕获数组（注意 MAX_CAPTURED_MESSAGES=500 截断口径）
    if ((context.networkRequests || []).some(r => r.isError && r.status >= 500)) return 'env';
    if ((context.consoleMessages || []).some(m => m.type === 'error' || m.type === 'unhandled_error')) return 'env';
  }
  if (/expect\(|expected.*received|tohave|tocontain|tobe.*caller/.test(msg)) return 'assertion';
  if (/strict mode violation|resolved to \d+ elements|timeout.*locator|waiting for/.test(msg)) return 'selector';
  if (/第.*行|rowindex|无结果|未命中/.test(msg)) return 'data';
  return 'unknown';
}

// 从操作序列推导顶层 failureSummary（framework.finalizeCapture 与 reporter.recoverTc 同构使用；
// 从 ops error 透传 failureCategory，缺失时按 classifyFailure 推导）
export function failureSummaryOf(operations: CheckpointResult[]): FailureSummary | undefined {
  const idx = operations.findIndex(op => op.status === 'FAILED');
  if (idx === -1) return undefined;
  const op = operations[idx];
  const category = op.error?.failureCategory ?? classifyFailure(op.error);
  return { category, firstFailedOperationIndex: idx, message: op.error?.message || '' };
}
