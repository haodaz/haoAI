import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams } from '@/lib/model-registry';
import nodemailer from 'nodemailer';
import path from 'path';
import { marked } from 'marked';
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

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' }
    });

    const fallbackPersona = 'You are Grace, the Email Dispatch Specialist at Bristh Enrollment Partners. Compose and send professional emails with attachments.';
    
    const systemPrompt = await buildAgentPrompt('grace', task.instruction, task.context.rawContent, fallbackPersona, locale)
      + `\n\nExtract email details. Output ONLY a valid JSON object:
{
  "to": "recipient email. If none stated, use 'haoz214@gmail.com'",
  "cc": "CC email(s), comma-separated. Omit or empty string if not specified.",
  "subject": "Professional email subject",
  "htmlBody": "HTML formatted body. Professional, well-spaced, polite. Mention any attachments."
}`;

    const { client, config } = await getModelClient();
    const response = await client.chat.completions.create(
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }], { requireJson: true })
    );

    let rawJson = response.choices[0].message.content || '{}';
    rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedEmail = JSON.parse(rawJson);

    const siblingTasks = await prisma.task.findMany({
      where: { 
        contextId: task.contextId,
        id: { not: taskId },
        status: { in: ['COMPLETED', 'APPROVED'] }
      }
    });

    const mailAttachments: any[] = [];
    for (const sibling of siblingTasks) {
       if (!sibling.resultPayload) continue;
       
       if (sibling.agent === 'Edda') {
         try {
           const payload = JSON.parse(sibling.resultPayload);
           if (payload.fileUrl) {
              // Support both old /downloads/xxx.pptx and new /api/bristh/download?file=xxx.pptx
              let filePath: string;
              if (payload.fileUrl.includes('?file=')) {
                const fileName = new URL(payload.fileUrl, 'http://localhost').searchParams.get('file') || '';
                filePath = path.join('/tmp', 'bristh-downloads', fileName);
              } else {
                filePath = path.join(process.cwd(), 'public', payload.fileUrl);
              }
              mailAttachments.push({
                 filename: `${sibling.agent}_Presentation.pptx`,
                 path: filePath
              });
           }
         } catch(e) {}
       } else if (sibling.agent === 'Bob') {
         try {
           const payload = JSON.parse(sibling.resultPayload);
           if (payload.icsContent) {
              mailAttachments.push({
                 filename: 'Meeting_Invite.ics',
                 content: payload.icsContent
              });
           }
         } catch(e) {}
       } else {
         // Markdown agents: Alice, Eric, David, Fiona
         let mdContent = sibling.resultPayload;
         try {
           const parsed = JSON.parse(sibling.resultPayload);
           mdContent = parsed.content || mdContent;
         } catch(e) {}
         
         const htmlBody = marked(mdContent) as string;
         const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;color:#333}h1{font-size:20pt;font-weight:bold}h2{font-size:16pt;font-weight:bold}h3{font-size:14pt;font-weight:bold}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}</style></head><body>${htmlBody}</body></html>`;
         
         mailAttachments.push({
            filename: `${sibling.agent}_Document.doc`,
            content: wordHtml,
            contentType: 'application/msword'
         });
       }
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD,
      }
    });

    const toEmail = parsedEmail.to && parsedEmail.to.includes('@') ? parsedEmail.to : 'haoz214@gmail.com';

    // Fetch global signature from DB
    const sigMeta = await prisma.systemMeta.findUnique({
      where: { key: 'global_email_signature' }
    });
    
    const signatureHtml = sigMeta?.value ? `<br><br>${sigMeta.value}` : '<br><br><img src="cid:bep_signature" alt="Bristh Enrollment Partners" style="max-width: 250px;"/>';

    const cidRegex = /src="cid:([^"]+)"/g;
    let match;
    while ((match = cidRegex.exec(signatureHtml)) !== null) {
      const cid = match[1];
      if (cid === 'bep_signature') {
        mailAttachments.push({
          filename: 'BEP_logo.png',
          path: path.join(process.cwd(), 'public', 'images', 'BEP_logo.png'),
          cid: cid
        });
      } else if (cid.startsWith('icon_')) {
        const iconName = cid.replace('icon_', '') + '.png';
        mailAttachments.push({
          filename: iconName,
          path: path.join(process.cwd(), 'public', 'images', 'social', iconName),
          cid: cid
        });
      }
    }
    
    // Fallback if regex found nothing but it's the default
    if (mailAttachments.length === 0 && !sigMeta?.value) {
       mailAttachments.push({
         filename: 'BEP_logo.png',
         path: path.join(process.cwd(), 'public', 'images', 'BEP_logo.png'),
         cid: 'bep_signature'
       });
    }

    const finalHtmlBody = parsedEmail.htmlBody + signatureHtml;

    await transporter.sendMail({
      from: `"Bristh Enrollment Partners" <${process.env.IMAP_USER}>`,
      to: toEmail,
      cc: parsedEmail.cc || undefined,
      subject: parsedEmail.subject,
      html: finalHtmlBody,
      attachments: mailAttachments
    });

    const resultContent = `### 邮件发送成功 ✅\n\n**收件人**: ${toEmail}${parsedEmail.cc ? `\n**CC**: ${parsedEmail.cc}` : ''}\n**主题**: ${parsedEmail.subject}\n\n**正文内容预览**:\n${parsedEmail.htmlBody.replace(/<[^>]+>/g, '')}`;

    const resultPayload = JSON.stringify({
      summary: `📧 邮件已发送至 ${toEmail}：${parsedEmail.subject}`,
      content: resultContent
    });

    // 4. Save output payload and mark as COMPLETED
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: 'COMPLETED',
        resultPayload
      }
    });

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Grace agent error:', error);
    if (taskIdForError) {
      await prisma.task.update({
        where: { id: taskIdForError },
        data: { status: 'FAILED' }
      }).catch(console.error);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
