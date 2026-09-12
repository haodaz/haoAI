import { NextResponse } from 'next/server';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { renderRichPPTX, RichSlideData } from '@/lib/pptx-renderer';
import { buildAgentPrompt } from '@/lib/bristh-config';
import prisma from '@/lib/prisma';

export const maxDuration = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return JSON.parse(arrayMatch[0]); } catch {} }
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

/** Run promises in batches of `batchSize` */
async function batchRun<T>(tasks: (() => Promise<T>)[], batchSize: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn => fn()));
    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : (null as any));
    }
  }
  return results;
}

// ─── Pattern Design Specs (injected per-slide, NOT in outline prompt) ─────

const PATTERN_SPECS: Record<string, string> = {
  A: `PATTERN A — DARK COVER (slide 0 ONLY):
backgroundColor: "#0E3018"
[ SHAPE_BOX x:0,y:0,w:100,h:2 bg:#c9a84c ] ← gold top bar
[ TEXT_BOX x:10,y:30,w:80,h:22 fontSize:3.4 bold white centered ] ← main title
[ TEXT_BOX x:15,y:58,w:70,h:8 fontSize:1.4 normal #a7f3d0 centered ] ← subtitle
[ TEXT_BOX x:15,y:70,w:70,h:7 fontSize:1.1 normal #c9a84c centered ] ← date/tagline
[ SHAPE_BOX x:0,y:97,w:100,h:3 bg:#c9a84c ] ← gold bottom bar`,

  B: `PATTERN B — SECTION DIVIDER:
backgroundColor: "#0E3018"
[ SHAPE_BOX x:0,y:0,w:1.5,h:100 bg:#c9a84c ] ← gold left bar
[ TEXT_BOX x:8,y:28,w:85,h:20 fontSize:2.8 bold white ] ← section name
[ SHAPE_BOX x:8,y:51,w:30,h:0.8 bg:#c9a84c ] ← decorative underline
[ TEXT_BOX x:8,y:56,w:78,h:12 fontSize:1.3 normal #a7f3d0 ] ← section subtitle`,

  C: `PATTERN C — TWO COLUMN:
backgroundColor: "#ffffff"
[ SHAPE_BOX x:0,y:0,w:0.9,h:100 bg:#c9a84c ] ← gold left accent bar
[ TEXT_BOX x:5,y:5,w:90,h:12 fontSize:2.1 bold #0E3018 ] ← title (dark green)
[ SHAPE_BOX x:5,y:18,w:22,h:0.7 bg:#c9a84c ] ← gold underline
[ TEXT_BOX x:5,y:24,w:43,h:70 fontSize:1.05 normal #374151 lineSpacing:1.8 ] ← left column bullets
[ SHAPE_BOX x:49.5,y:24,w:0.3,h:65 bg:#e2e8f0 ] ← divider line
[ TEXT_BOX x:52,y:24,w:43,h:70 fontSize:1.05 normal #374151 lineSpacing:1.8 ] ← right column bullets`,

  D: `PATTERN D — BULLET LIST (most common for content):
backgroundColor: "#ffffff"
[ SHAPE_BOX x:0,y:0,w:0.9,h:100 bg:#c9a84c ] ← gold left accent bar
[ TEXT_BOX x:5,y:5,w:90,h:12 fontSize:2.1 bold #0E3018 ] ← title (dark green)
[ SHAPE_BOX x:5,y:18,w:22,h:0.7 bg:#c9a84c ] ← gold underline
[ TEXT_BOX x:5,y:24,w:90,h:70 fontSize:1.15 normal #374151 lineSpacing:1.8 ] ← bullet text (generous spacing)`,

  E: `PATTERN E — KPI STATS CARD:
backgroundColor: "#ffffff"
[ SHAPE_BOX x:0,y:0,w:0.9,h:100 bg:#c9a84c ] ← gold left accent bar
[ TEXT_BOX x:5,y:5,w:90,h:12 fontSize:2.1 bold #0E3018 ] ← title (dark green)
[ SHAPE_BOX x:5,y:18,w:22,h:0.7 bg:#c9a84c ] ← gold underline
[ SHAPE_BOX x:5,y:26,w:27,h:32 bg:#0E3018 borderRadius:8 ] ← card 1 (dark green)
[ SHAPE_BOX x:36,y:26,w:27,h:32 bg:#c9a84c borderRadius:8 ] ← card 2 (gold)
[ SHAPE_BOX x:67,y:26,w:27,h:32 bg:#0E3018 borderRadius:8 ] ← card 3 (dark green)
[ TEXT_BOX x:5,y:28,w:27,h:12 fontSize:2.6 bold white centered ] ← number 1
[ TEXT_BOX x:36,y:28,w:27,h:12 fontSize:2.6 bold #0E3018 centered ] ← number 2
[ TEXT_BOX x:67,y:28,w:27,h:12 fontSize:2.6 bold white centered ] ← number 3
[ TEXT_BOX x:5,y:41,w:27,h:8 fontSize:0.9 normal #a7f3d0 centered ] ← label 1
[ TEXT_BOX x:36,y:41,w:27,h:8 fontSize:0.9 normal #0E3018 centered ] ← label 2
[ TEXT_BOX x:67,y:41,w:27,h:8 fontSize:0.9 normal #a7f3d0 centered ] ← label 3
[ TEXT_BOX x:5,y:64,w:90,h:30 fontSize:1.05 normal #374151 lineSpacing:1.8 ] ← explanatory text`,

  F: `PATTERN F — CONTACT / THANK YOU (LAST SLIDE):
backgroundColor: "#0E3018"
[ SHAPE_BOX x:0,y:0,w:100,h:2 bg:#c9a84c ] ← gold top bar
[ TEXT_BOX x:10,y:18,w:80,h:16 fontSize:2.9 bold white centered ] ← "Thank You" / outro
[ TEXT_BOX x:15,y:40,w:70,h:9 fontSize:1.3 normal #a7f3d0 centered ] ← tagline
[ SHAPE_BOX x:20,y:54,w:60,h:0.6 bg:#c9a84c ] ← gold divider
[ TEXT_BOX x:10,y:59,w:80,h:26 fontSize:1.0 normal #a7f3d0 centered ] ← REAL contact details
[ SHAPE_BOX x:0,y:97,w:100,h:3 bg:#c9a84c ] ← gold bottom bar`,
};

// ─── Slide count mapping (UI says "5/10/15/20" as scale, we map to actual) ──
const SCALE_TO_SLIDES: Record<string, number> = {
  '5': 5, '10': 10, '15': 15, '20': 20,
};

/**
 * POST — Generate new PPT via 3-phase pipeline (SSE streaming)
 *
 * Phase 1: Outline Planning — lightweight AI, KB-heavy, no design specs
 * Phase 2: Per-Slide Detail — concurrent AI calls, pattern-specific, 16384 tokens each
 * Phase 3: PPTX Rendering — pure computation, no AI
 */
export async function POST(req: Request) {
  try {
    const { topic, slideCount, density, background, preferences, kbFileIds, theme } = await req.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 });
    }

    const targetSlides = SCALE_TO_SLIDES[String(slideCount)] || parseInt(slideCount) || 10;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type, data })}\n\n`
          ));
        };

        try {
          const tracker = new TokenTracker();
          // ═══════════════════════════════════════════════════════════════════
          // PHASE 0: KB Loading
          // ═══════════════════════════════════════════════════════════════════
          send('log', { step: '[Phase 0]', message: '📚 Loading knowledge base...' });

          let kbContext = '';
          if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            kbContext += kbFiles.map((f: any) => `[Reference: ${f.title}]\n${f.content || ''}`).join('\n\n');
          }
          const bepCoreKb = await prisma.knowledgeItem.findMany({
            where: { OR: [{ title: { startsWith: 'BEP Introduction' } }, { title: { contains: 'contact' } }, { title: { contains: 'Contact' } }] },
            take: 3
          });
          if (bepCoreKb.length > 0) {
            kbContext += (kbContext ? '\n\n' : '') + '[BEP Core Info]\n' + bepCoreKb.map((f: any) => f.content).join('\n\n');
          }
          if (background) {
            kbContext += (kbContext ? '\n\n' : '') + '[User Background]\n' + background;
          }

          send('log', { step: '[Phase 0]', message: `✅ KB loaded (${kbContext.length} chars)` });

          const { client, config } = await getModelClient();

          // ═══════════════════════════════════════════════════════════════════
          // PHASE 1: Outline Planning
          // Slim prompt: only pattern names + KB context. No design coordinates.
          // ═══════════════════════════════════════════════════════════════════
          send('log', { step: '[Phase 1]', message: `🧠 AI is planning ${targetSlides}-slide outline...` });

          let personaPrefix = '';
          try {
            personaPrefix = await buildAgentPrompt(
              'edda',
              `Plan a ${targetSlides}-slide presentation about: ${topic}`,
              kbContext,
              'You are Edda, the Presentation Specialist at BEP.'
            );
          } catch {
            personaPrefix = 'You are Edda, a professional presentation designer at British Enrolment Partners (BEP).';
          }

          const outlinePrompt = `${personaPrefix}

## YOUR TASK
Plan the outline for a ${targetSlides}-slide professional BEP presentation.

## BUSINESS CONTEXT — USE THIS CONTENT (very important, must be reflected in the slides)
${kbContext || 'No specific context provided. Create a general BEP presentation.'}

## AVAILABLE SLIDE PATTERNS (choose the best for each slide)
- A: Dark Cover (MUST be slide 0)
- B: Section Divider (use every 3-4 content slides to break sections)
- C: Two Column (side-by-side comparisons, pros/cons)
- D: Bullet List (general content — most versatile)
- E: KPI Stats Card (numbers, metrics, achievements — needs 3 stat items)
- F: Contact / Thank You (MUST be last slide)

## PRESENTATION SPEC
- Topic: "${topic}"
- Target Slides: ${targetSlides}
- Density: ${density || 'standard'}
- Style: ${preferences || 'Professional business English'}

## OUTPUT FORMAT — JSON array, one object per slide:
[
  { "index": 0, "pattern": "A", "title": "...", "contentBrief": "What this slide should cover (2-3 sentences)" },
  { "index": 1, "pattern": "D", "title": "...", "contentBrief": "..." },
  ...
]

RULES:
1. index 0 MUST use pattern "A". Last slide MUST use pattern "F".
2. Insert pattern "B" section dividers every 3-4 slides.
3. contentBrief must contain SPECIFIC facts and points from the Business Context above. Do NOT write generic placeholders.
4. For pattern "E" slides, contentBrief must specify exactly 3 stat items with numbers.
5. For pattern "F" (last slide), contentBrief must include REAL contact info from KB if available.
6. Output ONLY valid JSON. No markdown, no explanation.`;

          const outlineRes = await trackableCompletion(
            tracker, 'ppt_outline', client, config,
            buildCompletionParams(config, [
              { role: 'system', content: outlinePrompt },
              { role: 'user', content: `Plan a ${targetSlides}-slide presentation for "${topic}". Output ONLY the JSON array.` }
            ], { requireJson: true, maxTokens: 4096 })
          );

          const outlineRaw = outlineRes.choices[0].message.content || '';
          const outline = extractJSON(outlineRaw);
          if (!outline || !Array.isArray(outline) || outline.length === 0) {
            send('error', { message: 'Phase 1 failed: AI could not produce a valid outline. Please try again.' });
            controller.close();
            return;
          }

          console.log(`[PPT Phase 1] Outline: ${outline.length} slides planned`);
          send('log', { step: '[Phase 1]', message: `✅ Outline complete! ${outline.length} slides` });
          send('outline', outline);

          // ═══════════════════════════════════════════════════════════════════
          // PHASE 2: Per-Slide Detail Generation (concurrent, 3 per batch)
          // Each slide gets its own AI call with only its pattern spec.
          // ═══════════════════════════════════════════════════════════════════
          send('log', { step: '[Phase 2]', message: `🎨 Generating slides (${outline.length} total, batch of 3)...` });

          const generateSlide = async (item: any): Promise<RichSlideData | null> => {
            const pattern = item.pattern || 'D';
            const patternSpec = PATTERN_SPECS[pattern] || PATTERN_SPECS['D'];

            const slidePrompt = `You are generating slide ${item.index} of a BEP presentation.

## DESIGN SPEC — Follow this layout exactly:
${patternSpec}

## SLIDE CONTENT
Title: ${item.title}
Content Brief: ${item.contentBrief}

## BEP BRAND PALETTE
Dark Green: #0E3018, Gold: #c9a84c, Light Green: #a7f3d0, White: #ffffff, Gray: #f4f6f9, Body text: #374151

## ELEMENT TYPES
- TEXT_BOX: { id, type:"TEXT_BOX", content:"text here", x, y, width, height, style:{ fontSize, fontWeight, color, textAlign } }
- SHAPE_BOX: { id, type:"SHAPE_BOX", content:"", x, y, width, height, style:{ backgroundColor, borderRadius? } }
- IMAGE: { id, type:"IMAGE", content:"placeholder:Description of image", imagePath:"placeholder:Description of image", x, y, width, height, style:{} }
  Use IMAGE sparingly — only when a slide would genuinely benefit from a visual (e.g. diagrams, photos, illustrations). The "placeholder:..." prefix generates a branded placeholder that users can later replace.

## OUTPUT — a single JSON object:
{ "backgroundColor": "#hex", "elements": [ ...elements ] }

RULES:
1. x+width <= 100 and y+height <= 100 for EVERY element.
2. TEXT on dark bg (#0E3018): color MUST be "#ffffff" or "#a7f3d0". NEVER dark text on dark green.
3. SHAPE_BOX content MUST be "".
4. Each element needs a UNIQUE id like "s${item.index}-shape1", "s${item.index}-title", etc.
5. Bullet text: "• Point one\\n• Point two\\n• Point three" (actual newlines in JSON string).
6. Fill in REAL content based on the Content Brief. No "[INSERT]" placeholders.
7. Output ONLY valid JSON. No markdown wrapping.
8. CONTENT RICHNESS: Each slide should have SUBSTANTIAL content. For body text, write 2-3 sentences per point, not just single phrases. Mix paragraph-style explanatory text with bullet points. Aim for 100-200 words per content slide. Don't be sparse.
9. Write full sentences with context and supporting details, as if this were a real business document.`;

            try {
              const res = await trackableCompletion(
                tracker, `ppt_slide_${item.index}`, client, config,
                buildCompletionParams(config, [
                  { role: 'system', content: slidePrompt },
                  { role: 'user', content: `Generate the complete elements JSON for slide ${item.index}: "${item.title}". Output ONLY the JSON object.` }
                ], { requireJson: true, maxTokens: 16384 })
              );

              const parsed = extractJSON(res.choices[0].message.content || '');
              if (parsed && parsed.elements) {
                return parsed as RichSlideData;
              }
            } catch (err: any) {
              console.error(`[PPT Phase 2] Slide ${item.index} failed:`, err.message);
            }
            return null;
          };

          // Build tasks and run in batches of 3
          const slideTasks = outline.map((item: any) => () => generateSlide(item));
          const slideResults = await batchRun<RichSlideData | null>(slideTasks, 3);

          // Report progress per slide and retry failures once
          const finalSlides: RichSlideData[] = [];
          for (let i = 0; i < slideResults.length; i++) {
            let result = slideResults[i];
            if (result) {
              send('slide_done', { index: i, success: true, title: outline[i].title });
              finalSlides.push(result);
            } else {
              // Retry once with a simpler fallback (pattern D)
              send('log', { step: `[Slide ${i}]`, message: `⚠️ Retrying...` });
              result = await generateSlide({ ...outline[i], pattern: 'D' });
              if (result) {
                send('slide_done', { index: i, success: true, title: outline[i].title, retried: true });
                finalSlides.push(result);
              } else {
                send('slide_done', { index: i, success: false, title: outline[i].title });
                // Push a minimal fallback slide
                finalSlides.push({
                  backgroundColor: '#ffffff',
                  elements: [
                    { id: `s${i}-title`, type: 'TEXT_BOX', content: outline[i].title || `Slide ${i + 1}`, x: 5, y: 5, width: 90, height: 12, style: { fontSize: 2.1, fontWeight: 'bold', color: '#0E3018' } },
                    { id: `s${i}-body`, type: 'TEXT_BOX', content: outline[i].contentBrief || '', x: 5, y: 27, width: 90, height: 67, style: { fontSize: 1.1, color: '#374151' } },
                  ]
                });
              }
            }
          }

          const successCount = slideResults.filter(r => r !== null).length;
          send('log', { step: '[Phase 2]', message: `✅ Slides complete! ${successCount}/${outline.length} succeeded` });

          // ═══════════════════════════════════════════════════════════════════
          // PHASE 3: PPTX Rendering (pure computation, no AI)
          // ═══════════════════════════════════════════════════════════════════
          send('log', { step: '[Phase 3]', message: '📄 Rendering PPTX file...' });

          const { fileUrl, fileName } = await renderRichPPTX({
            slides: finalSlides,
            title: topic,
          });

          // Save to GeneratedAsset for history
          await prisma.generatedAsset.create({
            data: {
              type: 'PPT',
              title: `${topic} — Presentation`,
              payload: JSON.stringify({ slides: finalSlides, fileUrl, outline }),
            }
          }).catch(() => {});

          send('log', { step: '[Phase 3]', message: `✅ PPTX rendered! ${finalSlides.length} slides` });
          send('result', { slides: finalSlides, fileUrl, fileName, slideCount: finalSlides.length });
          await tracker.persist('toolbox', 'ppt').catch(() => {});
          controller.close();
        } catch (err: any) {
          console.error('PPT Toolbox error:', err);
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
    console.error('PPT Toolbox error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


/**
 * PUT — Copilot Revision: modify existing slides via Edda's persona
 */
export async function PUT(req: Request) {
  try {
    const { slides, instruction } = await req.json();
    if (!slides || !instruction) {
      return NextResponse.json({ error: 'Missing slides or instruction' }, { status: 400 });
    }

    const { client, config } = await getModelClient();
    const putTracker = new TokenTracker();

    let personaPrefix = '';
    try {
      personaPrefix = await buildAgentPrompt(
        'edda',
        instruction,
        '',
        'You are Edda, the Presentation Specialist at British Enrolment Partners.'
      );
    } catch {
      personaPrefix = 'You are Edda, a presentation editor. You maintain BEP brand colors (green #0E3018, gold #c9a84c).';
    }

    const systemPrompt = `${personaPrefix}

The user wants to edit an existing BEP presentation.

Current slides JSON:
${JSON.stringify(slides)}

RULES when editing:
- Maintain BEP brand colors (green #0E3018, gold #c9a84c, white #ffffff).
- Keep SHAPE_BOX decorative elements intact unless explicitly asked to remove them.
- TEXT on dark backgrounds must be white (#ffffff or #a7f3d0).
- x+width <= 100 and y+height <= 100 for every element.
- Reply format: "Your brief reply\n---\n[complete updated slides JSON array]"
- The JSON after "---" must be the COMPLETE slides array, not just changed slides.`;

    const response = await trackableCompletion(
      putTracker, 'ppt_copilot', client, config,
      buildCompletionParams(config, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: instruction }
      ])
    );

    const text = response.choices[0].message.content || '';
    let reply = text;
    let updatedSlides = null;

    if (text.includes('---')) {
      const parts = text.split('---');
      reply = parts[0].trim();
      const jsonPart = parts.slice(1).join('---').trim();
      const parsed = extractJSON(jsonPart);
      if (parsed) {
        updatedSlides = Array.isArray(parsed) ? parsed : (parsed.slides || null);
      }
    }

    await putTracker.persist('toolbox', 'ppt').catch(() => {});
    return NextResponse.json({
      reply,
      slides: updatedSlides || slides,
    });
  } catch (error: any) {
    console.error('PPT Copilot error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
