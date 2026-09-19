import { getInternalBaseUrl } from '@/lib/model-registry';
import { INTERNAL_SECRET_HEADER } from '@/lib/session';

/**
 * fetch() for server-to-server calls to this app's own API (e.g. agent → toolbox).
 * These requests carry no user cookie, so they authenticate with INTERNAL_API_SECRET.
 */
export function internalFetch(apiPath: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set(INTERNAL_SECRET_HEADER, process.env.INTERNAL_API_SECRET || '');
  return fetch(`${getInternalBaseUrl()}${apiPath}`, { ...init, headers });
}
