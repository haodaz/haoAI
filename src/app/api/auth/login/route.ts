import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ error: '用户名或密码不正确' }, { status: 401 });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: '用户名或密码不正确' }, { status: 401 });
    }

    const session = await createSessionToken(user);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
    });

    response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions);

    return response;
  } catch (err: any) {
    console.error('[auth/login] Error:', err);
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
