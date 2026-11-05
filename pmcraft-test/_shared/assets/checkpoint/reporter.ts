/**
 * checkpoint/reporter.ts — 自定义 Playwright Reporter（兜底模式）
 *
 * 框架从 shared-memory 改为磁盘 JSONL 通信后，reporter 降级为兜底：
 * - 如果 finalizeCapture() 已写入 checkpoint_log.json → 跳过
 * - 如果未写入（如异常中断）→ 从 JSONL 重建
 *
 * 用法（在 playwright.config.ts 中）：
 *   reporter: [
 *     ['list'],
 *     ['./scripts/assets/checkpoint/reporter.ts', { outputDir: './logs/checkpoint' }],
 *   ],
 * 注意：Playwright 将 tuple 的第二个元素作为 options 传给 reporter 构造函数。
 * 常量与共享类型定义在 shared.ts（与 framework.ts 共用）。
 */

import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_LOG_DIR,
  OPS_JSONL_SUFFIX,
  CHECKPOINT_LOG_SUFFIX,
  UTF8,
  relativize,
  failureSummaryOf,
} from './shared.js';
import type { CheckpointResult } from './shared.js';

interface ReporterOptions {
  outputDir: string;
  tcId?: string;  // 保留字段；实际 tcId 通过 test.title 正则提取（onTestEnd）
}

class CheckpointReporter implements Reporter {
  private outputDir: string = DEFAULT_LOG_DIR;
  private tcIds: Set<string> = new Set();

  constructor(options: Partial<ReporterOptions> = {}) {
    if (options.outputDir) {
      this.outputDir = options.outputDir;
    }
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    // 选项已由构造函数接收（Playwright tuple 语法第二个元素），无需再读 config.metadata
  }

  onTestEnd(test: TestCase, _result: TestResult): void {
    // 收集所有 test 的 tcId（兼容 TC-F-1、TC-UI-I-17、TC01 等多种编号格式）
    // ⚡ 此前仅记录第一个 test 的 tcId，onEnd 兜底只能恢复 1 个 TC —— 分批模式
    // （每批 5~8 条）下其余 TC 的日志全部丢失。现在收集 Set，逐个恢复。
    const match = test.title.match(/^(TC[\w-]+)/);
    if (match) {
      this.tcIds.add(match[1]);
    }
  }

  onEnd(result: FullResult): void {
    const tcIds = this.tcIds.size ? [...this.tcIds] : ['unknown'];
    for (const tcId of tcIds) {
      this.recoverTc(tcId, result.status === 'passed' ? 'passed' : 'failed', result.duration);
    }
  }

  // 单 TC 兜底恢复：finalizeCapture 已写入 → 跳过；否则从 JSONL 重建
  private recoverTc(tcId: string, playWrightStatus: string, durationMs: number): void {
    const checkpointLogPath = path.join(this.outputDir, `${tcId}${CHECKPOINT_LOG_SUFFIX}`);

    // 如果 finalizeCapture 已写入 → 跳过
    if (fs.existsSync(checkpointLogPath)) {
      console.log(`[checkpoint-reporter] Skipped: ${checkpointLogPath} already written by framework.finalizeCapture()`);
      return;
    }

    // 兜底：尝试从 JSONL 重建
    const jsonlPath = path.join(this.outputDir, `${tcId}${OPS_JSONL_SUFFIX}`);
    if (!fs.existsSync(jsonlPath)) {
      console.log(`[checkpoint-reporter] No JSONL found at ${jsonlPath}, nothing to recover.`);
      return;
    }

    try {
      const lines = fs.readFileSync(jsonlPath, UTF8).trim().split('\n').filter(Boolean);
      // 逐行解析：坏行（崩溃/磁盘满导致的截断 JSON）跳过，不影响其余行
      const operations: CheckpointResult[] = [];
      for (const line of lines) {
        try {
          const op: CheckpointResult = JSON.parse(line);
          // ⚡ JSONL 中截图路径为绝对路径（checkpoint() 写入时未相对化），
          // 恢复时必须转为相对 outputDir 的路径，否则 report-gen 的 toReportRel()
          // 会拼出 ../logs/checkpoint/C:/... 损坏链接。
          if (op.beforeScreenshotPath) op.beforeScreenshotPath = relativize(op.beforeScreenshotPath, this.outputDir);
          if (op.afterScreenshotPath) op.afterScreenshotPath = relativize(op.afterScreenshotPath, this.outputDir);
          operations.push(op);
        } catch (e: any) {
          console.log(`[checkpoint-reporter] Skipping corrupt JSONL line: ${e.message}`);
        }
      }

      let passedOps = 0;
      let failedOps = 0;
      for (const r of operations) {
        if (r.status === 'PASSED') passedOps++;
        else if (r.status === 'FAILED') failedOps++;
      }

      const log = {
        tcId,
        timestamp: new Date().toISOString(),
        // 与 framework.ts 值域统一：timedout/interrupted 归为 failed
        playWrightStatus,
        // ⚡ 与 framework.finalizeCapture 同构补 failureSummary（从 ops error 透传/推导）
        failureSummary: failureSummaryOf(operations),
        durationMs,
        totalOperations: operations.length,
        passedOperations: passedOps,
        failedOperations: failedOps,
        operations,
        // 兜底恢复路径：JSONL 仅含 checkpoint 操作数据，不含 console/network 捕获数据，
        // 此处为空是结构性分歧（非 bug）；报告模板对空数据不渲染该区块。
        consoleMessages: { total: 0, errors: 0, warnings: 0, messages: [] },
        networkRequests: { total: 0, errors: 0, requests: [] },
      };

      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      fs.writeFileSync(checkpointLogPath, JSON.stringify(log, null, 2), UTF8);
      console.log(`[checkpoint-reporter] Recovered from JSONL: ${checkpointLogPath} (${operations.length} ops)`);
    } catch (e: any) {
      console.log(`[checkpoint-reporter] JSONL recovery failed: ${e.message}`);
    }
  }
}

export default CheckpointReporter;
