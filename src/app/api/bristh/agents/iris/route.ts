import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { buildAgentPrompt } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';
import fs from 'fs/promises';
import path from 'path';

// Allow up to 120s for webpage generation (large HTML output)
export const maxDuration = 120;

/**
 * Robust JSON extraction
 */
function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  return null;
}

/**
 * Auto-publish site to /sites/slug
 */
async function publishSite(site: any): Promise<string> {
  const SITES_DIR = path.join(process.cwd(), 'public', '_sites');
  try { await fs.mkdir(SITES_DIR, { recursive: true }); } catch {}
  
  const slug = (site.name || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'site-' + Date.now();

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

    // 1. Update status to RUNNING
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' }
    });

    // 2. Build prompt
    const fallbackPersona = 'You are Iris, the Web Designer at Bristh Enrollment Partners. You create stunning marketing landing pages using Tailwind CSS.';
    
    let finalBackground = task.context.rawContent;
    if (task.attachmentIds) {
      try {
        const attIds = JSON.parse(task.attachmentIds);
        const contextAttachments = task.context.attachments ? JSON.parse(task.context.attachments) : [];
        const matched = contextAttachments.filter((a: any) => attIds.includes(a.id));
        
        const kbIds = matched.filter((a: any) => a.isKbFile).map((a: any) => a.id);
        const localExtracted = matched.filter((a: any) => !a.isKbFile).map((a: any) => `【上传文件: ${a.originalName}】\n${a.extractedText || a.summary}`).join('\n\n');
        
        let kbTexts = '';
        if (kbIds.length > 0) {
          const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbIds } } });
          kbTexts = kbFiles.map(f => `【知识库文件: ${f.title}】\n${f.content || '无正文'}`).join('\n\n');
        }
        
        const extraContext = [localExtracted, kbTexts].filter(Boolean).join('\n\n');
        if (extraContext) {
           finalBackground = finalBackground + '\n\n' + extraContext;
        }
      } catch (e) {
        console.error('Failed to parse attachments for Iris', e);
      }
    }

    const systemPrompt = await buildAgentPrompt('iris', task.instruction, finalBackground, fallbackPersona, locale)
      + `\n\nBased on this context, generate a complete multi-page marketing website as a JSON object.

CRITICAL REQUIREMENTS:
1. All HTML must use Tailwind CSS classes (loaded via CDN)
2. Include image placeholders with data-image-placeholder attribute: <div class="bg-gray-200" data-image-placeholder="description"></div>
3. Create fully functional responsive layouts.
4. JSON ESCAPING: You MUST escape all double quotes inside the "html" string values using backslash (\\").
5. JSON FORMATTING: Do NOT use literal newlines inside string values. The "html" string must be a single continuous string.

OUTPUT FORMAT (strict JSON):
{
  "name": "Site Name",
  "themeColor": "#hex",
  "pages": [
    { "id": "home", "title": "首页", "html": "<section>...</section>", "inNav": true }
  ]
}

Generate 1-2 pages (keep it concise to avoid timeouts). Output ONLY valid JSON.`;

    const { client, config } = await getModelClient();
    const response = await client.chat.completions.create(
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }], { requireJson: true, maxTokens: 8192 })
    );

    const raw = response.choices[0].message.content || '';
    const site = extractJSON(raw);

    if (!site || !site.pages) {
      throw new Error('Failed to parse webpage JSON from LLM output');
    }

    // 3. Auto-publish to /sites/slug
    let publishedUrl = '';
    try {
      publishedUrl = await publishSite(site);
    } catch (e: any) {
      console.warn('Auto-publish failed (non-fatal):', e.message);
    }

    const generatedAsset = await prisma.generatedAsset.create({
      data: {
        type: 'WEB',
        title: site.name || ('Iris 生成的站点 ' + new Date().toLocaleTimeString('zh-CN')),
        payload: JSON.stringify({ site, publishedUrl })
      }
    });

    // 4. Save result with published URL for downstream agents (e.g. Grace)
    const summary = `🌐 已生成 ${site.pages.length} 页宣传站点「${site.name}」${publishedUrl ? ` → ${publishedUrl}` : ''}`;
    const resultPayload = JSON.stringify({
      summary,
      content: raw,
      site,
      publishedUrl,
      assetId: generatedAsset.id
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload
      }
    });

    // Memory hook
    recordTaskCompletion('iris', taskId, task.instruction, summary).catch(() => {});

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
