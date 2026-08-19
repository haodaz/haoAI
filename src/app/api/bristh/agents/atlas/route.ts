import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { buildAgentPrompt, getTaskAttachments } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';
import { runResourceDeepSearchStream } from '@/lib/tools/resourceDeepSearch';

// Helper: consume SSE stream and extract text
async function consumeSSEStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    done = d;
    if (value) {
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n\n')) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.type === 'ai_chunk') result += data.data;
          } catch {}
        }
      }
    }
  }
  return result;
}

export async function POST(req: Request) {
  let taskIdForError = '';
  try {
    const { taskId, locale, priorPhaseResults } = await req.json();
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

    const taskAttachments = getTaskAttachments(task.context.attachments, task.attachmentIds);
    const fallbackPersona = 'You are Atlas, the Research Resource Specialist at 平方创想教育科技. You search the VisionSquare research materials database to find instruments, consumables and reagents, and generate structured procurement reports.';

    // Call resource deep search directly (no HTTP self-call to avoid deadlock)
    let toolResult = '';
    try {
      const token = process.env.VISIONSQUARE_AUTH_BEARER;
      const stream = await runResourceDeepSearchStream(task.instruction, undefined, undefined, token);
      toolResult = await consumeSSEStream(stream);
    } catch (toolErr: any) {
      toolResult = `[工具调用失败: ${toolErr.message}]`;
    }

    const systemPrompt = await buildAgentPrompt('atlas', task.instruction, task.context.rawContent, fallbackPersona, locale, taskAttachments, priorPhaseResults)
      + '\n\n## 工具检索结果\n' + (toolResult || '暂无检索结果')
      + '\n\n请基于以上检索数据，生成结构化科研物资选型报告（Markdown格式）。包含：物资清单表格、供应商档案、选型建议。';

    const { client, config } = await getModelClient();
    const response = await client.chat.completions.create(
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }])
    );

    const resultMarkdown = response.choices[0].message.content || '物资检索未返回结果。';

    const summaryMatch = resultMarkdown.match(/^#+ (.+)/m);
    const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : resultMarkdown.slice(0, 80).replace(/[#*]/g, '').trim();

    const resultPayload = JSON.stringify({
      summary: `🔬 ${summary}`,
      content: resultMarkdown
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload
      }
    });

    recordTaskCompletion('atlas', taskId, task.instruction, resultMarkdown.slice(0, 200)).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Atlas agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
