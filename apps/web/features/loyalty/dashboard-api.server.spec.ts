import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { getCustomerLoyaltyDetail } from './dashboard-api.server';

vi.mock('@/shared/lib/api/bff-server', () => ({
  bffServerFetch: vi.fn(),
}));

describe('getCustomerLoyaltyDetail', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /customers/:id/loyalty with the auth token and returns the detail payload', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          customer: {
            customerId: 'c-1',
            email: 'customer@example.com',
            name: 'Customer One',
            phone: null,
            defaultAddress: null,
          },
          balance: {
            currentPoints: 100,
            nextExpiryDate: null,
            nextExpiryPoints: null,
            conversionRate: 10,
          },
          entries: { items: [], total: 0, page: 1, limit: 20 },
          redemptions: { items: [], total: 0, page: 1, limit: 20 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const res = await getCustomerLoyaltyDetail('token-123', 'c-1');

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/customers/c-1/loyalty');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.customer.customerId).toBe('c-1');
      expect(res.data.balance.currentPoints).toBe(100);
    }
  });

  it('returns the response status when the BFF route fails', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 404 }));

    const res = await getCustomerLoyaltyDetail('token-123', 'c-1');

    expect(res).toEqual({ ok: false, status: 404 });
  });
});
