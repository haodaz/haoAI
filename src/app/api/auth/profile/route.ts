import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth-server';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

// GET: fetch current user's full profile
export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, username: true, role: true, displayName: true, phone: true, email: true, avatarUrl: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT: update profile fields
export async function PUT(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { displayName, phone, email, avatarUrl } = body;

    const user = await prisma.user.update({
      where: { id: session.id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: { id: true, username: true, role: true, displayName: true, phone: true, email: true, avatarUrl: true },
    });

    // Update session cookie with new displayName
    const newSession = await createSessionToken(user);

    const response = NextResponse.json({ success: true, user });
    response.cookies.set(SESSION_COOKIE, newSession, sessionCookieOptions);

    return response;
  } catch (err: any) {
    console.error('[auth/profile] Error:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

