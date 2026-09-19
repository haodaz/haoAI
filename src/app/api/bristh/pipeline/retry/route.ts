import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/bristh/pipeline/retry
 * Body: { taskId: string }
 * Resets a FAILED task to PENDING so the next /pipeline/advance call re-runs it
 * with the outputs of earlier phases.
 */
export async function POST(req: Request) {
  try {
    const { taskId } = await req.json();
    if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });

    const { count } = await prisma.task.updateMany({
      where: { id: taskId, status: 'FAILED' },
      data: { status: 'PENDING', resultPayload: null },
    });
    if (count === 0) return NextResponse.json({ error: 'Only failed tasks can be retried' }, { status: 409 });

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { contextId: true } });
    return NextResponse.json({ success: true, contextId: task?.contextId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
