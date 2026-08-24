import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import prisma from '@/lib/prisma';
import { buildAgentPrompt } from '@/lib/bristh-config';

export const maxDuration = 300;

function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

const STYLE_GUIDE: Record<string, string> = {
  'modern-tech': 'Modern tech aesthetic: dark navy/slate backgrounds, vibrant accent colors, geometric patterns, gradient overlays, glass-morphism cards',
  'education': 'Education/academic: warm whites, trustworthy blue tones, campus imagery placeholders, serif headings for tradition',
  'business': 'Business professional: clean white backgrounds, navy/gray palette, minimal borders, executive feel',
};

export async function POST(req: Request) {
  try {
    const { topic, background, preferences, pageCount, style, kbFileIds } = await req.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Missing topic' }), { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type, data })}\n\n`
          ));
        };

        try {
          send('log', { step: '[1/4]', message: '✅ 系统启动，加载知识库资料...' });

          let finalBackground = background || '';
          if (kbFileIds?.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            const kbTexts = kbFiles.map((f: any) => `【参考资料: ${f.title}】\n${f.content || ''}`).join('\n\n');
            finalBackground = finalBackground + (finalBackground ? '\n\n' : '') + kbTexts;
          }

          const { client, config } = await getModelClient();
          send('log', { step: '[2/4]', message: '🔄 AI Planner 正在设计网站结构与页面大纲...' });

          // Phase 1: Planner
          const plannerPrompt = await buildAgentPrompt(
            'iris',
            `Plan a ${pageCount || 3}-page website about: ${topic}`,
            finalBackground,
            'You are Iris, the Web Site Architect. Output ONLY a JSON site map.'
          ) + `\n\nDesign exactly ${pageCount || 3} pages. Output this strict JSON:
{
  "name": "Site Name",
  "themeColor": "#hex_color",
  "pages": [{ "id": "home", "title": "页面标题", "description": "详细内容描述", "inNav": true }]
}
Output ONLY valid JSON.`;

          const planRes = await client.chat.completions.create(
            buildCompletionParams(config, [
              { role: 'system', content: plannerPrompt },
              { role: 'user', content: `Style: ${style || 'education'}\nPreferences: ${preferences || 'None'}\n${finalBackground ? `Context:\n${finalBackground}` : ''}\nOutput ONLY valid JSON.` }
            ], { requireJson: true, maxTokens: 4096 })
          );

          const sitePlan = extractJSON(planRes.choices?.[0]?.message?.content || '');
          if (!sitePlan?.pages?.length) {
            send('error', { message: 'Planner failed to produce site structure.' });
            controller.close();
            return;
          }

          send('log', { step: '[2/4]', message: `✅ 网站结构设计完毕: ${sitePlan.name}，共 ${sitePlan.pages.length} 页` });
          send('log', { step: '[3/4]', message: `🔄 开始逐页生成 HTML (共 ${sitePlan.pages.length} 页，并发执行)...` });

          // Phase 2: Workers (concurrent)
          const workerPromises = sitePlan.pages.map(async (page: any, idx: number) => {
            send('log', { step: `[页面${idx + 1}]`, message: `🔄 正在生成: ${page.title}...` });

            const workerSystemPrompt = await buildAgentPrompt(
              'iris',
              `Generate HTML for page: ${page.title}`,
              finalBackground,
              'You are Iris, the Web HTML Builder.'
            ) + `
CRITICAL REQUIREMENTS:
1. Use Tailwind CSS classes (loaded via CDN).
2. Include image placeholders with data-image-placeholder="true".
3. Make it mobile-responsive.
4. Design style: ${STYLE_GUIDE[style] || STYLE_GUIDE['education']}
5. Output sections only (no <html>, <head>, <body> tags).
6. JSON ESCAPING: Escape all double quotes in the "html" string.
7. No literal newlines inside string values.

OUTPUT FORMAT (strict JSON):
{ "html": "<section>...full HTML...</section>" }

PAGE: ${page.title} - ${page.description}
Output ONLY valid JSON.`;

            try {
              const workerRes = await client.chat.completions.create(
                buildCompletionParams(config, [
                  { role: 'system', content: workerSystemPrompt },
                  { role: 'user', content: `Generate HTML for "${page.title}".` }
                ], { requireJson: true, maxTokens: 8192 })
              );
              const pageData = extractJSON(workerRes.choices?.[0]?.message?.content || '');
              send('log', { step: `[页面${idx + 1}]`, message: `✅ ${page.title} 生成完毕` });
              return { ...page, html: pageData?.html || `<div class="p-8 text-center text-red-500">Failed: ${page.title}</div>` };
            } catch (err: any) {
              send('log', { step: `[页面${idx + 1}]`, message: `❌ ${page.title} 生成失败: ${err.message}` });
              return { ...page, html: `<div class="p-8 text-center text-red-500">Error: ${err.message}</div>` };
            }
          });

          const generatedPages = await Promise.all(workerPromises);
          sitePlan.pages = generatedPages;

          // Phase 3: Assembly — send final result as a special event
          send('log', { step: '[4/4]', message: '✅ 所有页面已汇总组装，网站生成完毕！' });
          send('result', { site: sitePlan });
          controller.close();
        } catch (err: any) {
          console.error(err);
          send('error', { message: err.message || 'Server error' });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (error: any) {
    console.error('Webpage generation error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
