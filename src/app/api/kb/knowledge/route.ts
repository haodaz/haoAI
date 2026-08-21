import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get('parentId');

    const items = await prisma.knowledgeItem.findMany({
      where: {
        parentId: parentId === 'root' || !parentId ? null : parentId
      },
      orderBy: [
        { type: 'desc' }, // 'FOLDER' comes before 'FILE' alphabetically, wait: F is before F? No, FOLDER and FILE. O is after I. So 'FILE' is before 'FOLDER'. We should order by type 'desc' to put FOLDER first.
        { createdAt: 'desc' }
      ]
    });
    return NextResponse.json(items);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, content, category, audience, type, parentId, fileUrl, fileName, fileType, fileSize, author } = body;
    
    if (!title) {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    }

    const isFolder = type === 'FOLDER';

    if (!isFolder && !content && !fileUrl) {
      return NextResponse.json({ error: '文件内容或附件不能都为空' }, { status: 400 });
    }

    const newItem = await prisma.knowledgeItem.create({
      data: {
        title,
        content: isFolder ? null : content,
        category: category || '默认分类',
        audience: audience || '内部员工',
        type: isFolder ? 'FOLDER' : 'FILE',
        parentId: parentId === 'root' ? null : parentId,
        fileUrl,
        fileName,
        fileType,
        fileSize,
        author
      }
    });

    return NextResponse.json({ ok: true, data: newItem });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, parentId } = body;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const updated = await prisma.knowledgeItem.update({
      where: { id },
      data: { parentId }
    });
    return NextResponse.json({ ok: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // Note: If it's a folder with children, Prisma will throw a constraint error unless cascade is set.
    // That's acceptable for this simple implementation (prevents accidental deletion of non-empty folders).
    await prisma.knowledgeItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
