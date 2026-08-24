import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { recordTaskCompletion } from '@/lib/memory-hooks';
import { generateProposal } from '@/lib/toolbox-generators';

export const maxDuration = 300; // Allow long tool generation

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

    // ── Step 1: Lightweight param extraction ──
    const { client, config } = await getModelClient();
    const extractionPrompt = `Extract key parameters from this proposal request. Return ONLY valid JSON.

User instruction: "${task.instruction}"

Output format:
{
  "targetSchool": "school name (string, or 'Unknown' if not specified)",
  "schoolProfile": "any school profile details mentioned",
  "businessModel": "Fixed Retainer | Performance Partnership | Hybrid (混合模式)",
  "focusAreas": ["array", "of", "focus", "areas"],
  "additionalNotes": "any other relevant details"
}`;

    const extractRes = await client.chat.completions.create(
      buildCompletionParams(config, [{ role: 'user', content: extractionPrompt }], { requireJson: true })
    );

    let params: Record<string, any> = {};
    try {
      params = JSON.parse(extractRes.choices[0].message.content || '{}');
    } catch {
      params = {
        targetSchool: task.instruction.match(/([A-Z][a-z]+(?:'s)?\s+(?:College|School|University|Academy))/)?.[1] || 'Unknown',
        businessModel: 'Fixed Retainer',
        focusAreas: [],
        additionalNotes: task.instruction,
      };
    }

    // ── Step 2: Call the proposal generator and wait for full result ──
    // Progress callback writes to task.resultPayload so the frontend ticker can show live status
    const writeProgress = async (msg: string) => {
      try {
        await prisma.task.update({
          where: { id: taskId },
          data: { resultPayload: JSON.stringify({ progress: msg }) }
        });
      } catch { /* non-blocking */ }
    };

    await writeProgress('[1/4] 正在检索 BEP 核心知识库...');

    const result = await generateProposal(
      {
        targetSchool: params.targetSchool,
        schoolProfile: params.schoolProfile,
        businessModel: params.businessModel || 'Fixed Retainer',
        focusAreas: params.focusAreas || [],
        background: task.context?.rawContent || '',
      },
      writeProgress // live progress ticker
    );

    // ── Step 3: Bring result back to task — content is now in the pipeline ──
    const toolboxUrl = `/toolbox/proposal?assetId=${result.assetId}`;
    const summary = `📋 ${result.title} 已生成完毕`;

    const resultPayload = JSON.stringify({
      summary,
      content: result.content,       // downstream agents (Grace, etc.) can read this
      assetId: result.assetId,
      toolboxUrl,                    // Copilot 精修入口
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload,
      }
    });

    recordTaskCompletion('alice', taskId, task.instruction, summary).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Alice agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({ where: { id: taskIdForError }, data: { status: 'FAILED' } }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
