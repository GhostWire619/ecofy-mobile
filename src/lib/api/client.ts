import * as SecureStore from 'expo-secure-store';

import type { AuthTokens, UserProfile } from '@/lib/domain/types';
import { env, secureStoreKeys } from '@/lib/constants/env';

type ApiRequestDebugEntry = {
  id: number;
  method: string;
  path: string;
  url: string;
  startedAt: string;
  finishedAt: string | null;
  status: number | null;
  outcome: 'started' | 'success' | 'error';
  message: string | null;
  payloadSummary: string | null;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: BodyInit | null;
  headers?: HeadersInit;
  auth?: boolean;
  expectedStatuses?: number[];
};

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DEBUG_ENTRIES = 10;
let requestDebugId = 0;
const requestDebugLog: ApiRequestDebugEntry[] = [];

function summarizePayload(payload: unknown) {
  if (payload == null) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable payload]';
  }
}

function beginApiDebugRequest(method: string, path: string, url: string) {
  const entry: ApiRequestDebugEntry = {
    id: ++requestDebugId,
    method,
    path,
    url,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: null,
    outcome: 'started',
    message: null,
    payloadSummary: null,
  };

  requestDebugLog.unshift(entry);
  requestDebugLog.splice(MAX_DEBUG_ENTRIES);

  if (__DEV__) {
    console.info(`[ecofy-api] ${method} ${url}`);
  }

  return entry;
}

function finishApiDebugRequest(
  entry: ApiRequestDebugEntry,
  input: {
    outcome: 'success' | 'error';
    status: number | null;
    message?: string | null;
    payload?: unknown;
  },
) {
  entry.finishedAt = new Date().toISOString();
  entry.status = input.status;
  entry.outcome = input.outcome;
  entry.message = input.message ?? null;
  entry.payloadSummary = summarizePayload(input.payload);

  if (__DEV__) {
    const suffix = input.message ? ` - ${input.message}` : '';
    const status = input.status == null ? 'network' : String(input.status);
    const logger = input.outcome === 'error' ? console.warn : console.info;
    logger(`[ecofy-api] ${entry.method} ${entry.url} -> ${status}${suffix}`);
  }
}

export function getApiDebugSnapshot() {
  return {
    apiUrl: env.apiUrl,
    requests: requestDebugLog.map((entry) => ({ ...entry })),
  };
}

async function readKey(key: string) {
  return SecureStore.getItemAsync(key);
}

async function writeKey(key: string, value: string) {
  return SecureStore.setItemAsync(key, value);
}

export async function getStoredTokens(): Promise<AuthTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    readKey(secureStoreKeys.accessToken),
    readKey(secureStoreKeys.refreshToken),
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

export async function persistTokens(tokens: AuthTokens) {
  await Promise.all([
    writeKey(secureStoreKeys.accessToken, tokens.accessToken),
    writeKey(secureStoreKeys.refreshToken, tokens.refreshToken),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(secureStoreKeys.accessToken),
    SecureStore.deleteItemAsync(secureStoreKeys.refreshToken),
    SecureStore.deleteItemAsync(secureStoreKeys.user),
  ]);
}

export async function persistStoredUser(user: UserProfile) {
  await writeKey(secureStoreKeys.user, JSON.stringify(user));
}

export async function getStoredUser() {
  const value = await readKey(secureStoreKeys.user);
  return value ? (JSON.parse(value) as UserProfile) : null;
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetchWithTimeout(`${env.apiUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_app: 'ecofy-mobile',
    }),
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(
        `Request timed out while reaching the Ecofy backend at ${env.apiUrl}. Check that the backend is running and reachable from this device.`,
        408,
        { url: input },
      );
    }

    if (error instanceof Error) {
      throw new ApiError(
        `Could not reach the Ecofy backend at ${env.apiUrl}. Check that the backend is running and that this device can reach your computer.`,
        0,
        { url: input, cause: error.message },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function performRequest<T>(path: string, options: RequestOptions, accessToken?: string | null) {
  const method = options.method ?? 'GET';
  const url = `${env.apiUrl}${path}`;
  const requestDebugEntry = beginApiDebugRequest(method, path, url);
  let response: Response;

  try {
    response = await fetchWithTimeout(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
      body: options.body,
    });
  } catch (error) {
    finishApiDebugRequest(requestDebugEntry, {
      outcome: 'error',
      status: error instanceof ApiError ? error.status : null,
      message: error instanceof Error ? error.message : 'Unknown request error',
    });
    throw error;
  }

  if (
    response.ok ||
    (options.expectedStatuses && options.expectedStatuses.includes(response.status))
  ) {
    finishApiDebugRequest(requestDebugEntry, {
      outcome: 'success',
      status: response.status,
    });

    if (response.status === 204) {
      return null as T;
    }

    return response.json() as Promise<T>;
  }

  const payload = await response.json().catch(() => null);
  const detail =
    typeof payload === 'string'
      ? payload
      : typeof payload?.detail === 'string'
        ? payload.detail
        : typeof payload?.error === 'string'
          ? payload.error
          : response.statusText;

  finishApiDebugRequest(requestDebugEntry, {
    outcome: 'error',
    status: response.status,
    message: detail || response.statusText,
    payload,
  });

  throw new ApiError(
    detail || `Request failed against ${env.apiUrl}`,
    response.status,
    payload,
  );
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  if (!options.auth) {
    return performRequest<T>(path, options, null);
  }

  const tokens = await getStoredTokens();
  const response = await performRequest<T>(path, options, tokens?.accessToken).catch(
    async (error) => {
      if (!(error instanceof ApiError) || error.status !== 401 || !tokens?.refreshToken) {
        throw error;
      }

      const refreshed = await refreshAccessToken(tokens.refreshToken);
      if (!refreshed?.access_token) {
        await clearTokens();
        throw error;
      }

      await persistTokens({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
      });

      if (refreshed.user) {
        await persistStoredUser(refreshed.user);
      }

      return performRequest<T>(path, options, refreshed.access_token);
    },
  );

  return response;
}
