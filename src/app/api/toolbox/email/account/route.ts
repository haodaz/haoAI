import { NextResponse } from 'next/server';

export async function GET() {
  const email = process.env.IMAP_USER || '';
  const configured = !!(process.env.IMAP_USER && process.env.IMAP_PASSWORD);

  return NextResponse.json({
    email,
    configured,
    provider: email.includes('gmail') ? 'Gmail' : email.includes('outlook') ? 'Outlook' : 'IMAP',
  });
}
