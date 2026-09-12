import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import nodemailer from 'nodemailer';
import { getInternalBaseUrl } from '@/lib/model-registry';
import { marked } from 'marked';
import path from 'path';
import crypto from 'crypto';

/**
 * POST /api/bristh/notify
 * Send an approval notification email to the user with all pending tasks and their attachments.
 * 
 * Body: { contextId: string }
 * 
 * The email includes:
 * - A summary of all tasks awaiting approval
 * - Each task numbered (#1, #2, etc.) for easy reply reference
 * - Attachments (documents, PPTs, etc.) from each task's resultPayload
 * - Instructions for how to reply (approve or request changes)
 */
export async function POST(req: Request) {
  try {
    const { contextId } = await req.json();

    if (!contextId) {
      return NextResponse.json({ error: 'Missing contextId' }, { status: 400 });
    }

    // Load context with tasks and user
    const context = await prisma.taskContext.findUnique({
      where: { id: contextId },
      include: {
        tasks: true,
        user: true,
      }
    });

    if (!context) {
      return NextResponse.json({ error: 'TaskContext not found' }, { status: 404 });
    }

    // Get tasks awaiting approval
    const awaitingTasks = context.tasks.filter(t => t.status === 'AWAITING_APPROVAL');
    if (awaitingTasks.length === 0) {
      return NextResponse.json({ message: 'No tasks awaiting approval' });
    }

    // Determine recipient email
    const userEmail = context.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'User has no email bound. Cannot send notification.' }, { status: 400 });
    }

    const userName = context.user?.displayName || context.user?.username || 'User';

    // Build task summary sections and collect attachments
    const mailAttachments: any[] = [];
    const taskSections: string[] = [];

    awaitingTasks.forEach((task, index) => {
      const num = index + 1;
      let summary = '';
      let content = '';

      if (task.resultPayload) {
        try {
          const parsed = JSON.parse(task.resultPayload);
          summary = parsed.summary || '';
          content = parsed.content || task.resultPayload;
        } catch {
          content = task.resultPayload;
        }

        // Collect attachments based on agent type
        if (task.agent === 'Edda') {
          try {
            const payload = JSON.parse(task.resultPayload);
            if (payload.fileUrl) {
              let filePath: string;
              if (payload.fileUrl.includes('?file=')) {
                const fileName = new URL(payload.fileUrl, 'http://localhost').searchParams.get('file') || '';
                filePath = path.join('/tmp', 'bristh-downloads', fileName);
              } else {
                filePath = path.join(process.cwd(), 'public', payload.fileUrl);
              }
              mailAttachments.push({
                filename: `#${num}_${task.agent}_Presentation.pptx`,
                path: filePath,
              });
            }
          } catch {}
        } else if (task.agent === 'Bob') {
          try {
            const payload = JSON.parse(task.resultPayload);
            if (payload.icsContent) {
              mailAttachments.push({
                filename: `#${num}_${task.agent}_Calendar.ics`,
                content: payload.icsContent,
              });
            }
          } catch {}
        } else {
          // Markdown agents: Alice, Eric, David, Fiona, Grace
          let mdContent = task.resultPayload;
          try {
            const parsed = JSON.parse(task.resultPayload);
            mdContent = parsed.content || mdContent;
          } catch {}

          const htmlBody = marked(mdContent) as string;
          const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;color:#333}h1{font-size:20pt;font-weight:bold}h2{font-size:16pt;font-weight:bold}h3{font-size:14pt;font-weight:bold}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}</style></head><body>${htmlBody}</body></html>`;

          mailAttachments.push({
            filename: `#${num}_${task.agent}_Document.doc`,
            content: wordHtml,
            contentType: 'application/msword',
          });
        }
      }

      // Preview: first 150 chars of the content
      const preview = (summary || content || '').replace(/<[^>]+>/g, '').substring(0, 150);

      taskSections.push(`
        <tr>
          <td style="padding:16px; border-bottom: 1px solid #eee;">
            <div style="display:flex; align-items:center; margin-bottom:8px;">
              <span style="background:#3b82f6; color:white; border-radius:50%; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; margin-right:10px;">${num}</span>
              <strong style="font-size:15px; color:#1f2937;">${task.agent}</strong>
            </div>
            <p style="color:#6b7280; font-size:13px; margin:4px 0 0 38px; line-height:1.5;">
              <em>指令：</em>${task.instruction.substring(0, 100)}${task.instruction.length > 100 ? '...' : ''}
            </p>
            ${preview ? `<p style="color:#374151; font-size:13px; margin:8px 0 0 38px; line-height:1.5; background:#f9fafb; padding:8px 12px; border-radius:8px; border-left:3px solid #3b82f6;">${preview}...</p>` : ''}
            ${mailAttachments.filter(a => a.filename.startsWith(`#${num}`)).length > 0
              ? `<p style="color:#9ca3af; font-size:11px; margin:6px 0 0 38px;">📎 附件已附在邮件中</p>`
              : ''
            }
          </td>
        </tr>
      `);
    });

    // Generate a unique Message-ID for reply tracking
    const messageId = `<approval-${contextId}-${crypto.randomUUID().substring(0, 8)}@bristh.autoffice>`;

    // Build the full HTML email
    const htmlEmail = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:640px; margin:0 auto; background:white;">
      <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color:white; margin:0; font-size:20px; font-weight:800;">📋 任务审批通知</h1>
        <p style="color:rgba(255,255,255,0.85); margin:6px 0 0; font-size:13px;">有 ${awaitingTasks.length} 项任务需要您的确认</p>
      </div>

      <div style="padding: 24px 32px; border: 1px solid #e5e7eb; border-top:none; border-radius: 0 0 12px 12px;">
        <p style="color:#374151; font-size:14px; line-height:1.6;">
          您好 <strong>${userName}</strong>，
        </p>
        <p style="color:#6b7280; font-size:13px; line-height:1.6;">
          以下 AI 任务已完成初稿，等待您的审批确认。请查看各项产物后回复本邮件：
        </p>

        <table style="width:100%; border-collapse:collapse; margin:16px 0;">
          ${taskSections.join('')}
        </table>

        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:16px 20px; margin:20px 0;">
          <p style="color:#0369a1; font-size:13px; font-weight:bold; margin:0 0 8px;">📋 操作指引</p>
          <ul style="color:#374151; font-size:12px; line-height:1.8; margin:0; padding-left:20px;">
            <li><strong>确认某项</strong>：回复 <code style="background:#e0f2fe; padding:1px 4px; border-radius:3px;">#1 确认</code> 或 <code style="background:#e0f2fe; padding:1px 4px; border-radius:3px;">#1 OK</code></li>
            <li><strong>修改某项</strong>：回复 <code style="background:#e0f2fe; padding:1px 4px; border-radius:3px;">#2 请将第二段的数据改为...</code></li>
            <li><strong>全部确认</strong>：回复 <code style="background:#e0f2fe; padding:1px 4px; border-radius:3px;">全部确认</code></li>
          </ul>
        </div>

        <p style="color:#9ca3af; font-size:11px; margin-top:20px; text-align:center;">
          也可以<a href="${getInternalBaseUrl()}/office" style="color:#3b82f6;">登入系统</a>在线查看和审批
        </p>
      </div>
    </div>`;

    // Send the email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD,
      }
    });

    await transporter.sendMail({
      from: `"Bristh Autoffice" <${process.env.IMAP_USER}>`,
      to: userEmail,
      subject: `[Autoffice] ${awaitingTasks.length} 项任务需要您的审批确认`,
      html: htmlEmail,
      messageId,
      attachments: mailAttachments,
    });

    // Save the Message-ID for reply tracking
    await prisma.taskContext.update({
      where: { id: contextId },
      data: {
        approvalEmailId: messageId,
        pipelineStatus: 'AWAITING_APPROVAL',
      }
    });

    console.log(`[Notify] Approval email sent to ${userEmail} for context ${contextId}, Message-ID: ${messageId}`);

    return NextResponse.json({
      success: true,
      emailSentTo: userEmail,
      messageId,
      tasksNotified: awaitingTasks.length,
    });

  } catch (error: any) {
    console.error('Notify error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
