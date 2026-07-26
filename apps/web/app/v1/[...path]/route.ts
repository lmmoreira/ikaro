import { NextRequest } from 'next/server';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const INTERNAL_IDENTITY_HEADERS = new Set([
  'x-actor-id',
  'x-actor-role',
  'x-actor-type',
  'x-internal-key',
  'x-jwt-actor-id',
  'x-platform-admin-key',
  'x-tenant-id',
]);

const BFF_GATEWAY_TIMEOUT_MS = 8_000;

function upstreamUrl(path: readonly string[], search: string): string {
  const baseUrl = process.env.BFF_UPSTREAM_URL;
  if (!baseUrl) throw new Error('BFF_UPSTREAM_URL is required for the /v1 gateway');
  return `${baseUrl.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}${search}`;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  for (const header of INTERNAL_IDENTITY_HEADERS) headers.delete(header);
  headers.delete('content-length');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;
  let upstream: Response;
  try {
    // This Route Handler is the centralized same-origin gateway. It deliberately
    // uses fetch directly to forward arbitrary requests, cookies, redirects, and
    // response headers; feature code must use the shared BFF transport helpers.
    upstream = await fetch(upstreamUrl(path, request.nextUrl.search), {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(BFF_GATEWAY_TIMEOUT_MS),
    });
  } catch {
    return Response.json({ message: 'Upstream unavailable' }, { status: 502 });
  }

  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
