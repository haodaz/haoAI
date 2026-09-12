import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion, getInternalBaseUrl } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';
import fs from 'fs/promises';
import path from 'path';

// Allow up to 300s — same as the Webpage tool pipeline
export const maxDuration = 300;

const SITES_DIR = path.join(process.cwd(), 'public', '_sites');

/** Publish a generated site to /public/_sites/<slug>.json */
async function publishSite(site: any): Promise<string> {
  const slug = (site.name || 'site')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    + '-' + Date.now();

  await fs.mkdir(SITES_DIR, { recursive: true });
  await fs.writeFile(
    path.join(SITES_DIR, `${slug}.json`),
    JSON.stringify({
      slug,
      siteName: site.name,
      themeColor: site.themeColor,
      pages: site.pages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, null, 2),
    'utf-8'
  );

  return `/sites/${slug}`;
}

/**
 * Iris Agent v2 — Think + Delegate architecture
 *
 * Phase 1 (Think): Lightweight LLM call to extract parameters from task instruction
 * Phase 2 (Delegate): Call /api/toolbox/webpage internally and parse SSE result
 * Phase 3 (Save): Store result, publish site, create asset
 */
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

    // ── Phase 1: Think — Extract structured parameters ──
    const { client, config } = await getModelClient();
    const tracker = new TokenTracker();

    // Gather any KB file IDs from task attachments
    let attachmentKbIds: string[] = [];
    let localAttachmentText = '';
    if (task.attachmentIds) {
      try {
        const attIds = JSON.parse(task.attachmentIds);
        const contextAttachments = task.context.attachments ? JSON.parse(task.context.attachments) : [];
        const matched = contextAttachments.filter((a: any) => attIds.includes(a.id));
        attachmentKbIds = matched.filter((a: any) => a.isKbFile).map((a: any) => a.id);
        localAttachmentText = matched
          .filter((a: any) => !a.isKbFile)
          .map((a: any) => `[Uploaded: ${a.originalName}]\n${a.extractedText || a.summary || ''}`)
          .join('\n\n');
      } catch { /* ignore */ }
    }

    const extractionPrompt = `You are Iris, the Web Designer. Analyze this task and extract the key parameters needed to generate a professional marketing website.

Task instruction: "${task.instruction}"
Context: ${task.context.rawContent || 'No additional context'}
${localAttachmentText ? `\nAttached content:\n${localAttachmentText}` : ''}

Return ONLY valid JSON:
{
  "topic": "The main topic/purpose of the website",
  "pageCount": 3,
  "style": "bep",
  "preferences": "Any specific design preferences or requirements mentioned",
  "background": "Summary of the key business context that should be reflected in the website"
}

Style options: "bep" (BEP corporate green+gold), "education", "modern-tech", "business"`;

    const extractRes = await trackableCompletion(
      tracker, 'iris_param_extraction', client, config,
      buildCompletionParams(config, [{ role: 'user', content: extractionPrompt }], { requireJson: true, maxTokens: 2048 })
    );

    let params: Record<string, any> = {};
    try {
      let raw = extractRes.choices[0].message.content || '{}';
      raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      params = JSON.parse(raw);
    } catch {
      params = {
        topic: task.instruction.slice(0, 200),
        pageCount: 3,
        style: 'bep',
        preferences: '',
        background: task.context.rawContent?.slice(0, 2000) || '',
      };
    }

    // ── Phase 2: Delegate — Call the Webpage Tool pipeline ──
    const baseUrl = getInternalBaseUrl();

    const webRes = await fetch(`${baseUrl}/api/toolbox/webpage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: params.topic || task.instruction,
        pageCount: params.pageCount || 3,
        style: params.style || 'bep',
        background: params.background || task.context.rawContent || '',
        preferences: params.preferences || '',
        kbFileIds: attachmentKbIds.length > 0 ? attachmentKbIds : undefined,
      })
    });

    // Parse SSE stream to extract final result
    const responseText = await webRes.text();
    const lines = responseText.split('\n\n');
    let webResult: any = null;

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.substring(6));
        if (data.type === 'result') {
          webResult = data.data;
        }
      } catch { /* ignore partial SSE lines */ }
    }

    if (!webResult || !webResult.site) {
      throw new Error('Webpage Tool pipeline failed to produce a result');
    }

    const site = webResult.site;

    // ── Phase 3: Save — Publish site, create asset, store task result ──
    let publishedUrl = '';
    try {
      publishedUrl = await publishSite(site);
    } catch (e: any) {
      console.warn('Auto-publish failed (non-fatal):', e.message);
    }

    const generatedAsset = await prisma.generatedAsset.create({
      data: {
        type: 'WEB',
        title: site.name || `Iris Website — ${params.topic}`,
        payload: JSON.stringify({ site, publishedUrl })
      }
    });

    const toolCallsLog = JSON.stringify([
      {
        tool: 'webpage_toolbox_pipeline',
        status: 'success',
        logs: [
          '⏳ [Phase 1] Extracted website parameters from task',
          `✅ Topic: "${params.topic}", Pages: ${params.pageCount}, Style: ${params.style}`,
          `✅ KB files: ${attachmentKbIds.length > 0 ? attachmentKbIds.length + ' attached' : 'auto-search'}`,
          '⏳ [Phase 2] Delegated to Webpage Tool (multi-page pipeline)',
          `✅ Webpage Tool completed: ${site.pages?.length || '?'} pages generated`,
          publishedUrl ? `✅ Published to: ${publishedUrl}` : '⚠️ Publish skipped',
        ]
      }
    ]);

    const summary = `Generated ${site.pages?.length || '?'}-page website: ${site.name || params.topic}${publishedUrl ? ` → ${publishedUrl}` : ''}`;
    const resultPayload = JSON.stringify({
      summary,
      site,
      publishedUrl,
      assetId: generatedAsset.id,
      toolboxUrl: `/toolbox/webpage?assetId=${generatedAsset.id}`,
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload,
        thinkLog: `Iris analyzed the task and delegated to the Webpage Tool pipeline.\nTopic: ${params.topic}\nPages: ${params.pageCount}\nStyle: ${params.style}`,
        toolCallsLog,
      }
    });

    await recordTaskCompletion('iris', taskId, task.instruction, summary).catch(() => {});
    await tracker.persist('agent', 'iris', taskId, task.context.id).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Iris agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
