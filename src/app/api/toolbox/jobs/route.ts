import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/toolbox/jobs?id=xxx
 * Returns a ToolboxJob by ID (used by Toolbox pages to auto-fill form)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const job = await prisma.toolboxJob.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ error: 'Job not found or expired' }, { status: 404 });

    if (job.expiresAt < new Date()) {
      await prisma.toolboxJob.delete({ where: { id } }).catch(() => {});
      return NextResponse.json({ error: 'Job expired' }, { status: 410 });
    }

    await prisma.toolboxJob.update({ where: { id }, data: { status: 'OPENED' } });

    return NextResponse.json({
      id: job.id,
      tool: job.tool,
      params: JSON.parse(job.params),
      background: job.background,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/toolbox/jobs
 * Creates a new ToolboxJob (called by Agent routes)
 */
export async function POST(req: Request) {
  try {
    const { tool, params, background } = await req.json();
    if (!tool || !params) return NextResponse.json({ error: 'Missing tool or params' }, { status: 400 });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const job = await prisma.toolboxJob.create({
      data: {
        tool,
        params: typeof params === 'string' ? params : JSON.stringify(params),
        background: background || '',
        expiresAt,
      }
    });

    return NextResponse.json({ id: job.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
