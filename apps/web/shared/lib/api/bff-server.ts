interface BffServerFetchInit extends Omit<RequestInit, 'headers'> {
  readonly headers?: Record<string, string>;
  readonly next?: { readonly revalidate?: number | false; readonly tags?: string[] };
}

export async function bffServerFetch(
  token: string,
  path: string,
  init: BffServerFetchInit = {},
): Promise<Response> {
  const { headers: extraHeaders, cache, next, ...rest } = init;
  const requestInit: RequestInit & { next?: BffServerFetchInit['next'] } = {
    ...rest,
    headers: {
      Cookie: `access_token=${token}`,
      ...extraHeaders,
    },
  };

  if (cache) {
    requestInit.cache = cache;
  } else if (next?.revalidate === undefined) {
    requestInit.cache = 'no-store';
  }

  if (next) {
    requestInit.next = next;
  }

  return fetch(`${process.env.NEXT_PUBLIC_BFF_URL}${path}`, requestInit);
}
