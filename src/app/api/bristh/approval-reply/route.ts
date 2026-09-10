import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';

/**
 * POST /api/bristh/approval-reply
 * Process a user's email reply to an approval notification.
 * 
 * Body: { contextId: string, replyContent: string }
 * 
 * Uses AI to parse the reply and determine per-task actions:
 * - "approve" → call approve logic
 * - "revise" → call copilot to modify, then re-notify
 */
export async function POST(req: Request) {
  try {
    const { contextId, replyContent } = await req.json();

    if (!contextId || !replyContent) {
      return NextResponse.json({ error: 'Missing contextId or replyContent' }, { status: 400 });
    }

    // Load context with awaiting tasks
    const context = await prisma.taskContext.findUnique({
      where: { id: contextId },
      include: { tasks: true },
    });

    if (!context) {
      return NextResponse.json({ error: 'TaskContext not found' }, { status: 404 });
    }

    const awaitingTasks = context.tasks.filter(t => t.status === 'AWAITING_APPROVAL');
    if (awaitingTasks.length === 0) {
      return NextResponse.json({ message: 'No tasks awaiting approval', actions: [] });
    }

    // Build task list for AI context
    const taskList = awaitingTasks.map((t, i) => `#${i + 1} — ${t.agent}: ${t.instruction.substring(0, 80)}`).join('\n');

    // Use AI to parse the reply
    const { client, config } = await getModelClient();
    const parsePrompt = `You are parsing a user's email reply to an approval notification. The user was asked to review these AI-generated tasks:

${taskList}

The user replied with:
---
${replyContent}
---

Parse the user's intent for EACH task. Output a JSON array where each item has:
- "taskNumber": number (1-indexed, matching the task list above)
- "action": "approve" | "revise"  
- "feedback": string (only for "revise" — the specific modification request. Empty string for "approve")

Rules:
- If user says "全部确认", "all approved", "OK", "确认" (without a number), mark ALL tasks as "approve"
- If user references a specific number like "#1 确认" or "#1 OK", only that task is "approve"  
- If user says "#2 请修改..." or "#2 改为...", that task is "revise" with the feedback
- If user's intent is unclear for a task, default to "approve"
- Always return entries for ALL awaiting tasks

Output ONLY valid JSON array. No markdown, no explanations.`;

    const tracker = new TokenTracker();
    const response = await trackableCompletion(
      tracker, 'approval_parse', client, config,
      buildCompletionParams(config, [
        { role: 'system', content: parsePrompt },
      ], { requireJson: true })
    );

    let rawResponse = response.choices[0].message.content || '[]';
    rawResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let actions: Array<{ taskNumber: number; action: 'approve' | 'revise'; feedback: string }>;
    try {
      const parsed = JSON.parse(rawResponse);
      actions = Array.isArray(parsed) ? parsed : parsed.actions || parsed.tasks || [];
    } catch {
      const arrMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        actions = JSON.parse(arrMatch[0]);
      } else {
        console.error('[ApprovalReply] Failed to parse AI response:', rawResponse.substring(0, 500));
        return NextResponse.json({ error: 'Failed to parse reply intent' }, { status: 500 });
      }
    }

    console.log(`[ApprovalReply] Parsed ${actions.length} action(s) from reply`);

    const results: any[] = [];
    let hasRevisions = false;

    for (const action of actions) {
      const taskIndex = action.taskNumber - 1;
      if (taskIndex < 0 || taskIndex >= awaitingTasks.length) continue;
      const task = awaitingTasks[taskIndex];

      if (action.action === 'approve') {
        // Approve this task
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'APPROVED' },
        });
        console.log(`[ApprovalReply] #${action.taskNumber} ${task.agent}: APPROVED`);
        results.push({ taskNumber: action.taskNumber, agent: task.agent, action: 'approved' });

      } else if (action.action === 'revise') {
        hasRevisions = true;
        console.log(`[ApprovalReply] #${action.taskNumber} ${task.agent}: REVISION requested — "${action.feedback}"`);

        // Call the agent's copilot endpoint to apply the modification
        try {
          const copilotRes = await fetch(`http://localhost:5859/api/bristh/copilot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: task.id,
              message: action.feedback,
            }),
          });

          if (copilotRes.ok) {
            // After copilot revision, set status back to AWAITING_APPROVAL
            await prisma.task.update({
              where: { id: task.id },
              data: { status: 'AWAITING_APPROVAL' },
            });
            console.log(`[ApprovalReply] #${action.taskNumber} ${task.agent}: Revision applied, awaiting re-approval`);
            results.push({ taskNumber: action.taskNumber, agent: task.agent, action: 'revised' });
          } else {
            console.error(`[ApprovalReply] Copilot failed for ${task.agent}`);
            results.push({ taskNumber: action.taskNumber, agent: task.agent, action: 'revision_failed' });
          }
        } catch (err: any) {
          console.error(`[ApprovalReply] Copilot error for ${task.agent}:`, err.message);
          results.push({ taskNumber: action.taskNumber, agent: task.agent, action: 'revision_failed' });
        }
      }
    }

    // Check if all tasks are now approved
    const stillAwaiting = await prisma.task.findMany({
      where: {
        contextId,
        requiresApproval: true,
        status: 'AWAITING_APPROVAL',
      },
    });

    const allApproved = stillAwaiting.length === 0 && !hasRevisions;

    if (allApproved) {
      await prisma.taskContext.update({
        where: { id: contextId },
        data: { pipelineStatus: 'ALL_APPROVED' },
      });

      // Auto-trigger Grace if present
      const graceTask = context.tasks.find(t => t.agent.toLowerCase() === 'grace');
      if (graceTask) {
        console.log(`[ApprovalReply] All approved! Triggering Grace...`);
        try {
          await fetch(`http://localhost:5859/api/bristh/agents/grace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: graceTask.id }),
          });
          console.log(`[ApprovalReply] Grace completed.`);
        } catch (err: any) {
          console.error(`[ApprovalReply] Grace error:`, err.message);
        }
      }
    }

    // If there were revisions, re-send notification email
    if (hasRevisions && stillAwaiting.length > 0) {
      console.log(`[ApprovalReply] Revisions applied. Re-sending notification email...`);
      try {
        await fetch(`http://localhost:5859/api/bristh/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextId }),
        });
        console.log(`[ApprovalReply] Notification re-sent.`);
      } catch (err: any) {
        console.error(`[ApprovalReply] Notify error:`, err.message);
      }
    }

    await tracker.persist('agent', 'approval', undefined, contextId).catch(() => {});

    return NextResponse.json({
      success: true,
      results,
      allApproved,
      remainingApprovals: stillAwaiting.length,
    });

  } catch (error: any) {
    console.error('ApprovalReply error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
