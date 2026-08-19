import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildAgentPrompt, getTaskAttachments } from '@/lib/bristh-config';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { recordTaskCompletion } from '@/lib/memory-hooks';

/**
 * Kelly — Document Processing Specialist (文档处理专员)
 * 
 * Kelly is the file-centric agent. She handles tasks where the primary goal
 * is to process, transform, or extract from uploaded attachments:
 * - Document translation (Chinese↔English)
 * - Template / form filling
 * - Data extraction from spreadsheets or reports
 * - Format conversion
 * - Multi-file information integration
 * 
 * Kelly always has attachments in her prompt (injected by buildAgentPrompt).
 * Her output is clean, actionable processed content.
 */

export async function POST(req: Request) {
  let taskIdForError: string | null = null;
  try {
    const { taskId, locale, priorPhaseResults } = await req.json();
    taskIdForError = taskId;

    // 1. Load task with context
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { context: true },
    });
    
    await prisma.task.update({ where: { id: taskId }, data: { status: 'RUNNING' } });

    // 2. Extract attachments for this task
    const taskAttachments = getTaskAttachments(task.context.attachments, task.attachmentIds);

    // 3. Build prompt
    const fallbackPersona = 'You are Kelly, the Document Processing Specialist at 平方创想教育科技. You process uploaded files: translate, fill forms, extract data, convert formats, and summarize. Always be meticulous and preserve document structure.';
    
    let systemPrompt = await buildAgentPrompt('kelly', task.instruction, task.context.rawContent, fallbackPersona, locale, taskAttachments, priorPhaseResults);

    // Add Kelly-specific output guidelines
    systemPrompt += `\n\n【Kelly 输出规范】
1. 如果是翻译任务：输出完整译文，保留原文结构（标题、段落、列表等）。
2. 如果是表格/模板填写：输出填写完成的表格（Markdown table 格式）。
3. 如果是数据提取：输出结构化的数据摘要（使用表格或列表）。
4. 如果是格式转换：输出转换后的内容。
5. 在处理结果开头简述你做了什么，然后给出完整内容。
6. 使用 Markdown 格式输出。`;

    // 4. Call AI model
    const { client, config } = await getModelClient();
    const response = await client.chat.completions.create(
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }])
    );

    const resultMarkdown = response.choices[0].message.content || 'Failed to process document.';

    // 5. Generate summary
    const summaryMatch = resultMarkdown.match(/^#+ (.+)/m);
    const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : resultMarkdown.slice(0, 80).replace(/[#*]/g, '').trim();

    // Count processed files for summary
    const fileCount = taskAttachments.length;
    const fileNames = taskAttachments.map(a => a.originalName).join(', ');

    const resultPayload = JSON.stringify({
      summary: `📄 ${summary}${fileCount ? ` (${fileCount}个文件: ${fileNames})` : ''}`,
      content: resultMarkdown,
      processedFiles: taskAttachments.map(a => ({
        name: a.originalName,
        storagePath: a.storagePath,
      })),
    });

    // 6. Save output
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload,
      }
    });

    // Memory hook
    recordTaskCompletion('kelly', taskId, task.instruction, resultMarkdown.slice(0, 200)).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Kelly agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
