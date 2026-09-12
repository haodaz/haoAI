import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';

const getSystemPrompt = (lang: string, kbContext: string) => {
  const base = `You are BEP (British Enrolment Partners) digital AI assistant, representing BEP in communication with UK boarding schools and admissions agencies.
Your tone must be professional, confident, and cooperative.

【Company Positioning】
BEP is NOT a traditional "matchmaking" agency that just takes commissions. It positions itself as "the overseas admissions office for UK boarding schools" (outsourced admissions department).

【Pain Points Solved】
Many UK schools' admissions offices lack the time and resources to develop overseas markets, manage hundreds of agencies, and follow up with every prospective family. BEP manages the entire international admissions process — from market research, agency management, family communication, to entrance testing and pre-departure preparation.

【Partnership Models (Pricing)】
1. Fixed Retainer: For top schools with strong demand — £4,800 + VAT per month, no commission.
2. Performance Partnership: For schools seeking market expansion — no monthly fee, but 15% of new students' tuition during their time at the school.

${kbContext ? `【Knowledge Base Reference】\nThe following is internal BEP knowledge retrieved for this conversation:\n${kbContext}\n\nUse this information to provide accurate, detailed answers.` : ''}

【Important Instructions】
- Answer based on the knowledge base content above when relevant.
- Never fabricate information. If unsure, politely say so.
- 【Call to Action (CTA)】: After answering questions about "Models & Pricing" or "Why Choose BEP", always end with: 👉 [Book a Free International Admissions Channel Audit]`;

  return lang === 'en' 
    ? `${base}\n\n【Language Instruction】\nYou must communicate with the user exclusively in English.` 
    : `${base}\n\n【语言指令】\n你必须全程使用中文与用户交流。`;
};

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const lang = url.searchParams.get('lang') || 'zh';
    const { messages } = await req.json();
    const encoder = new TextEncoder();
    
    // Pre-fetch KB context based on user's latest message
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
    let kbContext = '';
    if (lastUserMsg) {
      try {
        const keywords = lastUserMsg.split(/[\s,，。？?!！]+/).filter((w: string) => w.length > 1).slice(0, 5);
        const kbItems = await prisma.knowledgeItem.findMany({
          where: {
            OR: keywords.map((kw: string) => ({
              OR: [
                { title: { contains: kw } },
                { content: { contains: kw } },
              ]
            })).flat()
          },
          take: 5,
        });
        if (kbItems.length > 0) {
          kbContext = kbItems.map((item: any) => `【${item.title}】\n${item.content}`).join('\n\n');
        }
      } catch (e) {
        console.error('[BEP Chat] KB search failed:', e);
      }
    }

    const { client, config } = await getModelClient();
    const systemPrompt = getSystemPrompt(lang, kbContext);

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

          const params = buildCompletionParams(config, fullMessages, { stream: true });
          const responseStream = await client.chat.completions.create(params as any);

          let assistantMessage = '';
          for await (const chunk of responseStream as any) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;
            if (delta.content) {
              assistantMessage += delta.content;
              emit('delta', { content: delta.content });
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
