import prisma from '@/lib/prisma';
import { internalFetch } from '@/lib/internal-api';

// ============================================
// Server-side pipeline state machine
// The DB is the source of truth. Each advancePipeline() call runs at most one phase,
// so any driver (browser tab, email daemon) can resume a pipeline where it stopped.
// ============================================

export type AdvanceState =
  | 'progressed'        // ran a phase; call again to continue
  | 'busy'              // tasks are still RUNNING (another driver owns them); poll again later
  | 'awaiting_approval' // paused on human approval
  | 'completed';        // every task reached a terminal state

export interface PriorPhaseResult { agent: string; summary: string; content: string }

const DONE_STATUSES = new Set(['COMPLETED', 'APPROVED', 'FAILED']);

function phaseOf(t: { phase: number | null }): number {
  return Number(t.phase) || 1;
}

function parsePayload(raw: string | null): { summary: string; content: string } {
  if (!raw) return { summary: '', content: '' };
  try {
    const p = JSON.parse(raw);
    return { summary: p.summary || '', content: p.content || '' };
  } catch {
    return { summary: '', content: raw };
  }
}

/** Outputs of all completed/approved tasks in phases before `phase`. */
function priorResults(tasks: { agent: string; phase: number; status: string; resultPayload: string | null }[], phase: number): PriorPhaseResult[] {
  return tasks
    .filter(t => phaseOf(t) < phase && (t.status === 'COMPLETED' || t.status === 'APPROVED'))
    .map(t => ({ agent: t.agent, ...parsePayload(t.resultPayload) }));
}

async function runTask(task: { id: string; agent: string }, locale: string | undefined, prior: PriorPhaseResult[]) {
  try {
    const res = await internalFetch(`/api/bristh/agents/${task.agent.toLowerCase()}`, {
      method: 'POST',
      body: JSON.stringify({ taskId: task.id, locale, priorPhaseResults: prior }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Agent returned ${res.status}`);
    }
  } catch (err: any) {
    console.error(`[Pipeline] ${task.agent} (${task.id}) failed:`, err.message);
    // Agent routes mark FAILED themselves; this covers unknown agents / network errors.
    await prisma.task.updateMany({
      where: { id: task.id, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'FAILED' },
    });
  }
}

async function sendApprovalNotification(contextId: string) {
  try {
    const res = await internalFetch('/api/bristh/notify', { method: 'POST', body: JSON.stringify({ contextId }) });
    return await res.json().catch(() => ({}));
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function advancePipeline(contextId: string, locale?: string): Promise<{ state: AdvanceState; phase?: number; notification?: any }> {
  const context = await prisma.taskContext.findUnique({ where: { id: contextId }, include: { tasks: true } });
  if (!context) throw new Error('TaskContext not found');
  if (context.pipelineStatus === 'DRAFT') throw new Error('Pipeline has not been confirmed yet');

  const phases = [...new Set(context.tasks.map(phaseOf))].sort((a, b) => a - b);

  for (const phase of phases) {
    const group = context.tasks.filter(t => phaseOf(t) === phase);

    if (group.some(t => t.status === 'AWAITING_APPROVAL')) {
      return { state: 'awaiting_approval', phase };
    }
    if (group.some(t => t.status === 'RUNNING')) {
      return { state: 'busy', phase };
    }
    if (group.every(t => DONE_STATUSES.has(t.status))) continue;

    // Claim pending tasks atomically so two drivers never run the same task.
    const pending = group.filter(t => t.status === 'PENDING');
    const claimed: typeof pending = [];
    for (const t of pending) {
      const { count } = await prisma.task.updateMany({ where: { id: t.id, status: 'PENDING' }, data: { status: 'RUNNING' } });
      if (count === 1) claimed.push(t);
    }
    if (claimed.length === 0) return { state: 'busy', phase };

    await prisma.taskContext.update({ where: { id: contextId }, data: { pipelineStatus: 'ACTIVE' } });
    const prior = priorResults(context.tasks, phase);
    await Promise.all(claimed.map(t => runTask(t, locale, prior)));

    const after = await prisma.task.findMany({ where: { contextId, id: { in: group.map(t => t.id) } }, select: { status: true } });
    if (after.some(t => t.status === 'AWAITING_APPROVAL')) {
      const notification = await sendApprovalNotification(contextId);
      await prisma.taskContext.update({ where: { id: contextId }, data: { pipelineStatus: 'AWAITING_APPROVAL' } });
      return { state: 'awaiting_approval', phase, notification };
    }
    return { state: 'progressed', phase };
  }

  if (context.pipelineStatus !== 'COMPLETED') {
    await prisma.taskContext.update({ where: { id: contextId }, data: { pipelineStatus: 'COMPLETED' } });
  }
  return { state: 'completed' };
}

