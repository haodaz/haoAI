import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';
import path from 'path';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { to, cc, subject, htmlBody, requestAttachments = [] } = await req.json();

    if (!to || !subject || !htmlBody) {
      return NextResponse.json({ error: 'Missing required fields: to, subject, htmlBody' }, { status: 400 });
    }

    if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
      return NextResponse.json({ error: 'Email credentials not configured' }, { status: 500 });
    }

    const fullHtml = htmlBody;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD,
      }
    });

    // Prepare attachments for embedded images (signature logo)
    const attachments: any[] = [];
    if (fullHtml.includes('cid:bep_signature')) {
      const logoPath = path.join(process.cwd(), 'public', 'images', 'BEP_logo.png');
      attachments.push({
        filename: 'BEP_logo.png',
        path: logoPath,
        cid: 'bep_signature',
      });
    }

    // Add user uploaded attachments
    for (const att of requestAttachments) {
      // att: { filename, content: 'base64 string...', contentType }
      attachments.push({
        filename: att.filename,
        content: att.content,
        encoding: 'base64',
        contentType: att.contentType
      });
    }

    const mailOptions: any = {
      from: `"Bristh Enrollment Partners" <${process.env.IMAP_USER}>`,
      to,
      subject,
      html: fullHtml,
      attachments,
    };

    if (cc) {
      mailOptions.cc = cc;
    }

    const info = await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      to,
      subject,
    });
  } catch (error: any) {
    console.error('[Email Send] Error:', error);
    return NextResponse.json({ error: 'Failed to send email', details: error.message }, { status: 500 });
  }
}
