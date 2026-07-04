// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAccessToken = vi.hoisted(() => vi.fn());
const getCustomerLoyaltyDetail = vi.hoisted(() => vi.fn());
const CustomerLoyaltyPage = vi.hoisted(() =>
  vi.fn(() => <div data-testid="customer-loyalty-page" />),
);
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
  }),
);

vi.mock('@/features/auth/get-access-token', () => ({
  getAccessToken,
}));

vi.mock('@/features/loyalty/dashboard-api.server', () => ({
  getCustomerLoyaltyDetail,
}));

vi.mock('@/features/loyalty/components/dashboard/CustomerLoyaltyPage', () => ({
  CustomerLoyaltyPage,
}));

vi.mock('next/navigation', () => ({
  notFound,
}));

import CustomerLoyaltyRoute from './page';

describe('CustomerLoyaltyRoute', () => {
  beforeEach(() => {
    vi.mocked(getAccessToken).mockReset();
    vi.mocked(getCustomerLoyaltyDetail).mockReset();
    vi.mocked(CustomerLoyaltyPage).mockReset();
    vi.mocked(notFound).mockReset();
  });

  it('renders the customer loyalty page with the detail payload', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('token-123');
    vi.mocked(getCustomerLoyaltyDetail).mockResolvedValue({
      ok: true,
      data: {
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
      },
    });

    const element = await CustomerLoyaltyRoute({
      params: Promise.resolve({ customerId: 'c-1' }),
      searchParams: Promise.resolve({ tab: 'redemptions' }),
    });

    render(element);

    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(getCustomerLoyaltyDetail).toHaveBeenCalledWith('token-123', 'c-1');
    expect(CustomerLoyaltyPage).toHaveBeenCalledWith(
      expect.objectContaining({
        initialActiveTab: 'redemptions',
        customer: expect.objectContaining({ customerId: 'c-1' }),
      }),
      undefined,
    );
    expect(screen.getByTestId('customer-loyalty-page')).toBeInTheDocument();
  });

  it('calls notFound when the BFF returns 404', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('token-123');
    vi.mocked(getCustomerLoyaltyDetail).mockResolvedValue({ ok: false, status: 404 });

    await expect(
      CustomerLoyaltyRoute({
        params: Promise.resolve({ customerId: 'c-1' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalledOnce();
  });
});
