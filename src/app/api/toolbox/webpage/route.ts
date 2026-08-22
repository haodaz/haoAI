import { NextResponse } from 'next/server';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import prisma from '@/lib/prisma';
import { buildAgentPrompt } from '@/lib/bristh-config';

export const maxDuration = 120;

/**
 * Robust JSON extraction: handles markdown fences, trailing text, etc.
 */
function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Clean trailing commas (common LLM error)
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  return null;
}

/**
 * POST — Generate a multi-page marketing website using Planner-Worker batch architecture
 */
export async function POST(req: Request) {
  try {
    const { topic, background, preferences, pageCount, style, kbFileIds } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: 'Missing topic' }, { status: 400 });
    }

    let finalBackground = background || '';
    if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
      const kbFiles = await prisma.knowledgeItem.findMany({
        where: { id: { in: kbFileIds } }
      });
      const kbTexts = kbFiles.map((f: any) => `【参考资料: ${f.title}】\n${f.content || '无正文内容'}`).join('\n\n');
      finalBackground = finalBackground + (finalBackground ? '\n\n' : '') + kbTexts;
    }

    const { client, config } = await getModelClient();

    const styleGuide: Record<string, string> = {
      'modern-tech': 'Modern tech aesthetic: dark navy/slate backgrounds, vibrant accent colors, geometric patterns, gradient overlays, glass-morphism cards',
      'education': 'Education/academic: warm whites, trustworthy blue tones, campus imagery placeholders, serif headings for tradition',
      'business': 'Business professional: clean white backgrounds, navy/gray palette, minimal borders, executive feel',
    };

    // ==========================================
    // PHASE 1: PLANNER (Design site structure)
    // ==========================================
    const plannerPrompt = await buildAgentPrompt(
        'iris',
        `Plan a ${pageCount || 3}-page website about: ${topic}`,
        finalBackground,
        'You are Iris, the Web Site Architect. Output ONLY a JSON site map.'
    ) + `

CRITICAL REQUIREMENTS:
1. Design the structure of the website based on the topic.
2. Define the global theme color.
3. List the pages to be created. For each page, provide an 'id', a 'title', and a detailed 'description' of the sections and content that should be on this page.
4. Do NOT write HTML yet.

OUTPUT FORMAT (strict JSON):
{
  "name": "Site Name",
  "themeColor": "#hex_color",
  "pages": [
    {
      "id": "home",
      "title": "首页",
      "description": "Hero section with catchy headline, 3 feature cards, and a call-to-action footer",
      "inNav": true
    }
  ]
}

Plan exactly ${pageCount || 3} pages. Output ONLY valid JSON.`;

    const userPrompt = `- Style/Vibe: ${style || 'modern'}
- Additional Preferences: ${preferences || 'None'}

${finalBackground ? `Background Context:\n${finalBackground}` : ''}
${preferences ? `\nAdditional requirements:\n${preferences}` : ''}

Output ONLY valid JSON. No markdown, no explanations.`;

    console.log('[Toolbox Webpage] Starting Phase 1: Planner...');
    const plannerResponse = await client.chat.completions.create(
      buildCompletionParams(config, [
        { role: 'system', content: plannerPrompt },
        { role: 'user', content: userPrompt },
      ], { requireJson: true, maxTokens: 4096 })
    );

    const plannerRaw = plannerResponse.choices?.[0]?.message?.content || '';
    const sitePlan = extractJSON(plannerRaw);

    if (!sitePlan || !sitePlan.pages || !Array.isArray(sitePlan.pages)) {
      console.error('Failed to parse planner JSON:', plannerRaw.substring(0, 500));
      return NextResponse.json({ error: 'Failed to parse AI site plan', raw: plannerRaw.substring(0, 200) }, { status: 500 });
    }

    console.log(`[Toolbox Webpage] Planner finished. Generating ${sitePlan.pages.length} pages concurrently...`);

    // ==========================================
    // PHASE 2: WORKERS (Generate HTML for each page concurrently)
    // ==========================================
    const workerPromises = sitePlan.pages.map(async (page: any) => {
      const workerSystemPrompt = await buildAgentPrompt(
          'iris',
          `Generate HTML for page: ${page.title}`,
          finalBackground,
          'You are Iris, the Web HTML Builder.'
      ) + `

CRITICAL REQUIREMENTS:
1. All HTML must use Tailwind CSS classes (loaded via CDN).
2. Use inline styles only for custom colors/gradients not available in Tailwind.
3. Include image placeholders using this EXACT format:
   <div class="relative group cursor-pointer" data-image-placeholder="true">
     <div class="bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center" style="height:240px">
       <div class="text-center">
         <div class="text-4xl mb-2">📷</div>
         <div class="text-sm text-gray-500 font-medium">点击替换图片</div>
         <div class="text-xs text-gray-400 mt-1">建议尺寸: 800×600</div>
       </div>
     </div>
   </div>
4. Make it mobile-responsive with Tailwind.
5. Use professional typography and spacing.
6. Design style: ${styleGuide[style] || styleGuide['education']}
7. The HTML should be self-contained sections (no <html>, <head>, <body> tags — just the content sections).
8. JSON ESCAPING: You MUST escape all double quotes inside the "html" string values using backslash (\\").
9. JSON FORMATTING: Do NOT use literal newlines inside string values. The "html" string must be a single continuous string.

OUTPUT FORMAT (strict JSON):
{
  "html": "<section>...full HTML content...</section>"
}

PAGE TO GENERATE:
ID: ${page.id}
Title: ${page.title}
Detailed Description: ${page.description}

Output ONLY valid JSON.`;

      try {
        const workerResponse = await client.chat.completions.create(
          buildCompletionParams(config, [
            { role: 'system', content: workerSystemPrompt },
            { role: 'user', content: `Generate the HTML for "${page.title}" as specified.` },
          ], { requireJson: true, maxTokens: 8192 })
        );

        const pageRaw = workerResponse.choices?.[0]?.message?.content || '';
        const pageData = extractJSON(pageRaw);

        return {
          ...page,
          html: pageData?.html || `<div class="p-8 text-center text-red-500">Failed to generate content for ${page.title}</div>`
        };
      } catch (err: any) {
        console.error(`Worker failed for page ${page.id}:`, err);
        return {
          ...page,
          html: `<div class="p-8 text-center text-red-500">Generation error: ${err.message}</div>`
        };
      }
    });

    const generatedPages = await Promise.all(workerPromises);
    
    // ==========================================
    // PHASE 3: ASSEMBLY
    // ==========================================
    sitePlan.pages = generatedPages;

    console.log('[Toolbox Webpage] Assembly complete.');
    return NextResponse.json({ success: true, site: sitePlan });

  } catch (error: any) {
    console.error('Webpage generation error:', error);
    return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 });
  }
}
