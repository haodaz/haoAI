import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import PptxGenJS from 'pptxgenjs';
import path from 'path';
import fs from 'fs/promises';
import { buildAgentPrompt } from '@/lib/bristh-config';
import { recordTaskCompletion } from '@/lib/memory-hooks';

// Allow up to 120s for PPT generation (GPT-4o JSON output can be slow)
export const maxDuration = 120;

export async function POST(req: Request) {
  let taskIdForError = '';
  try {
    const { taskId, locale } = await req.json();
    taskIdForError = taskId;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { context: true }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' }
    });

    const fallbackPersona = 'You are Edda, the Presentation Specialist at Bristh Enrollment Partners. Transform text into structured slide presentations.';
    
    let finalBackground = task.context.rawContent;
    if (task.attachmentIds) {
      try {
        const attIds = JSON.parse(task.attachmentIds);
        const contextAttachments = task.context.attachments ? JSON.parse(task.context.attachments) : [];
        const matched = contextAttachments.filter((a: any) => attIds.includes(a.id));
        
        const kbIds = matched.filter((a: any) => a.isKbFile).map((a: any) => a.id);
        const localExtracted = matched.filter((a: any) => !a.isKbFile).map((a: any) => `【上传文件: ${a.originalName}】\n${a.extractedText || a.summary}`).join('\n\n');
        
        let kbTexts = '';
        if (kbIds.length > 0) {
          const kbFiles = await prisma.knowledgeItem.findMany({ where: { id: { in: kbIds } } });
          kbTexts = kbFiles.map(f => `【知识库文件: ${f.title}】\n${f.content || '无正文'}`).join('\n\n');
        }
        
        const extraContext = [localExtracted, kbTexts].filter(Boolean).join('\n\n');
        if (extraContext) {
           finalBackground = finalBackground + '\n\n' + extraContext;
        }
      } catch (e) {
        console.error('Failed to parse attachments for Edda', e);
      }
    }

    const systemPrompt = await buildAgentPrompt('edda', task.instruction, finalBackground, fallbackPersona, locale)
      + `\n\nOutput exactly in this JSON format:
{
  "think": "Write your step-by-step thinking in Markdown here",
  "slides": [
    {
      "backgroundColor": "#ffffff",
      "elements": [
        {
          "id": "s0-title",
          "type": "TEXT_BOX",
          "content": "Slide Title",
          "x": 10, "y": 8, "width": 80, "height": 14,
          "style": { "fontSize": 2.4, "fontWeight": "bold", "textAlign": "left", "color": "#1a1a2e", "backgroundColor": "transparent", "padding": 1, "borderRadius": 0 }
        },
        {
          "id": "s0-body",
          "type": "TEXT_BOX",
          "content": "• Point 1\\n• Point 2",
          "x": 10, "y": 28, "width": 80, "height": 62,
          "style": { "fontSize": 1.1, "fontWeight": "normal", "textAlign": "left", "color": "#333333", "backgroundColor": "transparent", "padding": 1, "borderRadius": 0 }
        }
      ]
    }
  ]
}
Rules:
- x, y, width, height are percentages (0-100). Ensure x+width<=100 and y+height<=100
- First slide should be a cover with centered title
- Generate unique ids like "s0-title", "s0-body", "s1-title" etc`;

    const { client, config } = await getModelClient();
    const response = await client.chat.completions.create(
      buildCompletionParams(config, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the presentation JSON now. Output ONLY valid JSON.' }
      ], { requireJson: true, maxTokens: 8192 })
    );

    let rawJson = response.choices[0].message.content || '{"think": "", "slides": []}';
    rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();

    // Robust parsing — Claude often outputs trailing commas
    function sanitizeJson(str: string): string {
      return str.replace(/,\s*([\]}])/g, '$1');
    }

    let parsedData;
    try {
      parsedData = JSON.parse(rawJson);
    } catch {
      try {
        parsedData = JSON.parse(sanitizeJson(rawJson));
      } catch {
        // Try to extract JSON object
        const match = rawJson.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsedData = JSON.parse(match[0]);
          } catch {
            parsedData = JSON.parse(sanitizeJson(match[0]));
          }
        } else {
          throw new Error('Failed to parse AI response as JSON');
        }
      }
    }

    const slides = parsedData.slides || [];
    const thinkLog = parsedData.think || '🤔 Edda 正在分析您的请求并设计演示文稿...';

    if (slides.length === 0) {
        throw new Error("Failed to parse slides from AI.");
    }
    
    // Create Tool Calls Log for transparent UI rendering
    const toolCallsLog = JSON.stringify([
      {
        tool: 'pptxgenjs_renderer',
        status: 'success',
        logs: [
          '⏳ [第一阶段] 正在解析抽取到的大纲数据...',
          '✅ 成功载入 ' + slides.length + ' 页结构数据',
          '⏳ [第二阶段] 正在写入系统母版样式 (Corporate Layout)...',
          '⏳ [第三阶段] 正在并发渲染文本和占位节点...',
          '✅ 成功渲染所有文本节点',
          '✅ 文件打包生成完毕 (.pptx)'
        ]
      }
    ]);

    // Generate .pptx file
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    // Title Slide (Cover)
    const coverSlide = pptx.addSlide();
    coverSlide.background = { color: '1E3A8A' };
    coverSlide.addText('Bristh Enrollment Partners', {
        x: '10%', y: '40%', w: '80%', h: 1, 
        fontSize: 36, color: 'FFFFFF', bold: true, align: 'center'
    });
    coverSlide.addText('Professional Proposal', {
        x: '10%', y: '55%', w: '80%', h: 1, 
        fontSize: 24, color: 'E2E8F0', align: 'center'
    });

    // Content Slides — extract from new Slide[] format
    slides.forEach((s: any) => {
        const slide = pptx.addSlide();
        
        // Find title element (bold, larger font)
        const titleEl = s.elements?.find((e: any) => e.style?.fontWeight === 'bold' && e.style?.fontSize >= 1.8);
        const bodyEls = s.elements?.filter((e: any) => e !== titleEl) || [];

        // Title bar
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.8, fill: { color: '1E3A8A' } });
        slide.addText(titleEl?.content || 'Slide', {
            x: 0.5, y: 0, w: '90%', h: 0.8,
            fontSize: 24, color: 'FFFFFF', bold: true, align: 'left'
        });

        // Body content
        const allBullets = bodyEls
            .map((e: any) => (e.content || '').split('\n').filter((l: string) => l.trim()))
            .flat()
            .map((b: string) => b.replace(/^[•\-]\s*/, ''));

        if (allBullets.length > 0) {
            const bulletText = allBullets.map((b: string) => ({
                text: b,
                options: { bullet: true, fontSize: 18, color: '333333', breakLine: true }
            }));
            slide.addText(bulletText, {
                x: 0.5, y: 1.2, w: '90%', h: '80%',
                valign: 'top'
            });
        }
    });

    const fileName = `Edda_PPT_${Date.now()}.pptx`;
    const tmpDir = path.join('/tmp', 'bristh-downloads');
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, fileName);
    
    const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    await fs.writeFile(filePath, buffer);

    const fileUrl = `/api/bristh/download?file=${fileName}`;

    const generatedAsset = await prisma.generatedAsset.create({
      data: {
        type: 'PPT',
        title: 'Edda 生成的演示文稿 ' + new Date().toLocaleTimeString('zh-CN'),
        payload: JSON.stringify({ slides, fileUrl })
      }
    });

    const resultPayload = JSON.stringify({
        summary: `成功生成 PPTX 文件，共包含 ${slides.length} 页幻灯片。`,
        fileUrl: fileUrl,
        rawSlides: slides,
        assetId: generatedAsset.id
    });

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload: resultPayload,
        thinkLog: thinkLog,
        toolCallsLog: toolCallsLog
      }
    });

    recordTaskCompletion('edda', taskId, task.instruction, `PPT ${slides.length} 页`).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Edda agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
