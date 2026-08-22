require('dotenv').config({ path: '.env.local' });
const nodemailer = require('nodemailer');
const path = require('path');

async function test() {
  try {
    if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
      console.error('Email credentials not configured in .env.local');
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD,
      },
    });

    const htmlBody = "Hello!\n\nThis is a test email to verify the signature rendering.\n\nBest,\nYour AI Assistant".replace(/\n/g, '<br/>') + 
      '<br><br><img src="cid:bep_signature" alt="Bristh Enrollment Partners" style="max-width: 250px;"/>';

    console.log("Sending email...");
    const info = await transporter.sendMail({
      from: `"Bristh Enrollment Partners" <${process.env.IMAP_USER}>`,
      to: 'haoz214@gmail.com',
      subject: 'Test Email Signature Verification',
      html: htmlBody,
      attachments: [{
        filename: 'signature.png',
        path: path.join(process.cwd(), 'public', 'images', 'VI.png'),
        cid: 'bep_signature'
      }]
    });

    console.log('Success!', info.messageId);
  } catch(e) {
    console.error('Failed to send:', e);
  }
}
test();
