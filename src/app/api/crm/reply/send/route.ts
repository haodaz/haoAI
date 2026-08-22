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
    
    const signatureHtml = sigMeta?.value ? `<br><br>${sigMeta.value}` : '<br><br><img src="cid:bep_signature" alt="Bristh Enrollment Partners" style="max-width: 250px;"/>';

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
