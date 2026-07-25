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

function upstreamUrl(path: readonly string[], search: string): string {
  const baseUrl = process.env.BFF_UPSTREAM_URL;
  if (!baseUrl) throw new Error('BFF_UPSTREAM_URL is required for the /v1 gateway');
  return `${baseUrl.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}${search}`;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  headers.delete('content-length');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const upstream = await fetch(upstreamUrl(path, request.nextUrl.search), {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
