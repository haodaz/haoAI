import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const interactions = await prisma.interaction.findMany({
      where: { type: 'EMAIL' },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    return NextResponse.json(interactions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
