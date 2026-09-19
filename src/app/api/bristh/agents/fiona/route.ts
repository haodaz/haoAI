import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { internalFetch } from '@/lib/internal-api';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';

// Keywords that indicate a brochure task (not a memo)
const BROCHURE_KEYWORDS = /brochure|flyer|leaflet|tri-?fold|booklet|画册|传单|折页|宣传册|pamphlet|print.*design/i;

function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

// Allow up to 300s — brochure generation needs time
export const maxDuration = 300;

export async function POST(req: Request) {
  let taskIdForError = '';
  try {
    const { taskId, locale } = await req.json();
    taskIdForError = taskId;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { context: true }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' }
    });

    const isBrochure = BROCHURE_KEYWORDS.test(task.instruction + ' ' + task.context.rawContent);

    if (isBrochure) {
      // ── BROCHURE MODE ──
      return await handleBrochure(task, taskId, locale);
    } else {
      // ── MEMO MODE (original behavior) ──
      return await handleMemo(task, taskId, locale);
    }
  } catch (error: any) {
    console.error('Fiona agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── Memo handler (original Fiona behavior) ──
async function handleMemo(task: any, taskId: string, locale?: string) {
  const fallbackPersona = 'You are Fiona, the Communications Specialist at BEP. Draft professional Internal Memos for absent stakeholders.';
  
  const systemPrompt = await buildAgentPrompt('fiona', task.instruction, task.context.rawContent, fallbackPersona, locale)
    + '\n\nDraft a professional Internal Memo in Markdown:\n**TO:** [Relevant Absent Stakeholders]\n**FROM:** [Meeting Participants / Chief AI]\n**DATE:** [Current Date]\n**SUBJECT:** [Summary]\n\n---\n[Body with key points and action items]\n\nOutput ONLY raw Markdown.';

  const { client, config } = await getModelClient();
  const tracker = new TokenTracker();
  const response = await trackableCompletion(
    tracker, 'fiona_memo', client, config,
    buildCompletionParams(config, [{ role: 'system', content: systemPrompt }])
  );

  const resultMarkdown = response.choices[0].message.content || 'Failed to generate memo.';
  const summaryMatch = resultMarkdown.match(/^#+ (.+)/m);
  const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : resultMarkdown.slice(0, 80).replace(/[#*]/g, '').trim();

  const resultPayload = JSON.stringify({
    summary: `📢 ${summary}`,
    content: resultMarkdown
  });

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: { 
      status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
      resultPayload
    }
  });

  await tracker.persist('agent', 'fiona', taskId, task.context.id).catch(() => {});
  return NextResponse.json({ success: true, task: updatedTask });
}

// ── Brochure handler (calls /api/toolbox/brochure internally) ──
async function handleBrochure(task: any, taskId: string, locale?: string) {
  const { client, config } = await getModelClient();
  const tracker = new TokenTracker();

  // Detect format from instruction
  let format = 'single';
  if (/tri-?fold|三折/i.test(task.instruction)) format = 'trifold';
  else if (/booklet|多页|multi/i.test(task.instruction)) format = 'multipage';

  // Call the brochure API internally (same server)
  const brochureRes = await internalFetch('/api/toolbox/brochure', {
    method: 'POST',
    body: JSON.stringify({
      topic: task.instruction,
      background: task.context.rawContent,
      format,
      style: 'bep',
      pageCount: '4',
    })
  });

  // Check HTTP status first
  if (!brochureRes.ok) {
    const errBody = await brochureRes.text().catch(() => '');
    console.error(`[Fiona] Brochure API returned ${brochureRes.status}: ${errBody.substring(0, 500)}`);
    throw new Error(`Brochure API returned status ${brochureRes.status}: ${errBody.substring(0, 200)}`);
  }

  // Parse SSE stream to get final result
  const text = await brochureRes.text();
  console.log(`[Fiona] Brochure response length: ${text.length}, first 300 chars: ${text.substring(0, 300)}`);
  
  const lines = text.split('\n\n');
  let brochureResult: any = null;
  let assetId = '';
  let lastError = '';

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const data = JSON.parse(line.substring(6));
      if (data.type === 'result' && data.data?.brochure) {
        brochureResult = data.data.brochure;
        assetId = data.data.assetId || '';
      } else if (data.type === 'error') {
        lastError = data.data?.message || JSON.stringify(data.data);
        console.error(`[Fiona] Brochure pipeline error event: ${lastError}`);
      }
    } catch { /* ignore */ }
  }

  if (!brochureResult) {
    throw new Error(`Brochure generation failed: ${lastError || 'no result event in SSE stream'}`);
  }

  const toolboxUrl = `/toolbox/brochure?assetId=${assetId}`;
  const resultPayload = JSON.stringify({
    summary: `📄 Brochure: ${brochureResult.title || task.instruction}`,
    content: `## Brochure Generated\n\n**Format:** ${format}\n**Pages:** ${brochureResult.pages?.length || 0}\n\n[Open in Brochure Designer](${toolboxUrl})`,
    toolboxUrl,
    assetId,
  });

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
      resultPayload
    }
  });

  await tracker.persist('agent', 'fiona', taskId, task.context.id).catch(() => {});
  await recordTaskCompletion('fiona', taskId, task.instruction, `Brochure: ${brochureResult?.title || 'untitled'}`).catch(() => {});

  return NextResponse.json({ success: true, task: updatedTask });
}
