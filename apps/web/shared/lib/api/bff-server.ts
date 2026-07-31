import { headers as nextHeaders } from 'next/headers';
import { attachBffAuthHeaders, resolveClientIp } from './bff-transport-headers';
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

async function buildBffRequestInit(
  init: BffServerFetchInit,
): Promise<RequestInit & { next?: BffServerFetchNextInit }> {
  const { cache, next, headers: extraHeaders, ...rest } = init;
  const requestInit: RequestInit & { next?: BffServerFetchNextInit } = { ...rest };

  if (next?.revalidate === undefined) {
    requestInit.cache ??= cache ?? 'no-store';
  }

  if (next) {
    requestInit.next = next;
  }

  requestInit.signal ??= AbortSignal.timeout(DEFAULT_BFF_TIMEOUT_MS);

  // TD38: this call bypasses the same-origin gateway (apps/web/app/v1/[...path]/route.ts)
  // entirely -- it hits BFF_UPSTREAM_URL directly -- so it needs the same trusted-IP
  // forwarding and BFF auth headers that gateway attaches, applied here instead. Collected
  // into a throwaway Headers instance (for convenient .set() calls) rather than merged
  // directly into `extraHeaders`, so the caller-supplied object's own key casing (e.g.
  // `Cookie`, `X-Tenant-Slug`) is preserved verbatim in the final plain object instead of
  // being flattened to lowercase by a round-trip through Headers.entries().
  const transportHeaders = new Headers();
  // Forward the real client IP from the original incoming request when one is available (SSR
  // page load, Route Handler); headers() throws outside a request-scoped context, in which
  // case X-Real-Client-Ip simply stays unset -- the same fallback BFF already has for a
  // header that's genuinely absent.
  try {
    const incoming = await nextHeaders();
    transportHeaders.set(
      'x-real-client-ip',
      resolveClientIp(Object.fromEntries(incoming.entries())),
    );
  } catch {
    // No request context available -- leave X-Real-Client-Ip unset.
  }
  await attachBffAuthHeaders(transportHeaders);

  requestInit.headers = {
    ...extraHeaders,
    ...Object.fromEntries(transportHeaders.entries()),
  };
  return requestInit;
}

export async function bffPublicFetch(
  path: string,
  init: BffServerFetchInit = {},
): Promise<Response> {
  return fetch(buildBffUrl(path), await buildBffRequestInit(init));
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
