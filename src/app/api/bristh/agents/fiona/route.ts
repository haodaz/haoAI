import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt } from '@/lib/bristh-config';


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

    const fallbackPersona = 'You are Fiona, the Internal Communications Specialist at Bristh Enrollment Partners. Draft professional Internal Memos for absent stakeholders.';
    
    const systemPrompt = await buildAgentPrompt('fiona', task.instruction, task.context.rawContent, fallbackPersona, locale)
      + '\n\nDraft a professional Internal Memo in Markdown:\n**TO:** [Relevant Absent Stakeholders]\n**FROM:** [Meeting Participants / Chief AI]\n**DATE:** [Current Date]\n**SUBJECT:** [Summary]\n\n---\n[Body with key points and action items]\n\nOutput ONLY raw Markdown.';

    const { client, config } = await getModelClient();
    const tracker = new TokenTracker();
    const response = await trackableCompletion(
      tracker, 'fiona_main', client, config,
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }])
    );

    const resultMarkdown = response.choices[0].message.content || 'Failed to generate memo.';

    const summaryMatch = resultMarkdown.match(/^#+ (.+)/m);
    const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : resultMarkdown.slice(0, 80).replace(/[#*]/g, '').trim();

    const resultPayload = JSON.stringify({
      summary: `📢 ${summary}`,
      content: resultMarkdown
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload
      }
    });

    await tracker.persist('agent', 'fiona', taskId, task.context.id).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Fiona agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
