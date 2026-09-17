import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// Check admin session
async function requireAdmin(): Promise<{ ok: true } | Response> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('autoffice_session')?.value;
    if (!raw) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    return { ok: true };
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}

// GET: list all users (admin only)
export async function GET() {
  const check = await requireAdmin();
  if (check instanceof Response) return check;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      displayName: true,
      phone: true,
      email: true,
      createdAt: true,
      _count: { select: { taskContexts: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ users });
}

// POST: create a new user (admin only)
export async function POST(req: Request) {
  const check = await requireAdmin();
  if (check instanceof Response) return check;

  try {
    const { username, password, role, displayName, phone, email } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: '该用户名已存在' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: role || 'user',
        displayName: displayName || username,
        phone: phone || null,
        email: email || null,
      },
      select: { id: true, username: true, role: true, displayName: true, createdAt: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    console.error('[auth/users] Create error:', err);
    return NextResponse.json({ error: '创建失败' }, { status: 500 });
  }
}

// DELETE: delete a user (admin only)
export async function DELETE(req: Request) {
  const check = await requireAdmin();
  if (check instanceof Response) return check;

  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    // Prevent admin from deleting themselves
    const cookieStore = await cookies();
    const raw = cookieStore.get('autoffice_session')?.value;
    const session = JSON.parse(Buffer.from(raw!, 'base64').toString('utf-8'));
    if (session.userId === userId) {
      return NextResponse.json({ error: '不能删除自己的账号' }, { status: 400 });
    }

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[auth/users] Delete error:', err);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}

// PUT: update a user (admin only)
export async function PUT(req: Request) {
  const check = await requireAdmin();
  if (check instanceof Response) return check;

  try {
    const { userId, displayName, role, phone, email } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(role !== undefined && { role }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
      },
      select: { id: true, username: true, role: true, displayName: true, phone: true, email: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    console.error('[auth/users] Update error:', err);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
