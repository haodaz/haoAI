import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const meta = await prisma.systemMeta.findUnique({
      where: { key: 'global_email_signature' }
    });
    return NextResponse.json({ signature: meta?.value || null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { html } = await req.json();
    
    await prisma.systemMeta.upsert({
      where: { key: 'global_email_signature' },
      update: { value: html },
      create: { key: 'global_email_signature', value: html }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
