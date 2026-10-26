import ky, { HTTPError, type Options } from 'ky';
import type { AuthResultDto, ErrorCode } from '@lc/shared';

export interface ApiErrorDetails {
  fields?: Record<string, string>;
  [k: string]: unknown;
}

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  details?: ApiErrorDetails;

  constructor(init: {
    code: ErrorCode;
    status: number;
    message: string;
    details?: ApiErrorDetails;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
  }
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  [k: string]: unknown;
}

// ---- token store -----------------------------------------------------------

let accessToken: string | null = null;
const listeners = new Set<(t: string | null) => void>();
const emit = () => listeners.forEach((cb) => cb(accessToken));

export const tokenStore = {
  get: () => accessToken,
  set(t: string) {
    accessToken = t;
    emit();
  },
  clear() {
    accessToken = null;
    emit();
  },
  /** Subscribe to token changes; returns an unsubscribe function. */
  onChange(cb: (t: string | null) => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};

let onAuthFailure: () => void = () => undefined;
export function setOnAuthFailure(cb: () => void) {
  onAuthFailure = cb;
}

// ---- low-level request -------------------------------------------------------

const NETWORK_MESSAGE = 'Không thể kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.';
const UNKNOWN_MESSAGE = 'Có lỗi xảy ra phía hệ thống. Vui lòng thử lại sau ít phút.';

const baseUrl = () => `${globalThis.location?.origin ?? ''}/api/v1`;
const clean = (p: string) => p.replace(/^\/+/, '');

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: ErrorCode; message?: string; details?: ApiErrorDetails };
    };
    if (body?.error?.code) {
      return new ApiError({
        code: body.error.code,
        status: res.status,
        message: body.error.message ?? UNKNOWN_MESSAGE,
        details: body.error.details,
      });
    }
  } catch {
    /* non-JSON body */
  }
  return new ApiError({ code: 'INTERNAL', status: res.status, message: UNKNOWN_MESSAGE });
}

async function send(path: string, options: Options, token: string | null): Promise<Response> {
  const headers: Record<string, string | undefined> = {
    ...(options.headers as Record<string, string | undefined> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  try {
    return await ky(`${baseUrl()}/${clean(path)}`, {
      credentials: 'include',
      retry: 0,
      timeout: 30_000,
      throwHttpErrors: false,
      ...options,
      headers,
    });
  } catch (e) {
    if (e instanceof HTTPError) return e.response;
    throw new ApiError({ code: 'INTERNAL', status: 0, message: NETWORK_MESSAGE });
  }
}

// ---- refresh (single-flight) -------------------------------------------------

let refreshing: Promise<AuthResultDto> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share one
 * in-flight request. A rejected refresh (4xx) clears the token and fires onAuthFailure once.
 */
export function refreshSession(): Promise<AuthResultDto> {
  refreshing ??= (async () => {
    try {
      const res = await send('auth/refresh', { method: 'POST' }, null);
      if (!res.ok) throw await toApiError(res);
      const body = (await res.json()) as { data: AuthResultDto };
      tokenStore.set(body.data.accessToken);
      return body.data;
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        tokenStore.clear();
        onAuthFailure();
      }
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

const NO_REFRESH = /^(auth\/login|auth\/refresh)$/;

async function request(path: string, options: Options): Promise<Response> {
  const usedToken = tokenStore.get();
  const res = await send(path, options, usedToken);
  if (res.ok) return res;

  const original = await toApiError(res);
  if (res.status !== 401 || NO_REFRESH.test(clean(path))) throw original;

  // Another request may already have refreshed while this one was in flight.
  const current = tokenStore.get();
  let token: string | null;
  if (current && current !== usedToken) {
    token = current;
  } else {
    try {
      token = (await refreshSession()).accessToken;
    } catch {
      throw original;
    }
  }
  const retry = await send(path, options, token);
  if (retry.ok) return retry;
  throw await toApiError(retry);
}

// ---- unwrapped helpers ---------------------------------------------------------

type Params = Record<string, string | number | boolean | undefined | null>;

const searchParamsOf = (p?: Params) =>
  p
    ? (Object.fromEntries(
        Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      ) as Record<string, string | number | boolean>)
    : undefined;

async function data<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  return ((await res.json()) as { data: T }).data;
}

export const api = { request };

export async function apiGet<T>(path: string, searchParams?: Params): Promise<T> {
  return data<T>(
    await request(path, { method: 'GET', searchParams: searchParamsOf(searchParams) }),
  );
}

export async function apiGetPage<T>(
  path: string,
  searchParams?: Params,
): Promise<{ data: T[]; meta: PageMeta }> {
  const res = await request(path, { method: 'GET', searchParams: searchParamsOf(searchParams) });
  return (await res.json()) as { data: T[]; meta: PageMeta };
}

const withBody = (method: string, body?: unknown): Options => ({
  method,
  ...(body === undefined ? {} : { json: body }),
});

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return data<T>(await request(path, withBody('POST', body)));
}
export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return data<T>(await request(path, withBody('PATCH', body)));
}
export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return data<T>(await request(path, withBody('PUT', body)));
}
export async function apiDelete<T = void>(path: string): Promise<T> {
  return data<T>(await request(path, { method: 'DELETE' }));
}
