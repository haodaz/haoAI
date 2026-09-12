import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
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

// ── Available placeholder images (AI-generated, branded) ──
const PLACEHOLDERS = {
  hero: '/images/placeholders/hero_campus.png',
  banner: '/images/placeholders/campus_walkway.png',
  campus: '/images/placeholders/campus_life.png',
  classroom: '/images/placeholders/classroom.png',
  team: '/images/placeholders/team_meeting.png',
  graduation: '/images/placeholders/graduation.png',
  landscape: '/images/placeholders/campus_walkway.png',
  icon: '/images/placeholders/icon_circle.svg',
  logo: '/images/placeholders/logo_slot.svg',
  gallery: '/images/placeholders/campus_life.png',
};

// ── Style templates ──
const STYLE_GUIDE: Record<string, string> = {
  'bep': `BEP Corporate template:
    - Primary: #0E3018 (dark green), Accent: #c9a84c (gold), White sections, Light gray: #f8faf8
    - Font: Inter (Google Fonts), clean and modern
    - Header: Dark green (#0E3018) navbar with white text and gold accent line below
    - Logo in header: <img src="/images/bep_logo_light.png" alt="BEP" class="h-8">
    - Hero sections: large banner with green gradient overlay
    - Cards: white with subtle border, gold left accent bar, hover shadow
    - Buttons: bg-[#0E3018] text-white hover:bg-[#1a4a2e], or gold outline variant
    - Footer: dark green bg with white text, logo, gold divider line
    - Section spacing: py-16 md:py-24, generous whitespace`,
  'education': 'Academic style: warm whites, trustworthy blue tones (#1e40af, #3b82f6), campus imagery, serif headings, trust badges, testimonial cards',
  'modern-tech': 'Modern tech: dark navy/slate backgrounds (#0f172a, #1e293b), vibrant accent (#6366f1, #8b5cf6), gradient overlays, glass-morphism cards, geometric patterns',
  'business': 'Business professional: clean white (#ffffff) backgrounds, navy (#1e3a5f) / gray palette, minimal borders, executive feel, data-driven sections',
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
          const tracker = new TokenTracker();
          send('log', { step: '[1/4]', message: '✅ System started, loading knowledge base...' });

          // ── Gather KB context ──
          let finalBackground = background || '';

          if (kbFileIds?.length > 0) {
            // User selected specific KB files
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            const kbTexts = kbFiles.map((f: any) => `【Reference: ${f.title}】\n${f.content || ''}`).join('\n\n');
            finalBackground = finalBackground + (finalBackground ? '\n\n' : '') + kbTexts;
            send('log', { step: '[1/4]', message: `✅ Loaded ${kbFiles.length} knowledge base file(s)` });
          } else {
            // Auto-search KB for relevant content
            send('log', { step: '[1/4]', message: '🔄 Auto-searching knowledge base for relevant content...' });
            try {
              const allFiles = await prisma.knowledgeItem.findMany({
                where: { type: 'FILE' },
                select: { id: true, title: true, content: true },
                take: 50,
              });
              // Simple keyword matching — find files whose title or content relates to the topic
              const topicLower = topic.toLowerCase();
              const topicWords = topicLower.split(/\s+/).filter((w: string) => w.length > 2);
              const scored = allFiles
                .map((f: any) => {
                  const text = ((f.title || '') + ' ' + (f.content || '').substring(0, 500)).toLowerCase();
                  const score = topicWords.reduce((acc: number, w: string) => acc + (text.includes(w) ? 1 : 0), 0);
                  return { ...f, score };
                })
                .filter((f: any) => f.score > 0)
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, 5);

              if (scored.length > 0) {
                const kbTexts = scored.map((f: any) => `【Auto-found: ${f.title}】\n${(f.content || '').substring(0, 2000)}`).join('\n\n');
                finalBackground = finalBackground + (finalBackground ? '\n\n' : '') + kbTexts;
                send('log', { step: '[1/4]', message: `✅ Auto-found ${scored.length} relevant KB file(s): ${scored.map((f: any) => f.title).join(', ')}` });
              } else {
                send('log', { step: '[1/4]', message: '⚠️ No matching KB files found — generating from topic only' });
              }
            } catch {
              send('log', { step: '[1/4]', message: '⚠️ KB search skipped (not available)' });
            }
          }

          const selectedStyle = style || 'bep';
          const { client, config } = await getModelClient();
          send('log', { step: '[2/4]', message: '🔄 AI Planner is designing site structure & page outlines...' });

          // ── Phase 1: Planner ──
          const plannerPrompt = await buildAgentPrompt(
            'iris',
            `Plan a ${pageCount || 3}-page website about: ${topic}`,
            finalBackground,
            'You are Iris, the Web Site Architect. Output ONLY a JSON site map.'
          ) + `\n\nDesign exactly ${pageCount || 3} pages. Output this strict JSON:
{
  "name": "Site Name",
  "themeColor": "#hex_color",
  "pages": [{ "id": "home", "title": "Page Title", "description": "Detailed content description including what sections to include", "inNav": true }]
}
Output ONLY valid JSON.`;

          const planRes = await trackableCompletion(
            tracker, 'webpage_planner', client, config,
            buildCompletionParams(config, [
              { role: 'system', content: plannerPrompt },
              { role: 'user', content: `Style: ${selectedStyle}\nPreferences: ${preferences || 'None'}\n${finalBackground ? `Context:\n${finalBackground}` : ''}\nOutput ONLY valid JSON.` }
            ], { requireJson: true, maxTokens: 4096 })
          );

          const sitePlan = extractJSON(planRes.choices?.[0]?.message?.content || '');
          if (!sitePlan?.pages?.length) {
            send('error', { message: 'Planner failed to produce site structure.' });
            controller.close();
            return;
          }

          send('log', { step: '[2/4]', message: `✅ Site structure complete: ${sitePlan.name} — ${sitePlan.pages.length} pages` });
          send('log', { step: '[3/4]', message: `🔄 Generating HTML for ${sitePlan.pages.length} pages concurrently...` });

          // ── Phase 2: Workers (concurrent) ──
          const placeholderList = Object.entries(PLACEHOLDERS)
            .map(([key, url]) => `  ${key}: ${url}`)
            .join('\n');

          const workerPromises = sitePlan.pages.map(async (page: any, idx: number) => {
            send('log', { step: `[Page ${idx + 1}]`, message: `🔄 Generating: ${page.title}...` });

            const workerSystemPrompt = await buildAgentPrompt(
              'iris',
              `Generate HTML for page: ${page.title}`,
              finalBackground,
              'You are Iris, the Web HTML Builder.'
            ) + `
CRITICAL REQUIREMENTS:
1. Use Tailwind CSS classes (loaded via CDN: <script src="https://cdn.tailwindcss.com"></script>).
2. Import Inter font: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
3. Make it fully mobile-responsive.
4. Design style: ${STYLE_GUIDE[selectedStyle] || STYLE_GUIDE['bep']}
5. Output COMPLETE HTML page (including <html>, <head>, <body>).
6. JSON ESCAPING: Escape all double quotes in the "html" string. No literal newlines inside string values.

PLACEHOLDER IMAGES — use these actual src paths for images (they are real photos, not placeholder graphics):
${placeholderList}
Example: <img src="/images/placeholders/hero_campus.png" data-slot="hero" alt="Campus aerial view" class="w-full h-auto object-cover">
Use DIFFERENT images for different sections. Every <img> MUST have a data-slot attribute matching one of: ${Object.keys(PLACEHOLDERS).join(', ')}
Use object-cover class to ensure images fill their container properly.

${selectedStyle === 'bep' ? `BEP LOGO USAGE:
- Header (dark bg): <img src="/images/bep_logo_light.png" alt="BEP" class="h-8">
- Footer (dark bg): <img src="/images/bep_logo_light.png" alt="BEP" class="h-10">
- On white sections: <img src="/images/bep_logo_dark.png" alt="BEP" class="h-8">` : ''}

NAVIGATION: Include a <nav> with links to all pages using this navigation data:
${sitePlan.pages.filter((p: any) => p.inNav).map((p: any) => `  <a href="#" data-page-id="${p.id}">${p.title}</a>`).join('\n')}
Add onclick handler: onclick="window.parent.postMessage({type:'NAVIGATE',pageId:'${'{PAGE_ID}'}'},'*');return false;"

OUTPUT FORMAT (strict JSON):
{ "html": "<!DOCTYPE html><html>...full page HTML...</html>" }

PAGE: ${page.title} - ${page.description}
Output ONLY valid JSON.`;

            try {
              const workerRes = await trackableCompletion(
                tracker, `webpage_page_${idx}`, client, config,
                buildCompletionParams(config, [
                  { role: 'system', content: workerSystemPrompt },
                  { role: 'user', content: `Generate complete HTML for "${page.title}".` }
                ], { requireJson: true, maxTokens: 12000 })
              );
              const pageData = extractJSON(workerRes.choices?.[0]?.message?.content || '');
              send('log', { step: `[Page ${idx + 1}]`, message: `✅ ${page.title} — generated successfully` });
              return { ...page, html: pageData?.html || `<div class="p-8 text-center text-red-500">Failed: ${page.title}</div>` };
            } catch (err: any) {
              send('log', { step: `[Page ${idx + 1}]`, message: `❌ ${page.title} — failed: ${err.message}` });
              return { ...page, html: `<div class="p-8 text-center text-red-500">Error: ${err.message}</div>` };
            }
          });

          const generatedPages = await Promise.all(workerPromises);
          sitePlan.pages = generatedPages;

          // Phase 3: Assembly
          send('log', { step: '[4/4]', message: '✅ All pages assembled — website generation complete!' });
          send('result', { site: sitePlan });
          await tracker.persist('toolbox', 'webpage').catch(() => {});
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
