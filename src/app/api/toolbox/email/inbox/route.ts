import { NextResponse } from 'next/server';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

export const maxDuration = 60;

const IMAP_CONFIG = {
  imap: {
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASSWORD || '',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 30000,
    tlsOptions: { rejectUnauthorized: false }
  }
};

export async function GET() {
  if (!IMAP_CONFIG.imap.user || !IMAP_CONFIG.imap.password) {
    return NextResponse.json({ error: 'IMAP credentials not configured' }, { status: 500 });
  }

  let connection;
  try {
    connection = await imaps.connect(IMAP_CONFIG);
    await connection.openBox('INBOX');

    // Fetch last 20 emails, read-only (do NOT mark as seen)
    const searchCriteria = ['ALL'];
    const fetchOptions = { bodies: ['HEADER', ''], markSeen: false };

    const results = await connection.search(searchCriteria, fetchOptions);
    // Sort by UID descending and take latest 20
    const sorted = results.sort((a, b) => b.attributes.uid - a.attributes.uid).slice(0, 20);

    const emails = [];
    for (const item of sorted) {
      try {
        const all = item.parts.find((part) => part.which === '');
        if (!all) continue;
        const parsed = await simpleParser(all.body);

        emails.push({
          uid: item.attributes.uid,
          from: parsed.from?.text || 'Unknown',
          fromAddress: parsed.from?.value?.[0]?.address || '',
          to: parsed.to?.text || '',
          subject: parsed.subject || '(No Subject)',
          date: parsed.date?.toISOString() || new Date().toISOString(),
          snippet: (parsed.text || '').slice(0, 200).replace(/\n/g, ' ').trim(),
          body: parsed.text || '',
          htmlBody: parsed.html || '',
          hasAttachments: (parsed.attachments || []).length > 0,
        });
      } catch {
        // Skip unparseable emails
      }
    }

    connection.end();
    return NextResponse.json(emails);
  } catch (error) {
    if (connection) connection.end();
    console.error('IMAP Inbox Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch inbox', details: String(error) }, { status: 500 });
  }
}
