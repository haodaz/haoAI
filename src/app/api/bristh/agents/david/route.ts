import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';


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

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' }
    });

    const fallbackPersona = 'You are David, the Internal Audit & Remediation Specialist at Bristh Enrollment Partners.';
    
    const systemPrompt = await buildAgentPrompt('david', task.instruction, task.context.rawContent, fallbackPersona, locale)
      + '\n\nGenerate an "Internal Business Remediation Report" in Markdown. Include: 🚨 发现的隐患与问题 (Identified Issues) and 📋 业务整改建议 (Remediation Action Items). Output ONLY raw Markdown.';

    const { client, config } = await getModelClient();
    const tracker = new TokenTracker();
    const response = await trackableCompletion(
      tracker, 'david_main', client, config,
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }])
    );

    const resultMarkdown = response.choices[0].message.content || 'Failed to generate remediation report.';

    const summaryMatch = resultMarkdown.match(/^#+ (.+)/m);
    const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : resultMarkdown.slice(0, 80).replace(/[#*]/g, '').trim();

    const resultPayload = JSON.stringify({
      summary: `🚨 ${summary}`,
      content: resultMarkdown
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload
      }
    });

    recordTaskCompletion('david', taskId, task.instruction, resultMarkdown.slice(0, 200)).catch(() => {});

    await tracker.persist('agent', 'david', taskId, task.context.id).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('David agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
