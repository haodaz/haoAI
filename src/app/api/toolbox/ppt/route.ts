import { NextResponse } from 'next/server';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { renderPPTX, SlideData } from '@/lib/pptx-renderer';
import { buildAgentPrompt } from '@/lib/bristh-config';
import prisma from '@/lib/prisma';

export const maxDuration = 300;

function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return JSON.parse(arrayMatch[0]); } catch {} }
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

function slidesToLegacy(slides: any[]): SlideData[] {
  return slides.map((s: any) => {
    const titleEl = s.elements?.find((e: any) => e.style?.fontWeight === 'bold' && e.style?.fontSize >= 1.8);
    const bodyEls = s.elements?.filter((e: any) => e !== titleEl && e.type === 'TEXT_BOX') || [];
    const bullets = bodyEls
      .map((e: any) => (e.content || '').split('\n').filter((l: string) => l.trim()))
      .flat()
      .map((b: string) => b.replace(/^[•\-]\s*/, ''));
    return {
      title: titleEl?.content || 'Untitled',
      bullets: bullets.length > 0 ? bullets : ['Content']
    };
  });
}

/**
 * POST — Generate new PPT from scratch (SSE streaming)
 */
export async function POST(req: Request) {
  try {
    const { topic, slideCount, theme, density, background, preferences, kbFileIds } = await req.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: any) => {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type, data })}\n\n`
          ));
        };

        try {
          send('log', { step: '[1/4]', message: '✅ 初始化，加载知识库资料...' });

          let finalBackground = background || '';
          if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            const kbTexts = kbFiles.map((f: any) => `[Reference: ${f.title}]\n${f.content || ''}`).join('\n\n');
            finalBackground = finalBackground + (finalBackground ? '\n\n' : '') + kbTexts;
          }
          // Always load BEP core KB for contact info
          const bepCoreKb = await prisma.knowledgeItem.findMany({
            where: { OR: [{ title: { startsWith: 'BEP Introduction' } }, { title: { contains: 'contact' } }, { title: { contains: 'Contact' } }] },
            take: 3
          });
          if (bepCoreKb.length > 0) {
            finalBackground += '\n\n[BEP Core Info]\n' + bepCoreKb.map((f: any) => f.content).join('\n\n');
          }

          const { client, config } = await getModelClient();
          send('log', { step: '[2/4]', message: '🎨 AI Edda 正在设计幻灯片布局与内容...' });

          let personaPrefix = '';
          try {
            personaPrefix = await buildAgentPrompt(
              'edda',
              `Generate a presentation about: ${topic}`,
              finalBackground || '',
              'You are Edda, the Presentation Specialist. Transform text into structured slide presentations.'
            );
          } catch {
            personaPrefix = 'You are Edda, a professional presentation designer at British Enrolment Partners (BEP).';
          }

          // ─── PREMIUM DESIGN SYSTEM PROMPT ────────────────────────────────────
          const systemPrompt = `${personaPrefix}

## YOUR MISSION
Create a PREMIUM, VISUALLY STUNNING presentation for British Enrolment Partners (BEP).
This is a professional business presentation. The visual quality MUST be exceptional.

## BEP BRAND PALETTE
- Navy (primary):  #1a2f5e
- Gold (accent):   #c9a84c
- Light Blue:      #4a90d9
- White:           #ffffff
- Light Gray:      #f4f6f9
- Body text:       #374151
- Light text:      #a0c4e8

## ELEMENT TYPES
- TEXT_BOX: has "content" field with text
- SHAPE_BOX: decorative shape/color block, content MUST be ""

## 6 LAYOUT PATTERNS — USE ALL OF THEM, VARIED

PATTERN A — DARK COVER (slide 0 ONLY):
backgroundColor: "#1a2f5e"
[ SHAPE_BOX x:0,y:0,w:100,h:2 bg:#c9a84c ] ← gold top bar
[ TEXT_BOX x:10,y:25,w:80,h:22 fontSize:3.4 bold white centered ] ← main title
[ TEXT_BOX x:15,y:56,w:70,h:8 fontSize:1.4 normal #a0c4e8 centered ] ← subtitle
[ TEXT_BOX x:15,y:68,w:70,h:7 fontSize:1.1 normal #c9a84c centered ] ← date/tagline
[ SHAPE_BOX x:0,y:97,w:100,h:3 bg:#c9a84c ] ← gold bottom bar

PATTERN B — SECTION DIVIDER (use every 3rd-4th slide):
backgroundColor: "#1a2f5e"
[ SHAPE_BOX x:0,y:0,w:1.5,h:100 bg:#c9a84c ] ← gold left bar
[ TEXT_BOX x:8,y:28,w:85,h:20 fontSize:2.8 bold white ] ← section name
[ SHAPE_BOX x:8,y:51,w:30,h:0.8 bg:#c9a84c ] ← decorative underline
[ TEXT_BOX x:8,y:56,w:78,h:12 fontSize:1.3 normal #a0c4e8 ] ← section subtitle

PATTERN C — TWO COLUMN:
backgroundColor: "#ffffff"
[ SHAPE_BOX x:0,y:0,w:100,h:19 bg:#1a2f5e ] ← navy header bar
[ TEXT_BOX x:4,y:2,w:92,h:14 fontSize:1.9 bold white ] ← title in header
[ TEXT_BOX x:4,y:23,w:44,h:71 fontSize:1.05 normal #374151 ] ← left column bullets
[ SHAPE_BOX x:49.5,y:23,w:0.5,h:69 bg:#e2e8f0 ] ← divider
[ TEXT_BOX x:52,y:23,w:44,h:71 fontSize:1.05 normal #374151 ] ← right column bullets

PATTERN D — BULLET LIST (most common for content):
backgroundColor: "#ffffff"
[ SHAPE_BOX x:0,y:0,w:0.9,h:100 bg:#c9a84c ] ← gold left accent bar
[ TEXT_BOX x:5,y:7,w:90,h:14 fontSize:2.1 bold #1a2f5e ] ← title
[ SHAPE_BOX x:5,y:22,w:22,h:0.7 bg:#c9a84c ] ← gold underline
[ TEXT_BOX x:5,y:27,w:90,h:67 fontSize:1.1 normal #374151 ] ← bullet text

PATTERN E — KPI STATS CARD:
backgroundColor: "#f4f6f9"
[ SHAPE_BOX x:0,y:0,w:100,h:22 bg:#1a2f5e ] ← navy header
[ TEXT_BOX x:4,y:3,w:92,h:15 fontSize:1.9 bold white ] ← title
[ SHAPE_BOX x:4,y:26,w:28,h:36 bg:#1a2f5e borderRadius:8 ] ← card 1 (navy)
[ SHAPE_BOX x:36,y:26,w:28,h:36 bg:#c9a84c borderRadius:8 ] ← card 2 (gold)
[ SHAPE_BOX x:68,y:26,w:28,h:36 bg:#4a90d9 borderRadius:8 ] ← card 3 (blue)
[ TEXT_BOX x:4,y:28,w:28,h:12 fontSize:2.6 bold white centered ] ← number 1
[ TEXT_BOX x:36,y:28,w:28,h:12 fontSize:2.6 bold #1a2f5e centered ] ← number 2
[ TEXT_BOX x:68,y:28,w:28,h:12 fontSize:2.6 bold white centered ] ← number 3
[ TEXT_BOX x:4,y:41,w:28,h:8 fontSize:0.85 normal #a0c4e8 centered ] ← label 1
[ TEXT_BOX x:36,y:41,w:28,h:8 fontSize:0.85 normal #1a2f5e centered ] ← label 2
[ TEXT_BOX x:68,y:41,w:28,h:8 fontSize:0.85 normal #a0c4e8 centered ] ← label 3
[ TEXT_BOX x:4,y:66,w:92,h:27 fontSize:1.0 normal #374151 ] ← explanatory text

PATTERN F — CONTACT / THANK YOU (LAST SLIDE):
backgroundColor: "#1a2f5e"
[ SHAPE_BOX x:0,y:0,w:100,h:2 bg:#c9a84c ] ← gold top bar
[ TEXT_BOX x:10,y:15,w:80,h:16 fontSize:2.9 bold white centered ] ← "Thank You" / outro
[ TEXT_BOX x:15,y:38,w:70,h:9 fontSize:1.3 normal #a0c4e8 centered ] ← tagline
[ SHAPE_BOX x:20,y:52,w:60,h:0.6 bg:#c9a84c ] ← gold divider
[ TEXT_BOX x:10,y:57,w:80,h:28 fontSize:1.0 normal #a0c4e8 centered ] ← REAL contact details
[ SHAPE_BOX x:0,y:97,w:100,h:3 bg:#c9a84c ] ← gold bottom bar

## STRICT RULES
1. Output ONLY a valid JSON array. ZERO markdown. ZERO explanation text.
2. x+width <= 100 and y+height <= 100 for EVERY element without exception.
3. TEXT on dark background: color MUST be "#ffffff" or "#a0c4e8". NEVER put dark text on navy.
4. SHAPE_BOX: content field MUST be "".
5. Slide 0 = PATTERN A (dark cover). Use title from topic.
6. Last slide = PATTERN F with REAL contact info from Background Info.
   - NEVER invent phone numbers. NEVER invent emails. Only use what's in Background Info.
   - If no contact info found, write "Contact us to discuss partnership opportunities."
7. Use PATTERN B for section breaks (approx every 3-4 slides).
8. Alternate between PATTERN C, D, E for content slides.
9. Bullet text format: "• Point one\n• Point two\n• Point three" (use actual newline in JSON string)
10. Each element needs a UNIQUE id: "sN-shape1", "sN-title", "sN-body", "sN-card1" etc.

## PRESENTATION SPEC
- Topic: "${topic}"
- Slide Count: ${slideCount || 10}
- Style: ${preferences || 'Professional business English'}
- Density: ${density || 'standard'}

## BACKGROUND / KB CONTEXT (extract real facts and contact info from this):
${finalBackground || 'None provided.'}`;

          const response = await client.chat.completions.create(
            buildCompletionParams(config, [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Generate a ${slideCount || 10}-slide premium presentation for "${topic}". Use the BEP brand design system. Extract real contact info from Background Info for the last slide. Use PATTERN A for slide 0, PATTERN F for last slide, and a mix of PATTERN B-E for the rest. Output ONLY the JSON array.` }
            ], { requireJson: true, maxTokens: 8192 })
          );

          const rawContent = response.choices[0].message.content || '';
          send('log', { step: '[3/4]', message: `✅ AI 内容生成完毕，正在渲染 PPTX 文件...` });

          const parsed = extractJSON(rawContent);
          if (!parsed) {
            send('error', { message: 'AI returned invalid JSON. Please try again.' });
            controller.close();
            return;
          }

          const slides = Array.isArray(parsed) ? parsed : (parsed.slides || []);
          if (slides.length === 0) {
            send('error', { message: 'AI generated empty slides' });
            controller.close();
            return;
          }

          const legacySlides = slidesToLegacy(slides);
          const { fileUrl, fileName } = await renderPPTX({
            slides: legacySlides,
            theme: theme || 'blue',
            coverTitle: topic,
            coverSubtitle: 'Generated by BEP Auto Office',
          });

          // Save to GeneratedAsset for history
          await prisma.generatedAsset.create({
            data: {
              type: 'PPT',
              title: `${topic} — Presentation`,
              payload: JSON.stringify({ slides, fileUrl, rawSlides: slides }),
            }
          }).catch(() => {});

          send('log', { step: '[4/4]', message: `✅ PPTX 已渲染完成！共 ${slides.length} 张幻灯片。` });
          send('result', { slides, fileUrl, fileName, slideCount: slides.length });
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

    let personaPrefix = '';
    try {
      personaPrefix = await buildAgentPrompt(
        'edda',
        instruction,
        '',
        'You are Edda, the Presentation Specialist at British Enrolment Partners.'
      );
    } catch {
      personaPrefix = 'You are Edda, a presentation editor. You maintain BEP brand colors (navy #1a2f5e, gold #c9a84c).';
    }

    const systemPrompt = `${personaPrefix}

The user wants to edit an existing BEP presentation.

Current slides JSON:
${JSON.stringify(slides)}

RULES when editing:
- Maintain BEP brand colors (navy #1a2f5e, gold #c9a84c, white #ffffff).
- Keep SHAPE_BOX decorative elements intact unless explicitly asked to remove them.
- TEXT on dark backgrounds must be white (#ffffff or #a0c4e8).
- x+width <= 100 and y+height <= 100 for every element.
- Reply format: "Your brief reply\n---\n[complete updated slides JSON array]"
- The JSON after "---" must be the COMPLETE slides array, not just changed slides.`;

    const response = await client.chat.completions.create(
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

    return NextResponse.json({
      reply,
      slides: updatedSlides || slides,
    });
  } catch (error: any) {
    console.error('PPT Copilot error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
