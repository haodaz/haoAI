import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { buildAgentPrompt } from '@/lib/bristh-config';


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

    const fallbackPersona = 'You are Eric, the Legal and Compliance Officer at Bristh Enrollment Partners. Draft legal documents based on business agreements.';
    
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
        console.error('Failed to parse attachments for Eric', e);
      }
    }

    const systemPrompt = await buildAgentPrompt('eric', task.instruction, finalBackground, fallbackPersona, locale)
      + '\n\nDraft a legal document (Service Agreement, NDA, MOU, or Partnership Contract) using standard legal language. Extract variables from context. Use placeholders like [INSERT FEE AMOUNT HERE] for missing info. Format as a formal contract in Markdown with numbered clauses and signature blocks. Output ONLY raw Markdown.';

    const { client, config } = await getModelClient();
    const response = await client.chat.completions.create(
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }])
    );

    const resultMarkdown = response.choices[0].message.content || 'Failed to generate contract draft.';

    const summaryMatch = resultMarkdown.match(/^#+ (.+)/m);
    const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : resultMarkdown.slice(0, 80).replace(/[#*]/g, '').trim();

    const resultPayload = JSON.stringify({
      summary: `⚖️ ${summary}`,
      content: resultMarkdown
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload
      }
    });

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Eric agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
