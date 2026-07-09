import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStaffMember, StaffDetailFetchError } from './api.server';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

vi.mock('@/shared/lib/api/bff-server', () => ({
  bffServerFetch: vi.fn(),
}));

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

    await expect(fetchStaffMember('token-123', 'staff-1')).rejects.toMatchObject(
      new StaffDetailFetchError(404, 'Staff not found'),
    );
  });
});
