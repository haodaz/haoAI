import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isGraceTask, sendGraceDraft } from '@/lib/grace-mailer';

/**
 * POST /api/bristh/approve
 * Approve a single task or all tasks in a context.
 * 
 * Body: { taskId: string }
 *   - Changes task status from AWAITING_APPROVAL → APPROVED
 *   - Checks if all approval-required tasks in the context are now approved
 *   - Approving a Grace draft sends the email
 *   - Returns { allApproved: boolean } so the caller can resume the pipeline
 */
export async function POST(req: Request) {
  try {
    const { taskId } = await req.json();

    if (!taskId) {
      return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
    }

    // Find the task
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Verify task is in the correct state
    if (task.status !== 'AWAITING_APPROVAL') {
      return NextResponse.json({ 
        error: `Task is not awaiting approval (current status: ${task.status})` 
      }, { status: 400 });
    }

    // Update task status to APPROVED (atomic, so a double click can't send an email twice)
    const { count } = await prisma.task.updateMany({
      where: { id: taskId, status: 'AWAITING_APPROVAL' },
      data: { status: 'APPROVED' }
    });
    if (count === 0) {
      return NextResponse.json({ error: 'Task was already approved' }, { status: 409 });
    }

    // Grace drafts are only sent once a human approves them
    if (isGraceTask(task)) {
      try {
        await sendGraceDraft(taskId);
      } catch (err: any) {
        await prisma.task.update({ where: { id: taskId }, data: { status: 'AWAITING_APPROVAL' } });
        return NextResponse.json({ error: `Email not sent: ${err.message}` }, { status: 500 });
      }
    }

    // Check if all approval-required tasks in this context are now approved
    const pendingApprovalTasks = await prisma.task.findMany({
      where: {
        contextId: task.contextId,
        requiresApproval: true,
        status: 'AWAITING_APPROVAL',
      }
    });

    const allApproved = pendingApprovalTasks.length === 0;

    // If all approved, update context pipeline status
    if (allApproved) {
      await prisma.taskContext.update({
        where: { id: task.contextId },
        data: { pipelineStatus: 'ALL_APPROVED' }
      });
    }

    // Get the approved task's agent name for the response
    return NextResponse.json({
      success: true,
      taskId,
      contextId: task.contextId,
      agent: task.agent,
      allApproved,
      remainingApprovals: pendingApprovalTasks.length,
    });

  } catch (error: any) {
    console.error('Approve error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
