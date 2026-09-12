import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion, getInternalBaseUrl } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';

// Allow up to 300s — same as the PPT tool pipeline
export const maxDuration = 300;

/**
 * Edda Agent v2 — Think + Delegate architecture
 *
 * Phase 1 (Think): Lightweight LLM call to extract parameters from task instruction
 * Phase 2 (Delegate): Call /api/toolbox/ppt internally and parse SSE result
 * Phase 3 (Save): Store result with toolboxUrl link
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

    const extractionPrompt = `You are Edda, the Presentation Specialist. Analyze this task and extract the key parameters needed to generate a professional presentation.

Task instruction: "${task.instruction}"
Context: ${task.context.rawContent || 'No additional context'}
${localAttachmentText ? `\nAttached content:\n${localAttachmentText}` : ''}

Return ONLY valid JSON:
{
  "topic": "The main topic/title for the presentation",
  "slideCount": 10,
  "preferences": "Any specific design preferences or requirements mentioned",
  "background": "Summary of the key business context that should be reflected in slides"
}`;

    const extractRes = await trackableCompletion(
      tracker, 'edda_param_extraction', client, config,
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
        slideCount: 10,
        preferences: '',
        background: task.context.rawContent?.slice(0, 2000) || '',
      };
    }

    // ── Phase 2: Delegate — Call the PPT Tool pipeline ──
    const baseUrl = getInternalBaseUrl();
    
    const pptRes = await fetch(`${baseUrl}/api/toolbox/ppt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: params.topic || task.instruction,
        slideCount: String(params.slideCount || 10),
        density: 'medium',
        background: params.background || task.context.rawContent || '',
        preferences: params.preferences || '',
        kbFileIds: attachmentKbIds.length > 0 ? attachmentKbIds : undefined,
        theme: 'bep',
      })
    });

    // Parse SSE stream to extract final result
    if (!pptRes.ok) {
      const errBody = await pptRes.text().catch(() => '');
      console.error(`[Edda] PPT API returned ${pptRes.status}: ${errBody.substring(0, 500)}`);
      throw new Error(`PPT API returned status ${pptRes.status}: ${errBody.substring(0, 200)}`);
    }

    const responseText = await pptRes.text();
    console.log(`[Edda] PPT response length: ${responseText.length}, first 300 chars: ${responseText.substring(0, 300)}`);
    
    const lines = responseText.split('\n\n');
    let pptResult: any = null;
    let lastError = '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.substring(6));
        if (data.type === 'result') {
          pptResult = data.data;
        } else if (data.type === 'error') {
          lastError = data.data?.message || JSON.stringify(data.data);
          console.error(`[Edda] PPT pipeline error event: ${lastError}`);
        }
      } catch { /* ignore partial SSE lines */ }
    }

    if (!pptResult || !pptResult.fileUrl) {
      throw new Error(`PPT Tool pipeline failed: ${lastError || 'no result event in SSE stream'}`);
    }

    // ── Phase 3: Save — Store result with file link and toolbox URL ──
    const toolCallsLog = JSON.stringify([
      {
        tool: 'ppt_toolbox_pipeline',
        status: 'success',
        logs: [
          '⏳ [Phase 1] Extracted presentation parameters from task',
          `✅ Topic: "${params.topic}", Slides: ${params.slideCount}`,
          `✅ KB files: ${attachmentKbIds.length > 0 ? attachmentKbIds.length + ' attached' : 'auto-search'}`,
          '⏳ [Phase 2] Delegated to PPT Tool (3-phase pipeline)',
          `✅ PPT Tool completed: ${pptResult.slideCount || '?'} slides rendered`,
          `✅ PPTX file: ${pptResult.fileName || 'generated'}`,
        ]
      }
    ]);

    // Look up the asset that the PPT tool created
    let assetId = '';
    try {
      const latestAsset = await prisma.generatedAsset.findFirst({
        where: { type: 'PPT' },
        orderBy: { createdAt: 'desc' }
      });
      if (latestAsset) assetId = latestAsset.id;
    } catch { /* ignore */ }

    const resultPayload = JSON.stringify({
      summary: `Generated ${pptResult.slideCount || '?'}-slide presentation: ${params.topic}`,
      fileUrl: pptResult.fileUrl,
      rawSlides: pptResult.slides,
      assetId,
      toolboxUrl: assetId ? `/toolbox/ppt?assetId=${assetId}` : '/toolbox/ppt',
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload,
        thinkLog: `Edda analyzed the task and delegated to the PPT Tool pipeline.\nTopic: ${params.topic}\nSlides: ${params.slideCount}\nKB files: ${attachmentKbIds.length}`,
        toolCallsLog,
      }
    });

    await recordTaskCompletion('edda', taskId, task.instruction, `PPT ${pptResult.slideCount} slides`).catch(() => {});
    await tracker.persist('agent', 'edda', taskId, task.context.id).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Edda agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
