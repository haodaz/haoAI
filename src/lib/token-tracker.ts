/**
 * Token 用量追踪器 — 累计一次任务/管线中多个 AI 调用的 token 消耗
 * 
 * 参考 datasquare TokenTracker，适配 myAI 的 Prisma + 多 Agent 架构。
 * 
 * 用法：
 *   const tracker = new TokenTracker();
 *   tracker.track('param_extraction', 'deepseek-v3', response.usage);
 *   tracker.track('main_generation', 'deepseek-v3', response.usage);
 *   await tracker.persist('agent', 'alice', taskId, contextId);
 */

import prisma from '@/lib/prisma';

/** 每 1M token 的价格 (USD) — 2026Q3 公开定价 */
const PRICING_PER_1M: Record<string, { input: number; output: number }> = {
  // DeepSeek (DashScope)
  'deepseek-v3':            { input: 0.27, output: 1.10 },
  'deepseek-chat':          { input: 0.27, output: 1.10 },
  // Anthropic Claude
  'claude-sonnet-5':        { input: 3.00, output: 15.0 },
  'claude-sonnet-4':        { input: 3.00, output: 15.0 },
  // Google Gemini Flash
  'gemini-3.6-flash':       { input: 0.75, output: 3.75 },
  'gemini-3.5-flash':       { input: 0.75, output: 3.75 },
  // OpenAI
  'gpt-4o':                 { input: 2.50, output: 10.0 },
  'gpt-4o-mini':            { input: 0.15, output: 0.60 },
};

/** 兜底价格 */
const DEFAULT_PRICING = { input: 1.0, output: 3.0 };

export interface TokenRecord {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs?: number;
  timestamp: string;
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_1M[model] || DEFAULT_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export class TokenTracker {
  private records: TokenRecord[] = [];

  /**
   * 记录一次 OpenAI 兼容 API 的 usage
   */
  track(
    stage: string,
    model: string,
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null,
    durationMs?: number
  ) {
    if (!usage) return;
    const input = usage.prompt_tokens || 0;
    const output = usage.completion_tokens || 0;
    const total = usage.total_tokens || (input + output);
    const cost = calcCost(model, input, output);

    this.records.push({
      stage,
      model,
      inputTokens: input,
      outputTokens: output,
      totalTokens: total,
      costUsd: cost,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 获取汇总数据
   */
  getSummary() {
    let totalInput = 0, totalOutput = 0, totalTokens = 0, totalCost = 0;
    for (const r of this.records) {
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      totalTokens += r.totalTokens;
      totalCost += r.costUsd;
    }
    return {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalTokens,
      totalCostUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
      records: this.records,
    };
  }

  /**
   * 将所有记录批量写入数据库
   * 每条 track 记录写一行 TokenUsageLog，方便后续按 stage 维度分析
   */
  async persist(
    source: string,
    agentId?: string,
    taskId?: string,
    contextId?: string
  ): Promise<void> {
    if (this.records.length === 0) return;

    try {
      await prisma.tokenUsageLog.createMany({
        data: this.records.map(r => ({
          source,
          agentId: agentId || null,
          taskId: taskId || null,
          contextId: contextId || null,
          modelId: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.totalTokens,
          costUsd: r.costUsd,
          stage: r.stage,
          durationMs: r.durationMs || null,
          success: true,
        })),
      });
    } catch (e) {
      console.error('[TokenTracker] Failed to persist:', e);
    }
  }

  /**
   * 记录一次失败的调用
   */
  async persistError(
    source: string,
    model: string,
    stage: string,
    errorMessage: string,
    agentId?: string,
    taskId?: string,
    contextId?: string
  ): Promise<void> {
    try {
      await prisma.tokenUsageLog.create({
        data: {
          source,
          agentId: agentId || null,
          taskId: taskId || null,
          contextId: contextId || null,
          modelId: model,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          stage,
          success: false,
          errorMessage,
        },
      });
    } catch (e) {
      console.error('[TokenTracker] Failed to persist error:', e);
    }
  }

  /** 当前累计的记录条数 */
  get count(): number {
    return this.records.length;
  }
}
