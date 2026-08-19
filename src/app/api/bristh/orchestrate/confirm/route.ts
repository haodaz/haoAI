import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Phase 2 of 2-step orchestration:
 * Receives the user's approval configuration and creates actual Task records.
 * Transitions the TaskContext from DRAFT to ACTIVE.
 */

export async function POST(req: Request) {
  try {
    const { contextId, approvalConfig } = await req.json();
    // approvalConfig: string[] — agent names that require human approval, e.g. ["Alice", "Eric"]

    if (!contextId) {
      return NextResponse.json({ error: 'Missing contextId' }, { status: 400 });
    }

    // Load the DRAFT context
    const context = await prisma.taskContext.findUnique({
      where: { id: contextId },
    });

    if (!context) {
      return NextResponse.json({ error: 'TaskContext not found' }, { status: 404 });
    }

    if (!context.parsedData) {
      return NextResponse.json({ error: 'No analysis data found. Run analyze first.' }, { status: 400 });
    }

    const parsedData = JSON.parse(context.parsedData);
    const tasksToCreate = parsedData.tasks || [];

    if (tasksToCreate.length === 0) {
      return NextResponse.json({ error: 'No tasks in analysis' }, { status: 400 });
    }

    // Normalize approval config
    const approvalSet = new Set((approvalConfig || []).map((a: string) => a.toLowerCase()));

    // Create Task records with requiresApproval flag
    const createdTasks = await Promise.all(
      tasksToCreate.map((t: any) =>
        prisma.task.create({
          data: {
            contextId: context.id,
            agent: t.agent,
            instruction: t.instruction,
            status: 'PENDING',
            requiresApproval: approvalSet.has(t.agent.toLowerCase()),
            attachmentIds: t.attachmentIds?.length ? JSON.stringify(t.attachmentIds) : null,
            phase: t.phase || 1,
          }
        })
      )
    );

    // Update context: store approval config and transition from DRAFT to ACTIVE
    await prisma.taskContext.update({
      where: { id: contextId },
      data: {
        approvalConfig: JSON.stringify(approvalConfig || []),
        pipelineStatus: 'ACTIVE',
      }
    });

    return NextResponse.json({
      success: true,
      contextId: context.id,
      tasks: createdTasks,
    });

  } catch (error: any) {
    console.error('Orchestration confirm error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
