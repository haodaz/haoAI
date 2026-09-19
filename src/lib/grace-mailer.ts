import prisma from '@/lib/prisma';
import nodemailer from 'nodemailer';
import path from 'path';
import { marked } from 'marked';
import { getInternalBaseUrl } from '@/lib/model-registry';

// ============================================
// Grace email dispatch
// Grace first writes a draft into task.resultPayload.draft; the email is only sent
// by sendGraceDraft(), which runs immediately for unapproved-by-design tasks or after
// a human approves the draft.
// ============================================

export interface GraceDraft {
  to: string;
  cc?: string;
  subject: string;
  htmlBody: string;
}

const WORD_STYLE = 'body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;color:#333}h1{font-size:20pt;font-weight:bold}h2{font-size:16pt;font-weight:bold}h3{font-size:14pt;font-weight:bold}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}';

function markdownToWordDoc(md: string): string {
  const htmlBody = marked(md) as string;
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>${WORD_STYLE}</style></head><body>${htmlBody}</body></html>`;
}

const DEFAULT_SIGNATURE = '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, sans-serif; max-width: 600px;">\n  <tr>\n    <td style="background-color: #16331E; padding: 20px;">\n      <img src="cid:bep_signature" alt="Bristh Enrollment Partners" style="height: 50px; display: block; max-width: 100%; margin-bottom: 8px;" />\n      <span style="color: #E2DFD8; font-size: 13px; font-style: italic;">Your always-on international enrolment office</span>\n    </td>\n  </tr>\n  <tr>\n    <td style="padding: 15px 0 0 0;">\n      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666;">\n        ✉️ partners@bristhnrolmentpartners.com &nbsp;|&nbsp; 📞 +44 7921 879 389\n      </p>\n      <p style="margin: 0 0 12px 0; font-size: 13px; color: #666666;">\n        🏢 106 Great Charles Street, Birmingham, B3 3HN\n      </p>\n    </td>\n  </tr>\n</table>';

/** Collect outputs of completed sibling tasks as mail attachments (and inline notes). */
async function collectSiblingAttachments(taskId: string, contextId: string) {
  const attachments: any[] = [];
  let extraHtml = '';

  const siblings = await prisma.task.findMany({
    where: { contextId, id: { not: taskId }, status: { in: ['COMPLETED', 'APPROVED'] } },
  });

  for (const sibling of siblings) {
    if (!sibling.resultPayload) continue;

    if (sibling.agent === 'Edda') {
      try {
        const payload = JSON.parse(sibling.resultPayload);
        if (!payload.fileUrl) continue;
        if (payload.fileUrl.startsWith('data:')) {
          const base64Match = payload.fileUrl.match(/base64,(.+)$/);
          if (base64Match) {
            attachments.push({
              filename: `${payload.summary || 'BEP_Presentation'}.pptx`,
              content: Buffer.from(base64Match[1], 'base64'),
              contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            });
          }
        } else if (payload.fileUrl.includes('?file=')) {
          const fileName = path.basename(new URL(payload.fileUrl, 'http://localhost').searchParams.get('file') || '');
          attachments.push({ filename: `${sibling.agent}_Presentation.pptx`, path: path.join('/tmp', 'bristh-downloads', fileName) });
        } else {
          attachments.push({ filename: `${sibling.agent}_Presentation.pptx`, path: path.join(process.cwd(), 'public', payload.fileUrl) });
        }
      } catch (e) { console.error('[Grace] Failed to process Edda attachment:', e); }
    } else if (sibling.agent === 'Bob') {
      try {
        const payload = JSON.parse(sibling.resultPayload);
        if (payload.icsContent) attachments.push({ filename: 'Meeting_Invite.ics', content: payload.icsContent });
      } catch {}
    } else {
      // Markdown agents (Alice, Eric, David, Fiona memo, ...) → Word doc; Fiona brochures → link
      let mdContent = sibling.resultPayload;
      try {
        const payload = JSON.parse(sibling.resultPayload);
        if (sibling.agent === 'Fiona' && payload.toolboxUrl) {
          extraHtml += `<br/><p><strong>📄 Marketing Brochure:</strong> <a href="${getInternalBaseUrl()}${payload.toolboxUrl}">Open in Brochure Designer</a></p>`;
          continue;
        }
        mdContent = payload.content || mdContent;
      } catch {}
      attachments.push({
        filename: `${sibling.agent}_Document.doc`,
        content: markdownToWordDoc(mdContent),
        contentType: 'application/msword',
      });
    }
  }

  return { attachments, extraHtml };
}

async function buildSignature(): Promise<{ html: string; attachments: any[] }> {
  const sigMeta = await prisma.systemMeta.findUnique({ where: { key: 'global_email_signature' } });
  const html = `<br><br>${sigMeta?.value || DEFAULT_SIGNATURE}`;
  const attachments: any[] = [];
  for (const [, cid] of html.matchAll(/src="cid:([^"]+)"/g)) {
    if (cid === 'bep_signature') {
      attachments.push({ filename: 'BEP_logo.png', path: path.join(process.cwd(), 'public', 'images', 'BEP_logo.png'), cid });
    } else if (cid.startsWith('icon_')) {
      const iconName = path.basename(cid.replace('icon_', '') + '.png');
      attachments.push({ filename: iconName, path: path.join(process.cwd(), 'public', 'images', 'social', iconName), cid });
    }
  }
  return { html, attachments };
}

/** Send the draft stored on a Grace task and mark the task COMPLETED. */
export async function sendGraceDraft(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task?.resultPayload) throw new Error('Grace task has no draft');
  const draft: GraceDraft | undefined = JSON.parse(task.resultPayload).draft;
  if (!draft?.to || !draft.subject) throw new Error('Grace task has no valid email draft');

  const { attachments, extraHtml } = await collectSiblingAttachments(taskId, task.contextId);
  const signature = await buildSignature();

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"Bristh Enrollment Partners" <${process.env.IMAP_USER}>`,
    to: draft.to,
    cc: draft.cc || undefined,
    subject: draft.subject,
    html: draft.htmlBody + extraHtml + signature.html,
    attachments: [...attachments, ...signature.attachments],
  });

  const content = `### Email Sent Successfully ✅\n\n**To**: ${draft.to}${draft.cc ? `\n**CC**: ${draft.cc}` : ''}\n**Subject**: ${draft.subject}\n\n**Body Preview**:\n${draft.htmlBody.replace(/<[^>]+>/g, '')}`;

  return prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'COMPLETED',
      resultPayload: JSON.stringify({ summary: `📧 Email sent to ${draft.to}: ${draft.subject}`, content, draft, sentAt: new Date().toISOString() }),
    },
  });
}

export function isGraceTask(task: { agent: string }) {
  return task.agent.toLowerCase() === 'grace';
}
