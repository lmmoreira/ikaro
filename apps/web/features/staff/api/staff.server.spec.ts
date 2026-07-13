import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStaffList, fetchStaffMember, StaffDetailFetchError } from './staff.server';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

vi.mock('@/shared/lib/api/bff-server', () => ({
  bffServerFetch: vi.fn(),
}));

describe('fetchStaffList', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /staff with the auth token and returns the list', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], pagination: { hasMore: false } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchStaffList('token-123');

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/staff?limit=100&offset=0', {
      cache: 'no-store',
    });
    expect(result.items).toEqual([]);
  });

  it('throws on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchStaffList('token-123')).rejects.toThrow('Failed to fetch staff list (500)');
  });
});

describe('fetchStaffMember', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /staff/:id with the auth token and returns the staff member', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 'staff-1', email: 'ana@lavacar.com.br' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchStaffMember('token-123', 'staff-1');

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/staff/staff-1', {
      cache: 'no-store',
    });
    expect(result.id).toBe('staff-1');
  });

  it('throws StaffDetailFetchError on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 404 }));

    await expect(fetchStaffMember('token-123', 'staff-1')).rejects.toBeInstanceOf(
      StaffDetailFetchError,
    );
    await expect(fetchStaffMember('token-123', 'staff-1')).rejects.toMatchObject({ status: 404 });
  });

  it('parses code from the response body instead of discarding it', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'STAFF_NOT_FOUND' }), { status: 404 }),
    );

    await expect(fetchStaffMember('token-123', 'staff-1')).rejects.toMatchObject({
      status: 404,
      code: 'STAFF_NOT_FOUND',
    });
  });
});
