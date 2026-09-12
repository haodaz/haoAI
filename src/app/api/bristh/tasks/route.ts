import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';

// Extract session from cookie
async function getSession(): Promise<{ userId: string; role: string } | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('autoffice_session')?.value;
    if (!raw) return null;
    const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    return { userId: session.userId, role: session.role };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const contextId = searchParams.get('contextId');
    const mode = searchParams.get('mode');
    const approvalEmailId = searchParams.get('approvalEmailId');

    // Approval email ID lookup (used by email-daemon to match replies)
    if (approvalEmailId) {
      const context = await prisma.taskContext.findFirst({
        where: { approvalEmailId },
        select: { id: true },
      });
      if (context) {
        return NextResponse.json({ contextId: context.id });
      }
      return NextResponse.json({ contextId: null });
    }

    // Get current session for data isolation
    const session = await getSession();
    const isAdmin = session?.role === 'admin';

    // Build where clause for userId filtering
    // Admin sees all; User sees only their own + legacy tasks with no userId
    const userFilter = isAdmin ? {} : { userId: session?.userId || '__none__' };

    // History mode: return contexts with their tasks
    if (mode === 'history') {
      const contexts = await prisma.taskContext.findMany({
        where: userFilter,
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          tasks: {
            orderBy: { createdAt: 'asc' }
          },
          user: {
            select: { username: true, displayName: true }
          }
        }
      });
      return NextResponse.json(contexts);
    }

    if (!contextId) {
      const tasks = await prisma.task.findMany({
        where: isAdmin ? {} : { context: userFilter },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { context: { include: { user: { select: { username: true, displayName: true } } } } }
      });
      return NextResponse.json(tasks);
    }

    let targetContextId = contextId;
    if (contextId === 'latest') {
      const latestContext = await prisma.taskContext.findFirst({
        where: userFilter,
        orderBy: { createdAt: 'desc' },
      });
      if (!latestContext) {
        return NextResponse.json([]);
      }
      targetContextId = latestContext.id;
    }

    const tasks = await prisma.task.findMany({
      where: { contextId: targetContextId },
      orderBy: { createdAt: 'asc' },
      include: { context: true },
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    console.error('Fetch tasks error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
