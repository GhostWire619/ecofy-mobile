import { env } from '@/lib/constants/env';

/**
 * Resolve a possibly-relative media URL returned by the backend into an absolute
 * URL that React Native's <Image> can actually load.
 *
 * The backend serves uploads at `/uploads/...` and only emits absolute URLs when
 * PUBLIC_BASE_URL is configured; otherwise it returns root-relative paths
 * (e.g. "/uploads/chat/<user>/<file>.jpg"). <Image> cannot load a relative URI,
 * so we prefix those with the API origin. Device-local URIs (file://, content://,
 * ph://, asset://), data/blob URLs, and already-absolute http(s) URLs are returned
 * unchanged.
 */
export function toAbsoluteUrl(uri?: string | null): string | undefined {
  if (!uri) return undefined;
  const u = uri.trim();
  if (!u) return undefined;
  if (/^(https?:|data:|blob:|file:|content:|ph:|asset:)/i.test(u)) return u;
  if (u.startsWith('/')) return `${env.apiUrl}${u}`;
  if (/^uploads\//i.test(u)) return `${env.apiUrl}/${u}`;
  return u;
}
