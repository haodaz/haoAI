import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { recordTaskCompletion } from '@/lib/memory-hooks';
import { generateLegal } from '@/lib/toolbox-generators';

export const maxDuration = 300;

export async function POST(req: Request) {
  let taskIdForError = '';
  try {
    const { taskId } = await req.json();
    taskIdForError = taskId;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { context: true }
    });

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    await prisma.task.update({ where: { id: taskId }, data: { status: 'RUNNING' } });

    // ── Step 1: Build enriched background (preserve attachment logic) ──
    let finalBackground = task.context.rawContent;
    if (task.attachmentIds) {
      try {
        const attIds = JSON.parse(task.attachmentIds);
        const contextAttachments = task.context.attachments ? JSON.parse(task.context.attachments) : [];
        const matched = contextAttachments.filter((a: any) => attIds.includes(a.id));

        const kbIds = matched.filter((a: any) => a.isKbFile).map((a: any) => a.id);
        const localExtracted = matched
          .filter((a: any) => !a.isKbFile)
          .map((a: any) => `【上传文件: ${a.originalName}】\n${a.extractedText || a.summary}`)
          .join('\n\n');

        let kbTexts = '';
        if (kbIds.length > 0) {
          const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbIds } } });
          kbTexts = kbFiles.map((f: any) => `【知识库文件: ${f.title}】\n${f.content || '无正文'}`).join('\n\n');
        }

        const extraContext = [localExtracted, kbTexts].filter(Boolean).join('\n\n');
        if (extraContext) finalBackground = finalBackground + '\n\n' + extraContext;
      } catch (e) {
        console.error('Failed to parse attachments for Eric', e);
      }
    }

    // ── Step 2: Lightweight param extraction ──
    const { client, config } = await getModelClient();
    const extractionPrompt = `Extract legal document parameters from this request. Return ONLY valid JSON.

User instruction: "${task.instruction}"

Output format:
{
  "docType": "NDA | MOU | 服务协议 | 合作合同 | 劳动合同",
  "partyA": "Party A name (or empty string if unknown)",
  "partyB": "Party B name (or empty string if unknown)",
  "keyTerms": "key business terms mentioned (fees, duration, etc.)",
  "templateStyle": "标准英式 | 中英双语 | 简约版"
}`;

    const extractRes = await client.chat.completions.create(
      buildCompletionParams(config, [{ role: 'user', content: extractionPrompt }], { requireJson: true })
    );

    let params: Record<string, any> = {};
    try {
      params = JSON.parse(extractRes.choices[0].message.content || '{}');
    } catch {
      params = { docType: 'NDA', partyA: '', partyB: '', keyTerms: task.instruction, templateStyle: '标准英式' };
    }

    // ── Step 3: Call the legal generator and wait for full result ──
    const writeProgress = async (msg: string) => {
      try {
        await prisma.task.update({
          where: { id: taskId },
          data: { resultPayload: JSON.stringify({ progress: msg }) }
        });
      } catch { /* non-blocking */ }
    };

    await writeProgress('[1/4] 初始化参数，加载文书类型配置...');

    const result = await generateLegal(
      {
        docType: params.docType || 'NDA',
        partyA: params.partyA || 'British Enrolment Partners Ltd',
        partyB: params.partyB,
        keyTerms: params.keyTerms,
        background: finalBackground || '',
        templateStyle: params.templateStyle || '标准英式',
      },
      writeProgress
    );

    // ── Step 4: Bring result back to task pipeline ──
    const toolboxUrl = `/toolbox/legal?assetId=${result.assetId}`;
    const summary = `⚖️ ${result.title} 已生成完毕`;

    const resultPayload = JSON.stringify({
      summary,
      content: result.content,   // downstream agents can read this
      assetId: result.assetId,
      toolboxUrl,                // Copilot 精修入口
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload,
      }
    });

    recordTaskCompletion('eric', taskId, task.instruction, summary).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Eric agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({ where: { id: taskIdForError }, data: { status: 'FAILED' } }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
