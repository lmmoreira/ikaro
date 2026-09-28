import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { listAllBookings, listBookings } from './booking.server';

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

describe('listAllBookings (server)', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('sends page (not offset) with the other filters unchanged on every request', async () => {
    vi.mocked(bffServerFetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ bookingId: 'b-1', status: 'APPROVED' }],
            total: 150,
            page: 1,
            limit: 100,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ bookingId: 'b-2', status: 'APPROVED' }],
            total: 150,
            page: 2,
            limit: 100,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const result = await listAllBookings('token-123', {
      status: 'APPROVED',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(bffServerFetch).toHaveBeenCalledTimes(2);
    expect(bffServerFetch).toHaveBeenNthCalledWith(
      1,
      'token-123',
      '/bookings?status=APPROVED&from=2026-07-01&to=2026-07-31&page=1&limit=100',
    );
    expect(bffServerFetch).toHaveBeenNthCalledWith(
      2,
      'token-123',
      '/bookings?status=APPROVED&from=2026-07-01&to=2026-07-31&page=2&limit=100',
    );
    expect(result.items).toHaveLength(2);
  });
});
