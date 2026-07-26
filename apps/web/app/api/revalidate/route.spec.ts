import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { revalidatePath, revalidateTag } from 'next/cache';
import { GET } from './route';

const mockRevalidatePath = vi.mocked(revalidatePath);
const mockRevalidateTag = vi.mocked(revalidateTag);

const VALID_SECRET = 'test-revalidate-secret';

function makeRequest(slug?: string, secret?: string): NextRequest {
  const url = new URL('http://localhost/api/revalidate');
  if (slug) url.searchParams.set('slug', slug);
  return new NextRequest(url, secret ? { headers: { 'x-revalidate-secret': secret } } : {});
}

describe('GET /api/revalidate', () => {
  beforeEach(() => {
    process.env.HOTSITE_REVALIDATE_SECRET = VALID_SECRET;
    mockRevalidatePath.mockReset();
    mockRevalidateTag.mockReset();
  });

  it('returns 401 when the revalidate secret header is missing', async () => {
    const response = await GET(makeRequest('tenant-a'));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/missing/i);
  });

  it('returns 401 when the revalidate secret header is wrong', async () => {
    const response = await GET(makeRequest('tenant-a', 'wrong-secret'));

    expect(response.status).toBe(401);
  });

  it('returns 400 when the slug query param is missing', async () => {
    const response = await GET(makeRequest(undefined, VALID_SECRET));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/slug/i);
  });

  it('calls revalidatePath and revalidateTag and returns revalidated:true for a valid request', async () => {
    const response = await GET(makeRequest('tenant-a', VALID_SECRET));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { revalidated: boolean; slug: string };
    expect(body.revalidated).toBe(true);
    expect(body.slug).toBe('tenant-a');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/tenant-a', 'page');
    expect(mockRevalidateTag).toHaveBeenCalledWith('hotsite-manifest-tenant-a', { expire: 0 });
  });

  it('does not call revalidatePath or revalidateTag when authentication fails', async () => {
    await GET(makeRequest('tenant-a', 'bad-secret'));

    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});
