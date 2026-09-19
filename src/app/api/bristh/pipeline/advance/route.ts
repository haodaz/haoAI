import { NextResponse } from 'next/server';
import { advancePipeline } from '@/lib/pipeline';

// One call runs at most one phase; agents in a phase may each take several minutes.
export const maxDuration = 300;

/**
 * POST /api/bristh/pipeline/advance
 * Body: { contextId: string, locale?: string }
 * Runs the next runnable phase of a pipeline. Callers loop while state === 'progressed',
 * and poll again after a short delay while state === 'busy'.
 */
export async function POST(req: Request) {
  try {
    const { contextId, locale } = await req.json();
    if (!contextId) return NextResponse.json({ error: 'Missing contextId' }, { status: 400 });
    const result = await advancePipeline(contextId, locale);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Pipeline/Advance] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
