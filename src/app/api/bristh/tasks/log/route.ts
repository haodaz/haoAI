import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST: Save execution logs to a TaskContext
export async function POST(req: Request) {
  try {
    const { contextId, logs } = await req.json();

    if (!contextId || !logs) {
      return NextResponse.json({ error: 'Missing contextId or logs' }, { status: 400 });
    }

    // Save logs as JSON string to the TaskContext
    await prisma.taskContext.update({
      where: { id: contextId },
      data: { executionLog: JSON.stringify(logs) },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to save execution logs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: Retrieve execution logs for a TaskContext
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const contextId = searchParams.get('contextId');

    if (!contextId) {
      return NextResponse.json({ error: 'Missing contextId' }, { status: 400 });
    }

    const context = await prisma.taskContext.findUnique({
      where: { id: contextId },
      select: { executionLog: true },
    });

    if (!context) {
      return NextResponse.json({ error: 'Context not found' }, { status: 404 });
    }

    const logs = context.executionLog ? JSON.parse(context.executionLog) : [];
    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Failed to fetch execution logs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
