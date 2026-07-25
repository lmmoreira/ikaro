import { buildBffUrl } from './bff-url';
import { SESSION_COOKIE_NAME } from '@/features/auth/session-cookie';

interface BffServerFetchNextInit {
  readonly revalidate?: number | false;
  readonly tags?: string[];
}

interface BffServerFetchInit extends Omit<RequestInit, 'headers' | 'next'> {
  readonly headers?: Record<string, string>;
  readonly next?: BffServerFetchNextInit;
}

const DEFAULT_BFF_TIMEOUT_MS = 8_000;

function buildBffRequestInit(
  init: BffServerFetchInit,
): RequestInit & { next?: BffServerFetchNextInit } {
  const { cache, next, ...rest } = init;
  const requestInit: RequestInit & { next?: BffServerFetchNextInit } = { ...rest };

  if (next?.revalidate === undefined) {
    requestInit.cache ??= cache ?? 'no-store';
  }

  if (next) {
    requestInit.next = next;
  }

  requestInit.signal ??= AbortSignal.timeout(DEFAULT_BFF_TIMEOUT_MS);
  return requestInit;
}

export async function bffPublicFetch(
  path: string,
  init: BffServerFetchInit = {},
): Promise<Response> {
  return fetch(buildBffUrl(path), buildBffRequestInit(init));
}

export async function bffServerFetch(token: string, path: string, init: BffServerFetchInit = {}) {
  const { headers: extraHeaders, ...rest } = init;
  return bffPublicFetch(path, {
    ...rest,
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...extraHeaders,
    },
  });
}
