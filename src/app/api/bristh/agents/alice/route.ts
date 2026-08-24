import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { recordTaskCompletion } from '@/lib/memory-hooks';

export async function POST(req: Request) {
  let taskIdForError = '';
  try {
    const { taskId } = await req.json();
    taskIdForError = taskId;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { context: true }
    });

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    await prisma.task.update({ where: { id: taskId }, data: { status: 'RUNNING' } });

    // ── Step 1: Lightweight param extraction via small LLM call ──
    const { client, config } = await getModelClient();
    const extractionPrompt = `Extract key parameters from this proposal request. Return ONLY valid JSON, no other text.

User instruction: "${task.instruction}"

Output format:
{
  "targetSchool": "school name (string, or 'Unknown' if not specified)",
  "businessModel": "Fixed Retainer | Performance Partnership | Hybrid (混合模式)",
  "focusAreas": ["array", "of", "focus", "areas"],
  "additionalNotes": "any other relevant details from the instruction"
}`;

    const extractRes = await client.chat.completions.create(
      buildCompletionParams(config, [{ role: 'user', content: extractionPrompt }], { requireJson: true })
    );

    let params: Record<string, any> = {};
    try {
      params = JSON.parse(extractRes.choices[0].message.content || '{}');
    } catch {
      // Fallback: best-effort from instruction
      params = {
        targetSchool: task.instruction.match(/([A-Z][a-z]+(?:'s)?\s+(?:College|School|University|Academy))/)?.[1] || 'Unknown',
        businessModel: 'Fixed Retainer',
        focusAreas: [],
        additionalNotes: task.instruction,
      };
    }

    // ── Step 2: Create ToolboxJob with Kelly's parsed context as background ──
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL
    const job = await prisma.toolboxJob.create({
      data: {
        tool: 'proposal',
        params: JSON.stringify(params),
        background: task.context.rawContent || '',
        expiresAt,
      }
    });

    const toolboxUrl = `/toolbox/proposal?jobId=${job.id}`;
    const summary = `📋 ${params.targetSchool} — Proposal 已准备就绪，等待在工具中生成`;

    // ── Step 3: Save result and complete task ──
    const resultPayload = JSON.stringify({
      summary,
      toolboxUrl,
      jobId: job.id,
      extractedParams: params,
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload,
      }
    });

    recordTaskCompletion('alice', taskId, task.instruction, `ToolboxJob created: ${job.id}`).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Alice agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({ where: { id: taskIdForError }, data: { status: 'FAILED' } }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

