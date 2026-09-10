import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import { buildAgentPrompt } from '@/lib/bristh-config';
import PptxGenJS from 'pptxgenjs';
import path from 'path';
import fs from 'fs/promises';

/**
 * Copilot route v2 — handles all agents with JSON-structured payloads.
 * 
 * Edda: outputs Slide[] (element-level format), regenerates .pptx
 * Bob: outputs meeting JSON, regenerates .ics
 * Others: outputs updated Markdown content (wrapped in JSON)
 */

// Robust JSON extraction (same as in orchestrate)
function extractJSON(raw: string): any {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  throw new Error('Failed to parse Copilot JSON response');
}

// Convert Slide[] elements to legacy {title, bullets} for PptxGenJS
function slidesToLegacy(slides: any[]) {
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

export async function POST(req: Request) {
  try {
    const { taskId, message, locale } = await req.json();

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { context: true }
    });

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const history = task.copilotHistory ? JSON.parse(task.copilotHistory) : [];
    history.push({ role: 'user', content: message });

    // Build agent-specific prompt with persona
    const fallbackPersona = `You are ${task.agent}, a specialist AI at Bristh Enrollment Partners.`;
    const agentPrompt = await buildAgentPrompt(task.agent.toLowerCase(), task.instruction, task.context.rawContent, fallbackPersona, locale);

    let systemPrompt = `${agentPrompt}

You are now in Copilot mode. The user wants to refine your output.
Current output payload:
---
${task.resultPayload}
---
Read the user's feedback, reply directly, AND output the FULL updated content.

You MUST output valid JSON. `;

    if (task.agent === 'Edda') {
      systemPrompt += `Output format:
{
  "reply": "Your conversational reply explaining changes.",
  "slides": [
    {
      "backgroundColor": "#1E3A5F",
      "elements": [
        { "id": "unique_id", "type": "TEXT_BOX", "content": "text", "x": 5, "y": 8, "width": 90, "height": 20, "style": { "fontSize": 2.4, "fontWeight": "bold", "color": "#fff", "textAlign": "center" } }
      ]
    }
  ]
}
Use the Slide[] element-level format. Each slide has backgroundColor and elements with x,y,width,height as percentages.`;
    } else if (task.agent === 'Bob') {
      systemPrompt += `Output format:
{
  "reply": "Your conversational reply explaining changes.",
  "meeting": { "subject": "...", "start": [YYYY,MM,DD,HH,mm], "duration": 60, "description": "..." }
}`;
    } else {
      systemPrompt += `Output format:
{
  "reply": "Your conversational reply explaining changes.",
  "content": "The FULL revised Markdown content."
}`;
    }

    const { client, config } = await getModelClient();
    const tracker = new TokenTracker();
    const response = await trackableCompletion(
      tracker, 'copilot_refine', client, config,
      buildCompletionParams(config, [
        { role: 'system', content: systemPrompt },
        ...history.map((h: any) => ({ role: h.role, content: h.content }))
      ], { requireJson: true })
    );

    const rawResponse = response.choices[0].message.content || '{}';
    console.log('[Copilot] Raw AI response:', rawResponse.substring(0, 200));
    const result = extractJSON(rawResponse);
    
    history.push({ role: 'assistant', content: result.reply || 'Updated.' });

    let finalPayload = task.resultPayload;

    // === Edda: regenerate PPT with new Slide[] format ===
    if (task.agent === 'Edda' && result.slides) {
      const legacySlides = slidesToLegacy(result.slides);
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';

      legacySlides.forEach((s: any) => {
        const slide = pptx.addSlide();
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.8, fill: { color: '1E3A8A' } });
        slide.addText(s.title, { x: 0.5, y: 0, w: '90%', h: 0.8, fontSize: 24, color: 'FFFFFF', bold: true, align: 'left' });
        if (s.bullets?.length) {
          slide.addText(
            s.bullets.map((b: string) => ({ text: b, options: { bullet: true, fontSize: 18, color: '333333', breakLine: true } })),
            { x: 0.5, y: 1.2, w: '90%', h: '80%', valign: 'top' }
          );
        }
      });

      const fileName = `Edda_PPT_${Date.now()}.pptx`;
      const tmpDir = path.join('/tmp', 'bristh-downloads');
      await fs.mkdir(tmpDir, { recursive: true });
      const filePath = path.join(tmpDir, fileName);
      const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
      await fs.writeFile(filePath, buffer);

      finalPayload = JSON.stringify({
        summary: `已根据您的要求更新 PPT，共 ${result.slides.length} 页。`,
        fileUrl: `/api/bristh/download?file=${fileName}`,
        rawSlides: result.slides // Element-level format for WYSIWYG canvas
      });
    }
    // === Bob: regenerate ICS ===
    else if (task.agent === 'Bob' && result.meeting) {
      const ics = require('ics');
      const event = {
        start: result.meeting.start,
        duration: { minutes: result.meeting.duration || 60 },
        title: result.meeting.subject,
        description: result.meeting.description,
        status: 'CONFIRMED',
        busyStatus: 'BUSY',
      };
      const { value } = ics.createEvent(event);
      finalPayload = JSON.stringify({
        summary: `已更新会议：${result.meeting.subject}`,
        icsContent: value
      });
    }
    // === Markdown agents: wrap in JSON ===
    else if (result.content) {
      const summaryMatch = result.content.match(/^#+ (.+)/m);
      const summary = summaryMatch ? summaryMatch[1].slice(0, 80) : result.content.slice(0, 80).replace(/[#*]/g, '').trim();
      finalPayload = JSON.stringify({
        summary,
        content: result.content
      });
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        resultPayload: finalPayload,
        copilotHistory: JSON.stringify(history)
      }
    });

    await tracker.persist('copilot', task.agent.toLowerCase(), taskId, task.contextId).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask, reply: result.reply });
  } catch (error: any) {
    console.error('Copilot API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
