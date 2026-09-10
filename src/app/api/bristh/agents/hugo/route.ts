import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';

// Allow up to 120s for financial analysis generation
export const maxDuration = 120;

export async function POST(req: Request) {
  let taskIdForError = '';
  try {
    const { taskId, locale } = await req.json();
    taskIdForError = taskId;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { context: true }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 1. Update status to RUNNING
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' }
    });

    // 2. Build prompt from config (persona from config.json + private context files)
    const fallbackPersona = 'You are Hugo, the Financial Analyst at Bristh Enrollment Partners. You specialize in financial analysis, budget planning, ROI calculations, and cost optimization. Generate professional financial reports in Markdown format with structured tables and key metrics.';
    
    const systemPrompt = await buildAgentPrompt('hugo', task.instruction, task.context.rawContent, fallbackPersona, locale)
      + `\n\nBased on this context, generate a professional financial analysis report in Markdown format. Include:
1. **Executive Summary** — Key findings in 2-3 sentences
2. **Financial Data Tables** — Use Markdown tables for all numerical data (revenue, costs, margins, etc.)
3. **Key Metrics** — ROI, profit margins, growth rates, break-even points as applicable
4. **Risk Assessment** — Identify financial risks and mitigation strategies
5. **Recommendations** — Data-driven actionable recommendations

Use proper Markdown formatting with tables, headings, and bullet points. Be precise with numbers and percentages. Just output the raw Markdown content.`;

    const { client, config } = await getModelClient();
    const tracker = new TokenTracker();
    const response = await trackableCompletion(
      tracker, 'hugo_main', client, config,
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }], { maxTokens: 4096 })
    );

    const resultMarkdown = response.choices[0].message.content || 'Failed to generate financial analysis.';

    // Extract first heading or first 30 chars as summary
    const summaryMatch = resultMarkdown.match(/^#+ (.+)/m);
    const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : resultMarkdown.slice(0, 80).replace(/[#*]/g, '').trim();

    const resultPayload = JSON.stringify({
      summary: `📊 ${summary}`,
      content: resultMarkdown
    });

    // 3. Save output payload and mark as COMPLETED
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload
      }
    });

    // Memory hook
    recordTaskCompletion('hugo', taskId, task.instruction, resultMarkdown.slice(0, 200)).catch(() => {});

    await tracker.persist('agent', 'hugo', taskId, task.context.id).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Hugo agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
