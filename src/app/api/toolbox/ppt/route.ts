import { NextResponse } from 'next/server';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import { renderPPTX, SlideData } from '@/lib/pptx-renderer';
import { buildAgentPrompt } from '@/lib/bristh-config';
import prisma from '@/lib/prisma';

/**
 * Robust JSON extraction: handles markdown fences, trailing text, etc.
 */
function extractJSON(raw: string): any {
  // Strip markdown code fences
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try direct parse first
  try { return JSON.parse(cleaned); } catch {}

  // Try to find JSON array [...] or object {...}
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch {}
  }
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }

  return null;
}

/**
 * Convert Slide[] (element-level) to legacy SlideData[] for pptx-renderer
 */
function slidesToLegacy(slides: any[]): SlideData[] {
  return slides.map((s: any) => {
    const titleEl = s.elements?.find((e: any) => e.style?.fontWeight === 'bold' && e.style?.fontSize >= 1.8);
    const bodyEls = s.elements?.filter((e: any) => e !== titleEl) || [];
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
            `data: ${JSON.stringify({ type, data })}

`
          ));
        };

        try {
          send('log', { step: '[1/4]', message: '✅ 初始化，加载知识库资料...' });

          let finalBackground = background || '';
          if (kbFileIds && Array.isArray(kbFileIds) && kbFileIds.length > 0) {
            const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbFileIds } } });
            const kbTexts = kbFiles.map((f: any) => `【参考资料: ${f.title}]\n${f.content || '无正文内容'}`).join('\n\n');
            finalBackground = finalBackground + (finalBackground ? '\n\n' : '') + kbTexts;
          }

          const { client, config } = await getModelClient();
          send('log', { step: '[2/4]', message: '🔄 AI Edda 正在设计幻灯片大纲与内容...' });

          let personaPrefix = '';
          try {
            personaPrefix = await buildAgentPrompt(
              'edda',
              `Generate a presentation about: ${topic}`,
              finalBackground || '',
              'You are Edda, the Presentation Specialist. Transform text into structured slide presentations.'
            );
          } catch {
            personaPrefix = 'You are a professional presentation designer.';
          }

          const systemPrompt = `${personaPrefix}\n\nGenerate a structured PPT as a JSON array of Slide objects.\n\nRequirements:\n- Topic: "${topic}"\n- Number of slides: ${slideCount || '约10页'}\n- Content density: ${density || 'standard'}\n- Preferences: ${preferences || 'Professional business style'}\n\nBackground Information: ${finalBackground || 'None'}\n\nOutput EXACTLY a JSON array (NOT wrapped in an object) in this format:\n[\n  {\n    "backgroundColor": "#ffffff",\n    "elements": [\n      {\n        "id": "s0-title",\n        "type": "TEXT_BOX",\n        "content": "Text content here",\n        "x": 10,\n        "y": 10,\n        "width": 80,\n        "height": 15,\n        "style": {\n          "fontSize": 2.4,\n          "fontWeight": "bold",\n          "textAlign": "center",\n          "color": "#1a1a2e",\n          "backgroundColor": "transparent",\n          "padding": 1,\n          "borderRadius": 0\n        }\n      }\n    ]\n  }\n]\n\nCRITICAL RULES:\n- Output ONLY the JSON array. No extra text, no markdown fences.\n- x, y, width, height are percentages (0-100). ALWAYS ensure: x + width <= 100 and y + height <= 100\n- Each slide typically has 2-3 elements: a title (fontSize ~2.4, fontWeight bold, y ~8-12) and body text (fontSize ~1.1, y ~28-35)\n- First slide: centered title (large font ~3rem) + subtitle below it\n- Body text: use "• " bullet prefix for each point, separated by \\n\n- Use clean, professional styling. Keep backgroundColor "transparent" for text boxes unless creating accent blocks\n- Generate unique ids like "s0-title", "s0-body", "s1-title" etc\n- Content should be concise and professional in the requested language`;

          const response = await client.chat.completions.create(
            buildCompletionParams(config, [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `请为主题 "${topic}" 生成幻灯片 JSON 数组。仅输出 JSON，不要其他文字。` }
            ], { requireJson: true })
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

    // Use Edda's persona for copilot too
    let personaPrefix = '';
    try {
      personaPrefix = await buildAgentPrompt(
        'edda',
        instruction,
        '',
        'You are Edda, the Presentation Specialist at Bristh Enrollment Partners.'
      );
    } catch {
      personaPrefix = 'You are a presentation editor assistant.';
    }

    const systemPrompt = `${personaPrefix}

The user will give you existing presentation slides (JSON) and an editing instruction.

Your job:
1. Understand the instruction
2. Modify the slides JSON accordingly
3. Reply with a brief explanation followed by "---" then the COMPLETE updated slides JSON array

Current slides:
${JSON.stringify(slides)}

RULES:
- Output format: "Your reply text\n---\n[updated slides JSON]"
- The JSON after "---" must be a complete valid Slide[] array (no markdown fences)
- Preserve element ids when possible
- x, y, width, height are percentages 0-100
- Keep x+width <= 100 and y+height <= 100`;

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
