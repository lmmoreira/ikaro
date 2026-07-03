interface BffServerFetchNextInit {
  readonly revalidate?: number | false;
  readonly tags?: string[];
}

interface BffServerFetchInit extends Omit<RequestInit, 'headers' | 'next'> {
  readonly headers?: Record<string, string>;
  readonly next?: BffServerFetchNextInit;
}

export async function bffServerFetch(
  token: string,
  path: string,
  init: BffServerFetchInit = {},
): Promise<Response> {
  const { headers: extraHeaders, cache, next, ...rest } = init;
  const hasRevalidate = next?.revalidate !== undefined;
  const requestInit: RequestInit & { next?: BffServerFetchNextInit } = {
    ...rest,
    headers: {
      Cookie: `access_token=${token}`,
      ...extraHeaders,
    },
  };

  if (!hasRevalidate) {
    requestInit.cache ??= cache ?? 'no-store';
  }

  if (next) {
    requestInit.next = next;
  }

  if (!requestInit.signal) {
    requestInit.signal = AbortSignal.timeout(8000);
  }

  return fetch(`${process.env.NEXT_PUBLIC_BFF_URL}${path}`, requestInit);
}
