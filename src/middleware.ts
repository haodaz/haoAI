import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  INTERNAL_SECRET_HEADER,
  verifySessionToken,
  isValidInternalSecret,
} from '@/lib/session';

/** API routes reachable without a user session. */
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/chat/bep', // public BEP website assistant (/chat/bep)
];

function isPublic(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"
  if (pathname.startsWith('/api/cron/')) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return NextResponse.next();
  }

  // Trusted server-to-server calls (agents → toolbox, approval flow, email daemon)
  if (isValidInternalSecret(req.headers.get(INTERNAL_SECRET_HEADER))) return NextResponse.next();

  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (pathname.startsWith('/api/admin/') && user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
