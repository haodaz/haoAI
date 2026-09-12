import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getModelClient, buildCompletionParams, trackableCompletion, getInternalBaseUrl } from '@/lib/model-registry';
import { TokenTracker } from '@/lib/token-tracker';
import nodemailer from 'nodemailer';
import path from 'path';
import { marked } from 'marked';
import { buildAgentPrompt } from '@/lib/bristh-config';

// Allow up to 300s for email drafting and attachment processing
export const maxDuration = 300;

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
    const tracker = new TokenTracker();
    const response = await trackableCompletion(
      tracker, 'grace_main', client, config,
      buildCompletionParams(config, [{ role: 'system', content: systemPrompt }], { requireJson: true })
    );

    let rawJson = response.choices[0].message.content || '{}';
    rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedEmail = JSON.parse(rawJson);

    // Check for failed sibling tasks
    const failedSiblings = await prisma.task.findMany({
      where: { contextId: task.contextId, id: { not: taskId }, status: 'FAILED' }
    });
    if (failedSiblings.length > 0) {
      const failedNames = failedSiblings.map((t: any) => t.agent).join(', ');
      console.warn(`[Grace] Warning: ${failedNames} failed. Proceeding with available results.`);
      // Add a note to the email body
      parsedEmail.htmlBody = (parsedEmail.htmlBody || '') + 
        `<br/><hr/><p style="color:#b91c1c;font-size:12px;">⚠️ Note: ${failedNames} task(s) failed and their outputs are not included.</p>`;
    }

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
              if (payload.fileUrl.startsWith('data:')) {
                // data: URI — extract base64 and attach as buffer
                const base64Match = payload.fileUrl.match(/base64,(.+)$/);
                if (base64Match) {
                  mailAttachments.push({
                    filename: `${payload.summary || 'BEP_Presentation'}.pptx`,
                    content: Buffer.from(base64Match[1], 'base64'),
                    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  });
                }
              } else if (payload.fileUrl.includes('?file=')) {
                const fileName = new URL(payload.fileUrl, 'http://localhost').searchParams.get('file') || '';
                const filePath = path.join('/tmp', 'bristh-downloads', fileName);
                mailAttachments.push({
                   filename: `${sibling.agent}_Presentation.pptx`,
                   path: filePath
                });
              } else {
                const filePath = path.join(process.cwd(), 'public', payload.fileUrl);
                mailAttachments.push({
                   filename: `${sibling.agent}_Presentation.pptx`,
                   path: filePath
                });
              }
           }
         } catch(e) { console.error('[Grace] Failed to process Edda attachment:', e); }
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
       } else if (sibling.agent === 'Fiona') {
         // Fiona: check if brochure (has toolboxUrl) or memo
         try {
           const payload = JSON.parse(sibling.resultPayload);
           if (payload.toolboxUrl) {
             // Brochure — add a note in email, not a Word doc
             const baseUrl = getInternalBaseUrl();
             parsedEmail.htmlBody = (parsedEmail.htmlBody || '') +
               `<br/><p><strong>📄 Marketing Brochure:</strong> <a href="${baseUrl}${payload.toolboxUrl}">Open in Brochure Designer</a></p>`;
           } else {
             // Regular memo — convert to Word
             const mdContent = payload.content || sibling.resultPayload;
             const htmlBody = marked(mdContent) as string;
             const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;color:#333}h1{font-size:20pt;font-weight:bold}h2{font-size:16pt;font-weight:bold}h3{font-size:14pt;font-weight:bold}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}</style></head><body>${htmlBody}</body></html>`;
             mailAttachments.push({ filename: `Fiona_Document.doc`, content: wordHtml });
           }
         } catch(e) {
           // Fallback: attach as Word
           const htmlBody = marked(sibling.resultPayload) as string;
           const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;color:#333}</style></head><body>${htmlBody}</body></html>`;
           mailAttachments.push({ filename: `Fiona_Document.doc`, content: wordHtml });
         }
       } else {
         // Markdown agents: Alice, Eric, David, etc.
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
    
    const signatureHtml = sigMeta?.value ? `<br><br>${sigMeta.value}` : '<br><br><table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, sans-serif; max-width: 600px;">\n  <tr>\n    <td style="background-color: #16331E; padding: 20px;">\n      <img src="cid:bep_signature" alt="Bristh Enrollment Partners" style="height: 50px; display: block; max-width: 100%; margin-bottom: 8px;" />\n      <span style="color: #E2DFD8; font-size: 13px; font-style: italic;">Your always-on international enrolment office</span>\n    </td>\n  </tr>\n  <tr>\n    <td style="padding: 15px 0 0 0;">\n      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666;">\n        ✉️ partners@bristhnrolmentpartners.com &nbsp;|&nbsp; 📞 +44 7921 879 389\n      </p>\n      <p style="margin: 0 0 12px 0; font-size: 13px; color: #666666;">\n        🏢 106 Great Charles Street, Birmingham, B3 3HN\n      </p>\n    </td>\n  </tr>\n</table>';

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

    const resultContent = `### Email Sent Successfully ✅\n\n**To**: ${toEmail}${parsedEmail.cc ? `\n**CC**: ${parsedEmail.cc}` : ''}\n**Subject**: ${parsedEmail.subject}\n\n**Body Preview**:\n${parsedEmail.htmlBody.replace(/<[^>]+>/g, '')}`;

    const resultPayload = JSON.stringify({
      summary: `📧 Email sent to ${toEmail}: ${parsedEmail.subject}`,
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

    await tracker.persist('agent', 'grace', taskId, task.context.id).catch(() => {});

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
