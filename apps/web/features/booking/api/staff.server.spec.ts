import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { listBookings } from './staff.server';

vi.mock('@/shared/lib/api/bff-server', () => ({
  bffServerFetch: vi.fn(),
}));

describe('listBookings (server)', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /bookings with serialized filters and returns the list', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await listBookings('token-123', { status: 'PENDING', limit: 10 });

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/bookings?status=PENDING&limit=10');
    expect(result.items).toEqual([]);
  });

  it('throws on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(listBookings('token-123')).rejects.toThrow('Failed to fetch bookings (500)');
  });
});
