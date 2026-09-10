import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/token-usage
 * 
 * Query params:
 *   ?page=1&pageSize=50   — pagination
 *   ?days=30              — time range filter (last N days)
 *   ?model=deepseek-v3    — model filter
 *   ?agent=alice          — agent filter
 *   ?source=agent         — source filter
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const modelFilter = searchParams.get('model') || '';
    const agentFilter = searchParams.get('agent') || '';
    const sourceFilter = searchParams.get('source') || '';
    const daysFilter = parseInt(searchParams.get('days') || '0');

    // Build where clause
    const where: any = {};
    if (modelFilter) where.modelId = modelFilter;
    if (agentFilter) where.agentId = agentFilter;
    if (sourceFilter) where.source = sourceFilter;
    if (daysFilter > 0) {
      where.createdAt = { gte: new Date(Date.now() - daysFilter * 86400000) };
    }

    // Paginated logs
    const [logs, total] = await Promise.all([
      prisma.tokenUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.tokenUsageLog.count({ where }),
    ]);

    // Stats: aggregate ALL matching records (not just current page)
    const allForStats = await prisma.tokenUsageLog.findMany({
      where,
      select: {
        modelId: true,
        agentId: true,
        source: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        costUsd: true,
      },
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    const modelStats: Record<string, { count: number; tokens: number; cost: number }> = {};
    const agentStats: Record<string, { count: number; tokens: number; cost: number }> = {};
    const sourceStats: Record<string, { count: number; tokens: number; cost: number }> = {};

    for (const row of allForStats) {
      totalInputTokens += row.inputTokens;
      totalOutputTokens += row.outputTokens;
      totalTokens += row.totalTokens;
      totalCostUsd += row.costUsd;

      // Model breakdown
      const model = row.modelId || 'unknown';
      if (!modelStats[model]) modelStats[model] = { count: 0, tokens: 0, cost: 0 };
      modelStats[model].count++;
      modelStats[model].tokens += row.totalTokens;
      modelStats[model].cost += row.costUsd;

      // Agent breakdown
      const agent = row.agentId || 'unknown';
      if (!agentStats[agent]) agentStats[agent] = { count: 0, tokens: 0, cost: 0 };
      agentStats[agent].count++;
      agentStats[agent].tokens += row.totalTokens;
      agentStats[agent].cost += row.costUsd;

      // Source breakdown
      const source = row.source || 'unknown';
      if (!sourceStats[source]) sourceStats[source] = { count: 0, tokens: 0, cost: 0 };
      sourceStats[source].count++;
      sourceStats[source].tokens += row.totalTokens;
      sourceStats[source].cost += row.costUsd;
    }

    return NextResponse.json({
      ok: true,
      logs: logs.map(l => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      stats: {
        total_calls: allForStats.length,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_tokens: totalTokens,
        total_cost_usd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
        model_stats: modelStats,
        agent_stats: agentStats,
        source_stats: sourceStats,
      },
    });
  } catch (error: any) {
    console.error('[TokenUsage] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
