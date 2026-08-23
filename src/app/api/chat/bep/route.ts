import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';

const getSystemPrompt = (lang: string) => {
  const base = `你是 BEP (British Enrolment Partners) 的数字智能助理，代表 BEP 与英国寄宿学校和招生中介进行沟通。
你的语气必须专业、自信、且富有合作诚意。

【公司定位】
BEP 不是传统意义上那种只负责“牵线搭桥”并抽取佣金的留学中介。它的定位是“英国寄宿学校的海外招生办公室 (外包招生部)”。

【痛点解决】
很多英国学校的招生办没有足够的时间和精力去跑海外市场、管理几百个中介、跟进每一个留学生家庭。BEP 就是来帮学校把整个国际招生流程（从市场调研、中介管理、家庭沟通到入学测试和行前准备）全部统管起来。

【合作模式 (收费方式)】
1. 固定费用模式 (Fixed Retainer)：针对不愁生源的顶尖名校，每月收取 £4,800 + VAT（增值税），不抽成。
2. 绩效模式 (Performance Partnership)：针对需要开拓市场的中上等学校，不收月费，但会从新生在读期间的学费中抽取 15% 作为运营费。

【重要指令】
- 当被问及 BEP 的具体业务细节时，请务必使用 \`searchKnowledgeBase\` 工具在知识库中查询信息，然后基于检索到的内容进行友好地解答。
- 绝不能胡编乱造，如果知识库中没有，请礼貌地说明。
- 【行动号召 (CTA)】：当你回答完关于“合作模式(Models & Pricing)”或“核心优势(Why Choose BEP)”的问题后，必须在回答的末尾加上这句行动号召：👉 [预约获取免费的国际招生渠道审计 (Free Audit)]。`;

  return lang === 'en' 
    ? `${base}\n\n【Language Instruction】\nYou must communicate with the user exclusively in English. Translate the concepts accurately. For the CTA, output: 👉 [Book a Free International Admissions Channel Audit]` 
    : `${base}\n\n【语言指令】\n你必须全程使用中文与用户交流。`;
};

// Tool definitions for OpenAI function calling
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'searchKnowledgeBase',
      description: 'Search the BEP internal business knowledge base for information about business structure, partners, pricing, and history.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The keyword to search for' },
        },
        required: ['query'],
      },
    },
  },
];

// Execute tool calls
async function executeTool(name: string, args: Record<string, any>) {
  if (name === 'searchKnowledgeBase') {
    const { query } = args;
    console.log(`[Tool: searchKnowledgeBase] BEP querying for: ${query}`);
    const items = await prisma.knowledgeItem.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { content: { contains: query } },
        ],
      },
      take: 5,
    });
    return items.length > 0 ? items : [{ note: '知识库中没有查到相关信息。' }];
  }

  return { error: `Unknown tool: ${name}` };
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const lang = url.searchParams.get('lang') || 'zh';
    const { messages } = await req.json();
    const encoder = new TextEncoder();
    
    // Get the configured model client (defaults to GPT if set in the registry/env)
    const { client, config } = await getModelClient();
    const systemPrompt = getSystemPrompt(lang);

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (type: string, payload: Record<string, unknown> = {}) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
        };

        try {
          const fullMessages: any[] = [
            { role: 'system', content: systemPrompt },
            ...messages.map((m: any) => ({ role: m.role, content: m.content })),
          ];

          let loopCount = 0;
          const MAX_TOOL_LOOPS = 3;

          while (loopCount < MAX_TOOL_LOOPS) {
            loopCount++;

            const params = buildCompletionParams(config, fullMessages, { stream: true });
            // Only add tools if model supports JSON mode (which implies function calling support in this project's setup, e.g. OpenAI/DashScope)
            if (config.supportsJsonMode || config.provider === 'DashScope') {
               params.tools = TOOLS;
            }

            const responseStream = await client.chat.completions.create(params as any);

            let assistantMessage = '';
            let toolCalls: any[] = [];

            for await (const chunk of responseStream as any) {
              const delta = chunk.choices[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                assistantMessage += delta.content;
                emit('delta', { content: delta.content });
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCalls[idx]) {
                    toolCalls[idx] = {
                      id: tc.id || `call_${idx}`,
                      type: 'function',
                      function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' }
                    };
                  } else {
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              }
            }

            toolCalls = toolCalls.filter(Boolean);

            if (!toolCalls || toolCalls.length === 0) {
              break; // No more tool calls
            }

            // Tool calls — execute and loop
            emit('reset');

            fullMessages.push({
              role: 'assistant',
              content: assistantMessage,
              tool_calls: toolCalls,
            });

            for (const tc of toolCalls) {
              let toolResult: any;
              try {
                const args = JSON.parse(tc.function.arguments);
                toolResult = await executeTool(tc.function.name, args);
              } catch (e) {
                toolResult = { error: 'Failed to parse tool arguments' };
              }

              fullMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: tc.function.name,
                content: JSON.stringify(toolResult),
              });
            }
          }

          emit('final', { content: '', skip_overwrite: true });
        } catch (err: any) {
          console.error('BEP Chat API Error:', err);
          emit('error', { error: err.message || '服务异常，请稍后重试' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('BEP Chat Request Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
