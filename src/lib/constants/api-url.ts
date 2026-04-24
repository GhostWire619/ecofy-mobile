export const DEFAULT_BACKEND_PORT = 8021;

function ensureScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

export function normalizeBaseUrl(value: string) {
  return ensureScheme(value.trim()).replace(/\/+$/, '');
}

export function extractHostFromUri(value?: string | null) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(ensureScheme(value.trim())).hostname || null;
  } catch {
    return null;
  }
}

export function resolveApiUrl(input: {
  explicitApiUrl?: string | null;
  hostUri?: string | null;
  platform: string;
}) {
  if (input.explicitApiUrl?.trim()) {
    return normalizeBaseUrl(input.explicitApiUrl);
  }

  const host = extractHostFromUri(input.hostUri);
  if (host) {
    return `http://${host}:${DEFAULT_BACKEND_PORT}`;
  }

  if (input.platform === 'android') {
    return `http://10.0.2.2:${DEFAULT_BACKEND_PORT}`;
  }

  return `http://127.0.0.1:${DEFAULT_BACKEND_PORT}`;
}
