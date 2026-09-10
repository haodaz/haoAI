import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import * as ics from 'ics';
import { buildAgentPrompt } from '@/lib/bristh-config';


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

    const fallbackPersona = 'You are Bob, the Scheduling Assistant at Bristh Enrollment Partners. Extract meeting details from context and generate calendar events.';
    
    const systemPrompt = await buildAgentPrompt('bob', task.instruction, task.context.rawContent, fallbackPersona, locale)
      + `\n\nExtract the meeting details. Output ONLY a valid JSON object:
{
  "subject": "A short, professional title for the meeting",
  "start": [YYYY, MM, DD, HH, mm],
  "duration": 60,
  "description": "Brief agenda or purpose"
}
If no exact date/time is mentioned, make a logical guess (Assume current year is 2026).`;

    const { client, config } = await getModelClient();
    const tracker = new TokenTracker();
    const response = await trackableCompletion(
      tracker, 'bob_main', client, config,
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }], { requireJson: true })
    );

    let rawJson = response.choices[0].message.content || '{}';
    rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedEvent = JSON.parse(rawJson);

    if (!parsedEvent.start) {
        throw new Error("Failed to parse start time from AI.");
    }

    // 3. Generate .ics string
    const event: ics.EventAttributes = {
      start: parsedEvent.start as ics.DateArray,
      duration: { minutes: parsedEvent.duration || 60 },
      title: parsedEvent.subject,
      description: parsedEvent.description,
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      organizer: { name: 'Bristh Agent (Bob)', email: 'bob@bristh.com' }
    };

    const { error, value } = ics.createEvent(event);
    if (error) {
        throw error;
    }

    const resultPayload = JSON.stringify({
        summary: `已提取会议意图并生成 ICS 文件：\n**主题**: ${parsedEvent.subject}\n**时间**: ${parsedEvent.start.join('/')}`,
        icsContent: value
    });

    // 4. Save output payload and mark as COMPLETED
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: task.requiresApproval ? 'AWAITING_APPROVAL' : 'COMPLETED',
        resultPayload: resultPayload
      }
    });

    await tracker.persist('agent', 'bob', taskId, task.context.id).catch(() => {});

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Bob agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
