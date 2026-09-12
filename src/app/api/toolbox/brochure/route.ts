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

const PLACEHOLDERS = {
  hero: '/images/placeholders/hero_campus.png',
  campus: '/images/placeholders/campus_life.png',
  classroom: '/images/placeholders/classroom.png',
  team: '/images/placeholders/team_meeting.png',
  graduation: '/images/placeholders/graduation.png',
  landscape: '/images/placeholders/campus_walkway.png',
};

const FORMAT_SPECS: Record<string, { label: string; panels: number; orientation: string; css: string }> = {
  'single': {
    label: 'Single Page Flyer (A4 Portrait)',
    panels: 1,
    orientation: 'portrait',
    css: 'width:210mm;min-height:297mm;',
  },
  'trifold': {
    label: 'Tri-fold Brochure (A4 Landscape, 6 panels)',
    panels: 6,
    orientation: 'landscape',
    css: 'width:297mm;min-height:210mm;display:flex;',
  },
  'multipage': {
    label: 'Multi-page Booklet (A4 Portrait)',
    panels: -1, // dynamic
    orientation: 'portrait',
    css: 'width:210mm;min-height:297mm;',
  },
};

const STYLE_GUIDE: Record<string, string> = {
  'bep': `BEP Corporate: Primary #0E3018 (dark green), Accent #c9a84c (gold), White sections, Inter font. Header with dark green bar + gold accent. Cards with gold left border. Professional British boarding school aesthetic.`,
  'education': 'Academic: warm whites, trustworthy blue (#1e40af, #3b82f6), serif headings, campus imagery feel.',
  'modern-tech': 'Modern tech: dark navy (#0f172a), vibrant accent (#6366f1), gradient overlays, geometric patterns.',
  'business': 'Business: clean white, navy/gray palette, minimal, data-driven, executive premium feel.',
};

export async function POST(req: Request) {
  try {
    const { topic, background, preferences, format, pageCount, style, kbFileIds } = await req.json();
    if (!topic) return new Response(JSON.stringify({ error: 'Missing topic' }), { status: 400 });

    const selectedFormat = format || 'single';
    const selectedStyle = style || 'bep';
    const spec = FORMAT_SPECS[selectedFormat] || FORMAT_SPECS['single'];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type, data })}\n\n`));
        };

        try {
          const tracker = new TokenTracker();
          send('log', { step: '[1/3]', message: '🔄 Loading knowledge base...' });

          // ── KB retrieval ──
          let kbContext = '';
          if (kbFileIds?.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            kbContext = kbFiles.map((f: any) => `【Reference: ${f.title}】\n${f.content || ''}`).join('\n\n');
            send('log', { step: '[1/3]', message: `✅ Loaded ${kbFiles.length} KB file(s)` });
          } else {
            // Auto-search + always include core BEP docs
            try {
              const allFiles = await prisma.knowledgeItem.findMany({ where: { type: 'FILE' }, select: { id: true, title: true, content: true }, take: 50 });
              // Always include core BEP docs
              const coreFiles = allFiles.filter((f: any) => /bep|prospectus|introduction|company_intro/i.test(f.title || ''));
              // Topic keyword search
              const topicWords = topic.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
              const scored = allFiles
                .map((f: any) => ({ ...f, score: topicWords.reduce((acc: number, w: string) => acc + (((f.title || '') + ' ' + (f.content || '').substring(0, 500)).toLowerCase().includes(w) ? 1 : 0), 0) }))
                .filter((f: any) => f.score > 0)
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, 4);
              // Merge core + scored, deduplicate
              const merged = [...coreFiles];
              for (const s of scored) { if (!merged.find((m: any) => m.id === s.id)) merged.push(s); }
              const finalFiles = merged.slice(0, 5);
              if (finalFiles.length > 0) {
                kbContext = finalFiles.map((f: any) => `【${coreFiles.includes(f) ? 'Core' : 'Auto-found'}: ${f.title}】\n${(f.content || '').substring(0, 2000)}`).join('\n\n');
                send('log', { step: '[1/3]', message: `✅ Loaded ${finalFiles.length} KB file(s): ${finalFiles.map((f: any) => f.title).join(', ')}` });
              } else {
                send('log', { step: '[1/3]', message: '⚠️ No matching KB files — generating from topic only' });
              }
            } catch { send('log', { step: '[1/3]', message: '⚠️ KB search skipped' }); }
          }

          const { client, config } = await getModelClient();
          send('log', { step: '[2/3]', message: `🔄 AI is designing your ${spec.label}...` });

          // ── Panel definitions per format ──
          let panelPrompt = '';
          if (selectedFormat === 'single') {
            panelPrompt = `Design a SINGLE PAGE flyer (A4 portrait, 210mm × 297mm). Output ONE complete HTML page. Use full-bleed sections, large hero image, feature highlights, and a strong CTA at the bottom. Make it visually striking — this is a marketing flyer.`;
          } else if (selectedFormat === 'trifold') {
            panelPrompt = `Design a TRI-FOLD brochure. The brochure is A4 landscape (297mm × 210mm) folded into 3 equal panels (each ~99mm wide).

Output TWO HTML pages:
1. "front" — the OUTSIDE of the brochure when folded (3 panels: back-panel | front-cover | flap)
2. "back" — the INSIDE spread when opened (3 panels: left | center | right)

Each page MUST use this CSS structure:
<div style="width:297mm;min-height:210mm;display:flex;">
  <div style="width:99mm;min-height:210mm;padding:12mm;box-sizing:border-box;">Panel 1</div>
  <div style="width:99mm;min-height:210mm;padding:12mm;box-sizing:border-box;border-left:1px dashed #ccc;">Panel 2</div>
  <div style="width:99mm;min-height:210mm;padding:12mm;box-sizing:border-box;border-left:1px dashed #ccc;">Panel 3</div>
</div>

Front panels: back-panel (company info/map), front-cover (logo, title, tagline, hero image), flap (contact/CTA).
Inside panels: left (introduction/overview), center (services/features), right (benefits/testimonials).`;
          } else {
            const pc = parseInt(pageCount) || 4;
            panelPrompt = `Design a ${pc}-PAGE booklet (A4 portrait, 210mm × 297mm each). Output ${pc} separate HTML pages. Include:
- Page 1: Cover page (logo, title, hero image, tagline)
- Pages 2-${pc - 1}: Content pages (each with a different section: overview, services, case studies, team, etc.)
- Page ${pc}: Back cover (contact info, CTA, logo)
Each page should feel like a premium printed page with generous margins (15mm+).`;
          }

          const placeholderList = Object.entries(PLACEHOLDERS).map(([k, v]) => `  ${k}: ${v}`).join('\n');

          const systemPrompt = await buildAgentPrompt(
            'iris',
            `Design a brochure: ${topic}`,
            kbContext,
            'You are Iris, the Brochure Designer.'
          ) + `

${panelPrompt}

DESIGN STYLE: ${STYLE_GUIDE[selectedStyle] || STYLE_GUIDE['bep']}

CRITICAL RULES:
1. Use Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>
2. Use Inter font: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
3. Use PRINT-READY design: @media print compatible, no scrolling.
4. Every page MUST be a complete HTML document.

IMAGES — use these real photo paths:
${placeholderList}
Every <img> MUST have data-slot attribute. Use object-cover class.

${selectedStyle === 'bep' ? `BEP LOGO:
- Dark backgrounds: <img src="/images/bep_logo_dark.png" alt="BEP" class="h-10">
- White backgrounds: <img src="/images/bep_logo_light.png" alt="BEP" class="h-10">` : ''}

OUTPUT FORMAT (strict JSON):
{
  "title": "Brochure Title",
  "pages": [
    { "id": "cover", "label": "Front Cover", "html": "<!DOCTYPE html><html>...</html>" }
  ]
}
${selectedFormat === 'trifold' ? 'Output exactly 2 pages: { id: "front", label: "Outside" } and { id: "back", label: "Inside Spread" }.' : ''}
Output ONLY valid JSON.`;

          const res = await trackableCompletion(
            tracker, 'brochure_generate', client, config,
            buildCompletionParams(config, [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Topic: ${topic}\nPreferences: ${preferences || 'None'}\n${background ? `Background:\n${background}` : ''}\nGenerate the brochure now. Output ONLY valid JSON.` }
            ], { requireJson: true, maxTokens: 16000 })
          );

          const result = extractJSON(res.choices?.[0]?.message?.content || '');
          if (!result?.pages?.length) {
            send('error', { message: 'AI failed to generate brochure structure' });
            controller.close();
            return;
          }

          send('log', { step: '[2/3]', message: `✅ Generated ${result.pages.length} page(s): ${result.pages.map((p: any) => p.label).join(', ')}` });
          send('log', { step: '[3/3]', message: '✅ Brochure generation complete!' });

          // Save asset
          const asset = await prisma.generatedAsset.create({
            data: {
              type: 'BROCHURE',
              title: `${topic} — ${spec.label}`,
              payload: JSON.stringify({ brochure: result, format: selectedFormat, style: selectedStyle }),
            }
          });

          send('result', { brochure: result, format: selectedFormat, assetId: asset.id });
          await tracker.persist('toolbox', 'brochure').catch(() => {});
          controller.close();
        } catch (err: any) {
          console.error(err);
          send('error', { message: err.message || 'Server error' });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
