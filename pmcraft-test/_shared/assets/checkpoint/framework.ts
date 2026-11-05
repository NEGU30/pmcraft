/**
 * checkpoint/framework.ts — 运行时包装器
 *
 * 每个 Playwright 用户操作包裹在 checkpoint() 中，自动捕获：
 *   - before/after 截图
 *   - 操作耗时
 *   - 失败时的错误上下文
 * 常量与共享类型定义在 shared.ts（与 reporter.ts 共用）
 *
 * 关键设计决策：checkpoint 结果直接写入磁盘 JSONL 文件（而非内存数组），
 * 因为 Playwright worker 进程和 reporter 进程是隔离的，共享内存不互通。
 * spec 末尾必须调用 finalizeCapture() 汇总写入 checkpoint_log.json。
 */

import { Page, test as playwrightTest } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  CHECKPOINT_TIMEOUT_MS,
  MAX_CAPTURED_MESSAGES,
  DEFAULT_LOG_DIR,
  OPS_JSONL_SUFFIX,
  CHECKPOINT_LOG_SUFFIX,
  BEFORE_SCREENSHOT_SUFFIX,
  AFTER_SCREENSHOT_SUFFIX,
  IMAGE_PNG_MIME,
  UTF8,
  relativize,
  classifyFailure,
  failureSummaryOf,
} from './shared.js';
import type {
  CheckpointContext,
  CheckpointError,
  CheckpointResult,
  ConsoleMessage,
  NetworkRequest,
} from './shared.js';

// ============================================================
// 全局状态（仅在该 worker 进程内有效）
// ============================================================

// 捕获阶段的非致命错误（截图/DOM/写入失败等），供诊断
const _captureErrors: string[] = [];
export function getCaptureErrors(): string[] { return _captureErrors; }

const results: CheckpointResult[] = [];
export function getResults(): CheckpointResult[] { return results; }
export function clearResults(): void { results.length = 0; }

const consoleMessages: ConsoleMessage[] = [];
const networkRequests: NetworkRequest[] = [];
let _consoleCaptureInitialized = false;
let _networkCaptureInitialized = false;
let _activeTcId = '';
let _screenshotDir = '';
let _checkpointLogDir = '';    // JSONL 临时写入目录（每条 checkpoint 即时持久化，跨 TC 共享同一目录）
let _checkpointLogBaseDir = ''; // 最终 checkpoint_log.json 输出目录（finalizeCapture 时使用）

// ============================================================
// initCapture
// ============================================================

export function initCapture(page: Page, tcId?: string): void {
  if (tcId) {
    // 新 TC 开始 → 清空上一个 TC 的 results（支持单进程多 TC：run-all.cjs 模式）
    if (tcId !== _activeTcId) {
      clearResults();
    }
    _activeTcId = tcId;
    const cwd = process.cwd();
    // Always set to current tcId dir (not just once) — parallel workers or
    // run-all.cjs mode where all TCs share one process: otherwise all TCs in
    // a worker share the first TC's screenshot directory (P0 bug, 2026-07-31).
    setScreenshotDir(path.join(cwd, 'logs', 'results', tcId, 'screenshots'));
    if (!_checkpointLogDir) {
      setCheckpointLogDir(path.join(cwd, 'logs', 'checkpoint'));
    }
    if (!_checkpointLogBaseDir) {
      _checkpointLogBaseDir = path.join(cwd, 'logs', 'checkpoint');
    }
  }

  if (!_consoleCaptureInitialized) {
    _consoleCaptureInitialized = true;
    page.on('console', (msg) => {
      const loc = msg.location();
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
        location: loc ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined,
        tcId: _activeTcId,
      });
    });
    page.on('pageerror', (err) => {
      // 已知限制（截至 2026-07）：pageerror 可能发生在 TC 执行间隙，归属可能不精确。
      // 截至 2026-07，无可靠的事件→TC 时间线匹配机制，保留简单归属策略（记入当前 _activeTcId）。
      consoleMessages.push({
        type: 'unhandled_error',
        text: err.message,
        timestamp: Date.now(),
        tcId: _activeTcId,
      });
    });
  }

  if (!_networkCaptureInitialized) {
    _networkCaptureInitialized = true;
    page.on('response', (resp) => {
      networkRequests.push({
        url: resp.url(),
        method: resp.request().method(),
        status: resp.status(),
        statusText: resp.statusText(),
        duration: 0,
        timestamp: Date.now(),
        tcId: _activeTcId,
        isError: resp.status() >= 400,
      });
    });
  }
}

export function setActiveTcId(tcId: string): void { _activeTcId = tcId; }
export function getConsoleMessages(): ConsoleMessage[] { return consoleMessages; }
export function getNetworkRequests(): NetworkRequest[] { return networkRequests; }

export function clearCapture(): void {
  consoleMessages.length = 0;
  networkRequests.length = 0;
  _captureErrors.length = 0;
  // ⚠️ 不重置 _consoleCaptureInitialized / _networkCaptureInitialized：
  // finalizeCapture → clearCapture → 同一 page 再次 initCapture 会导致
  // page.on() 重复注册（run-all.cjs 单进程多 TC），每条 console/network
  // 消息被 push 多次。正确行为：listener 仅注册一次，仅清空数据数组。
}

// ============================================================
// 截图目录 & JSONL 目录
// ============================================================

export function setScreenshotDir(dir: string): void {
  _screenshotDir = dir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function setCheckpointLogDir(dir: string): void {
  _checkpointLogDir = dir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================================
// checkpoint() — 核心包装函数
// ============================================================

export async function checkpoint(
  page: Page,
  operation: () => Promise<void>,
  context: CheckpointContext,
  repairAttempts: number = 0
): Promise<CheckpointResult> {
  const checkpointId = `${context.tcId}_op${context.operationIndex}`;
  const startTime = Date.now();

  // — before 截图 —
  const beforePath = path.join(_screenshotDir, `${checkpointId}${BEFORE_SCREENSHOT_SUFFIX}`);
  let beforeScreenshotPath = '';
  try {
    await page.screenshot({ path: beforePath, fullPage: false });
    beforeScreenshotPath = beforePath;
  } catch (e: any) {
    _captureErrors.push(`screenshot_before: ${e.message}`);
    console.error('[checkpoint] before screenshot failed:', e.message);
  }

  // — 页面元信息 —
  let pageUrl = '';
  let pageTitle = '';
  try {
    pageUrl = page.url();
    pageTitle = await page.title();
  } catch (e: any) {
    _captureErrors.push(`page_meta: ${e.message}`);
    console.error('[checkpoint] page metadata failed:', e.message);
  }

  // — 执行操作（超时保护）—
  let error: CheckpointError | undefined;
  let origError: Error | undefined;
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Checkpoint timeout: ${CHECKPOINT_TIMEOUT_MS / 1000}s`)), CHECKPOINT_TIMEOUT_MS)
      ),
    ]);
  } catch (e: any) {
    error = {
      type: e.constructor?.name || 'Error',
      message: e.message || String(e),
      stack: e.stack,
    };
    // ⚡ 失败分类（failureSummary 数据源）：env/selector/assertion/data/unknown 启发式。
    // 前置网络信号按 timestamp < 本次操作开始时间过滤（跨 TC 捕获数组会累积，防污染）。
    error.failureCategory = classifyFailure(error, {
      networkRequests: networkRequests.filter(r => r.isError && r.status >= 500 && r.timestamp < startTime),
      consoleMessages: consoleMessages.filter(m => (m.type === 'error' || m.type === 'unhandled_error') && m.timestamp < startTime),
    });
    // 保留原始错误：证据落盘后需重新抛出，让 Playwright 正确判定 test 失败。
    // 此前吞掉错误导致 checkpoint 层 FAILED 但 test 层 PASSED（假通过，
    // trap: evaluate_empty_element_timeout_false_pass）。
    origError = e instanceof Error ? e : new Error(String(e));
  }

  const durationMs = Date.now() - startTime;

  // — after 截图 —
  const afterPath = path.join(_screenshotDir, `${checkpointId}${AFTER_SCREENSHOT_SUFFIX}`);
  let afterScreenshotPath = '';
  try {
    await page.screenshot({ path: afterPath, fullPage: false });
    afterScreenshotPath = afterPath;
  } catch (e: any) {
    _captureErrors.push(`screenshot_after: ${e.message}`);
    console.error('[checkpoint] after screenshot failed:', e.message);
  }

  // — 构建结果 —
  const result: CheckpointResult = {
    checkpointId,
    tcId: context.tcId,
    operationIndex: context.operationIndex,
    status: error ? 'FAILED' : 'PASSED',
    operationName: context.operationName,
    description: context.description,
    selector: context.selector,
    beforeScreenshotPath,
    afterScreenshotPath,
    durationMs,
    pageUrl,
    pageTitle,
    repairAttempts,
    ...(error && { error }),
  };

  results.push(result);

  // — 立即写入磁盘 JSONL（跨进程持久化，不依赖 reporter 共享内存）—
  if (_checkpointLogDir) {
    try {
      const jsonlPath = path.join(_checkpointLogDir, `${context.tcId}${OPS_JSONL_SUFFIX}`);
      const line = JSON.stringify(result);
      fs.appendFileSync(jsonlPath, line + '\n', UTF8);
    } catch (e: any) {
      _captureErrors.push(`jsonl_write: ${e.message}`);
      console.error('[checkpoint] JSONL write failed:', e.message);
    }
  }

  // — attach 错误截图到 Playwright 报告 —
  if (error && beforeScreenshotPath) {
    try {
      await playwrightTest.info().attach(`checkpoint-${checkpointId}-before`, {
        path: beforeScreenshotPath,
        contentType: IMAGE_PNG_MIME,
      });
    } catch (e: any) {
      _captureErrors.push(`attach: ${e.message}`);
      console.error('[checkpoint] Playwright attach failed:', e.message);
    }
  }

  // ⚡ 重新抛出原始错误：让 Playwright 判定 test 失败。
  // 此时证据已全部落盘（before/after 截图、JSONL 逐条持久化），rethrow 不丢证据；
  // spec 在 finalizeCapture 前异常中断时，reporter.ts 兜底可从 JSONL 重建 checkpoint_log.json。
  if (origError) throw origError;

  return result;
}

// ============================================================
// finalizeCapture — 在 spec 末尾调用，汇总写入 checkpoint_log.json
// ============================================================

export function finalizeCapture(tcId: string, outputDir?: string): void {
  const logDir = outputDir || _checkpointLogBaseDir || path.join(process.cwd(), DEFAULT_LOG_DIR);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 将绝对截图路径转为相对路径（相对于 logDir）
  const opsWithRelPaths = results.map(op => {
    const o = { ...op };
    if (o.beforeScreenshotPath) {
      o.beforeScreenshotPath = relativize(o.beforeScreenshotPath, logDir);
    }
    if (o.afterScreenshotPath) {
      o.afterScreenshotPath = relativize(o.afterScreenshotPath, logDir);
    }
    return o;
  });

  // 单次遍历统计 passed/failed，避免 filter 两次
  let passedOps = 0;
  let failedOps = 0;
  for (const r of results) {
    if (r.status === 'PASSED') passedOps++;
    else if (r.status === 'FAILED') failedOps++;
  }

  const log = {
    tcId,
    timestamp: new Date().toISOString(),
    playWrightStatus: failedOps > 0 ? 'failed' : 'passed',
    // ⚡ 失败分类（仅 failedOperations > 0 时出现；undefined 键被 JSON.stringify 丢弃）：
    // 供 run-tests Phase 5.3 先读 category 分流修复
    failureSummary: failedOps > 0 ? failureSummaryOf(opsWithRelPaths) : undefined,
    durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    totalOperations: results.length,
    passedOperations: passedOps,
    failedOperations: failedOps,
    operations: opsWithRelPaths,
    consoleMessages: {
      total: consoleMessages.length,
      errors: consoleMessages.filter(m => m.type === 'error' || m.type === 'unhandled_error').length,
      warnings: consoleMessages.filter(m => m.type === 'warning').length,
      messages: consoleMessages.slice(0, MAX_CAPTURED_MESSAGES),
    },
    networkRequests: {
      total: networkRequests.length,
      errors: networkRequests.filter(r => r.isError).length,
      requests: networkRequests.slice(0, MAX_CAPTURED_MESSAGES),
    },
  };

  const logPath = path.join(logDir, `${tcId}${CHECKPOINT_LOG_SUFFIX}`);
  try {
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), UTF8);
    console.log(`[checkpoint-framework] ✅ ${tcId}: ${logPath} (${results.length} ops, ${log.failedOperations} failed)`);
  } catch (e: any) {
    console.error(`[checkpoint-framework] FAILED to write ${tcId}: ${e.message}`);
  }

  // 清理
  clearResults();
  clearCapture();
}
