import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt } from '@/lib/bristh-config';
import { sendGraceDraft, type GraceDraft } from '@/lib/grace-mailer';

// Allow up to 300s for email drafting and attachment processing
export const maxDuration = 300;

/**
 * Grace — Email Dispatch.
 * Drafts the email; if the task requires approval the draft is parked as AWAITING_APPROVAL
 * and only sent once approved (see /api/bristh/approve and approval-reply).
 */
export async function POST(req: Request) {
  let taskIdForError = '';
  try {
    const { taskId, locale } = await req.json();
    taskIdForError = taskId;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { context: { include: { user: true } } },
    });

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' }
    });

    const fallbackPersona = 'You are Grace, the Email Dispatch Specialist at Bristh Enrollment Partners. Compose and send professional emails with attachments.';

    const systemPrompt = await buildAgentPrompt('grace', task.instruction, task.context.rawContent, fallbackPersona, locale)
      + `\n\nExtract email details. Output ONLY a valid JSON object:
{
  "to": "recipient email address. Empty string if none is stated.",
  "cc": "CC email(s), comma-separated. Omit or empty string if not specified.",
  "subject": "Professional email subject",
  "htmlBody": "HTML formatted body. Professional, well-spaced, polite. Mention any attachments."
}`;

    const { client, config } = await getModelClient();
    const tracker = new TokenTracker();
    const response = await trackableCompletion(
      tracker, 'grace_main', client, config,
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }], { requireJson: true })
    );

    let rawJson = response.choices[0].message.content || '{}';
    rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedEmail = JSON.parse(rawJson);

    // No explicit recipient → send to the task owner rather than guessing
    const to = typeof parsedEmail.to === 'string' && parsedEmail.to.includes('@')
      ? parsedEmail.to
      : task.context.user?.email;
    if (!to) {
      throw new Error('No recipient email found in the instruction, and the task owner has no email bound.');
    }

    let htmlBody: string = parsedEmail.htmlBody || '';
    const failedSiblings = await prisma.task.findMany({
      where: { contextId: task.contextId, id: { not: taskId }, status: 'FAILED' }
    });
    if (failedSiblings.length > 0) {
      const failedNames = failedSiblings.map(t => t.agent).join(', ');
      console.warn(`[Grace] Warning: ${failedNames} failed. Proceeding with available results.`);
      htmlBody += `<br/><hr/><p style="color:#b91c1c;font-size:12px;">⚠️ Note: ${failedNames} task(s) failed and their outputs are not included.</p>`;
    }

    const draft: GraceDraft = { to, cc: parsedEmail.cc || '', subject: parsedEmail.subject, htmlBody };
    await tracker.persist('agent', 'grace', taskId, task.context.id).catch(() => {});

    if (task.requiresApproval) {
      const preview = `### 📝 Email Draft — awaiting approval\n\n**To**: ${to}${draft.cc ? `\n**CC**: ${draft.cc}` : ''}\n**Subject**: ${draft.subject}\n\n**Body Preview**:\n${htmlBody.replace(/<[^>]+>/g, '')}`;
      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'AWAITING_APPROVAL',
          resultPayload: JSON.stringify({ summary: `📝 Draft to ${to}: ${draft.subject} (not sent)`, content: preview, draft }),
        }
      });
      return NextResponse.json({ success: true, task: updatedTask });
    }

    await prisma.task.update({ where: { id: taskId }, data: { resultPayload: JSON.stringify({ draft }) } });
    const updatedTask = await sendGraceDraft(taskId);
    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Grace agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
