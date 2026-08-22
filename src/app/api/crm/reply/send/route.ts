import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import path from 'path';

import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { to, subject, text } = await req.json();

    if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
      return NextResponse.json({ error: 'Email credentials not configured in .env.local' }, { status: 500 });
    }

    // Fetch global signature from DB
    const sigMeta = await prisma.systemMeta.findUnique({
      where: { key: 'global_email_signature' }
    });
    
    const signatureHtml = sigMeta?.value ? `<br><br>${sigMeta.value}` : '<br><br><table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, sans-serif; max-width: 600px;">\n  <tr>\n    <td style="background-color: #16331E; padding: 20px;">\n      <img src="cid:bep_signature" alt="Bristh Enrollment Partners" style="height: 50px; display: block; max-width: 100%; margin-bottom: 8px;" />\n      <span style="color: #E2DFD8; font-size: 13px; font-style: italic;">Your always-on international enrolment office</span>\n    </td>\n  </tr>\n  <tr>\n    <td style="padding: 15px 0 0 0;">\n      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666;">\n        ✉️ partners@bristhnrolmentpartners.com &nbsp;|&nbsp; 📞 +44 7921 879 389\n      </p>\n      <p style="margin: 0 0 12px 0; font-size: 13px; color: #666666;">\n        🏢 106 Great Charles Street, Birmingham, B3 3HN\n      </p>\n    </td>\n  </tr>\n</table>';

    const mailAttachments: any[] = [];
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

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD,
      },
    });

    const htmlBody = text.replace(/\n/g, '<br/>') + signatureHtml;

    const info = await transporter.sendMail({
      from: `"Bristh Enrollment Partners" <${process.env.IMAP_USER}>`,
      to,
      subject,
      html: htmlBody,
      attachments: mailAttachments
    });

    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Email Send Error:', error);
    return NextResponse.json({ error: 'Failed to send email', details: String(error) }, { status: 500 });
  }
}
