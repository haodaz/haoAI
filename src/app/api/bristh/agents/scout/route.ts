import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt, getTaskAttachments } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';
import { searchWeb } from '@/lib/search';

/**
 * Scout — Research & Intelligence Specialist (调研情报官)
 * 
 * Scout is the information-gathering agent. He conducts research by:
 * 1. Searching the web (via Aliyun/Bocha) for real-time information
 * 2. Searching the internal knowledge base for BEP-specific data
 * 3. Synthesizing findings into structured research reports
 * 
 * Typical use cases:
 * - School profile research (background, admissions, fees, rankings)
 * - Competitor analysis
 * - Market trend research
 * - Client intelligence gathering
 * 
 * In multi-phase pipelines, Scout usually runs in Phase 1 (Information Prep),
 * and his output flows to downstream agents (Alice, Fiona, etc.) via priorPhaseResults.
 */

// Allow up to 120s for research (web search + LLM synthesis)
export const maxDuration = 120;

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

    // 1. Update status to RUNNING
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' }
    });

    // 2. Extract search queries from the instruction
    const { client, config } = await getModelClient();
    const tracker = new TokenTracker();

    const queryExtractionPrompt = `Based on this research task, generate 2-3 focused search queries that would help gather the most relevant information. Return ONLY valid JSON.

Task instruction: "${task.instruction}"
Additional context: "${task.context.rawContent?.slice(0, 500) || ''}"

Output format:
{
  "queries": ["search query 1", "search query 2", "search query 3"],
  "kbKeywords": ["keyword1", "keyword2"]
}`;

    const queryRes = await trackableCompletion(
      tracker, 'scout_query_extraction', client, config,
      buildCompletionParams(config, [{ role: 'user', content: queryExtractionPrompt }], { requireJson: true })
    );

    let queries: string[] = [];
    let kbKeywords: string[] = [];
    try {
      const parsed = JSON.parse(queryRes.choices[0].message.content || '{}');
      queries = parsed.queries || [task.instruction.slice(0, 100)];
      kbKeywords = parsed.kbKeywords || [];
    } catch {
      queries = [task.instruction.slice(0, 100)];
      kbKeywords = [];
    }

    // 3. Parallel: Web search + KB search
    const writeProgress = async (msg: string) => {
      try {
        await prisma.task.update({
          where: { id: taskId },
          data: { resultPayload: JSON.stringify({ progress: msg }) }
        });
      } catch { /* non-blocking */ }
    };

    await writeProgress('[1/4] 正在联网搜索...');

    // Web search (run all queries in parallel)
    const webResults = await Promise.allSettled(
      queries.map(q => searchWeb(q))
    );
    const webData = webResults
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && !!r.value.AbstractText)
      .map((r, i) => `### 搜索「${queries[i]}」\n${r.value.AbstractText}`)
      .join('\n\n---\n\n');

    await writeProgress('[2/4] 检索内部知识库...');

    // KB search
    let kbData = '';
    if (kbKeywords.length > 0) {
      try {
        const kbResults = await prisma.knowledgeItem.findMany({
          where: {
            OR: kbKeywords.flatMap(kw => [
              { title: { contains: kw } },
              { content: { contains: kw } },
            ]),
          },
          take: 5,
        });
        if (kbResults.length > 0) {
          kbData = kbResults.map(item =>
            `### ${item.title}\n${(item.content || '').slice(0, 800)}`
          ).join('\n\n');
        }
      } catch { /* ignore KB errors */ }
    }

    await writeProgress('[3/4] 分析与交叉验证...');

    // 4. Build prompt and synthesize
    const taskAttachments = getTaskAttachments(task.context.attachments, task.attachmentIds);
    const fallbackPersona = 'You are Scout, the Research & Intelligence Specialist at Bristh Enrollment Partners. You are an expert at finding, verifying, and synthesizing information from multiple sources. You conduct thorough research on schools, institutions, markets, and competitors. You always cite your sources, distinguish between facts and inferences, and present findings in clear, structured reports.';

    let systemPrompt = await buildAgentPrompt('scout', task.instruction, task.context.rawContent, fallbackPersona, locale, taskAttachments, priorPhaseResults);

    // Inject search results
    if (webData) {
      systemPrompt += `\n\n【联网搜索结果 — 以下是实时搜索获得的信息】:\n${webData}`;
    }
    if (kbData) {
      systemPrompt += `\n\n【内部知识库检索结果】:\n${kbData}`;
    }

    systemPrompt += `\n\n【Scout 输出规范】
基于以上搜索结果和知识库信息，生成一份专业的调研报告。格式要求：
1. **🎯 调研目标** — 简述本次调研的目的
2. **📊 核心发现** — 最重要的信息点（带来源标注）
3. **🏫 机构/学校概况** — 如适用，包含基本信息、特色、规模等
4. **📈 数据与趋势** — 关键数据点和趋势分析
5. **💡 分析与建议** — 基于发现的专业判断和行动建议
6. **📎 信息来源** — 标注信息来源（联网搜索/知识库/推断）

使用 Markdown 格式，确保信息准确、结构清晰、有可操作性。对于无法确认的信息，请明确标注为"待验证"。`;

    await writeProgress('[4/4] 生成调研报告...');

    const response = await trackableCompletion(
      tracker, 'scout_main', client, config,
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }], { maxTokens: 4096 })
    );

    const resultMarkdown = response.choices[0].message.content || 'Failed to generate research report.';

    // 5. Extract summary
    const summaryMatch = resultMarkdown.match(/^#+ (.+)/m);
    const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : resultMarkdown.slice(0, 80).replace(/[#*]/g, '').trim();

    const resultPayload = JSON.stringify({
      summary: `🔍 ${summary}`,
      content: resultMarkdown,
      searchQueries: queries,
      webSourceCount: webResults.filter(r => r.status === 'fulfilled').length,
      kbSourceCount: kbData ? kbKeywords.length : 0,
    });

    // 6. Save and complete
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload,
      }
    });

    recordTaskCompletion('scout', taskId, task.instruction, summary).catch(() => {});
    await tracker.persist('agent', 'scout', taskId, task.context.id).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Scout agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
