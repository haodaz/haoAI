import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type');
  const limit = searchParams.get('limit');

  try {
    if (id) {
      const asset = await prisma.generatedAsset.findUnique({ where: { id } });
      if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      return NextResponse.json(asset);
    }

    const whereClause: any = {};
    if (type) whereClause.type = type.toUpperCase();

    const assets = await prisma.generatedAsset.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit) : undefined,
    });

    return NextResponse.json(assets);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
