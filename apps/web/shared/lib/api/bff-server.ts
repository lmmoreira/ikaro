interface BffServerFetchInit extends Omit<RequestInit, 'headers'> {
  readonly headers?: Record<string, string>;
  readonly next?: { readonly revalidate?: number | false; readonly tags?: string[] };
}

export async function bffServerFetch(
  token: string,
  path: string,
  init: BffServerFetchInit = {},
): Promise<Response> {
  const { headers: extraHeaders, cache, ...rest } = init;
  return fetch(`${process.env.NEXT_PUBLIC_BFF_URL}${path}`, {
    ...rest,
    headers: {
      Cookie: `access_token=${token}`,
      ...extraHeaders,
    },
    cache: cache ?? 'no-store',
  });
}
