// ============================================
// Signed session cookie
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload))
// Uses Web Crypto so the same code runs in middleware (Edge) and route handlers (Node).
// ============================================

import type { SessionUser, UserRole } from '@/lib/roles';

export const SESSION_COOKIE = 'autoffice_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (seconds)

/** Header used by trusted server-to-server calls (agents → toolbox, email daemon, etc.) */
export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  displayName?: string | null;
  exp: number; // unix seconds
}

const DEV_FALLBACK_SECRET = 'autoffice-dev-only-session-secret';

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is not set');
  }
  return DEV_FALLBACK_SECRET;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createSessionToken(user: {
  id: string;
  username: string;
  role: string;
  displayName?: string | null;
}): Promise<string> {
  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    role: user.role as UserRole,
    displayName: user.displayName,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

/** Returns the session user if the token is authentic and unexpired, otherwise null. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(), fromBase64Url(sig), encoder.encode(body));
    if (!valid) return null;
    const payload: SessionPayload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!payload.userId || !payload.username || !payload.role) return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      id: payload.userId,
      username: payload.username,
      role: payload.role,
      displayName: payload.displayName || payload.username,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
};

/** Constant-time check of the internal server-to-server secret. */
export function isValidInternalSecret(value: string | null | undefined): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected || !value || value.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
