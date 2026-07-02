// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCustomerLoyaltyBalance,
  useCustomerLoyaltyEntries,
  useCustomerLoyaltyRedemptions,
  useLoyaltyBalance,
  useLoyaltyEntries,
  useLoyaltyRedemptions,
  useRedeemPoints,
} from './useLoyalty';

vi.mock('@/features/loyalty/api', () => ({
  getLoyaltyBalance: vi
    .fn()
    .mockResolvedValue({ currentPoints: 100, nextExpiryDate: null, nextExpiryPoints: null }),
  getLoyaltyEntries: vi
    .fn()
    .mockResolvedValue({ entries: [], pagination: { page: 1, limit: 20, total: 0 } }),
  getLoyaltyRedemptions: vi
    .fn()
    .mockResolvedValue({ redemptions: [], pagination: { page: 1, limit: 20, total: 0 } }),
  getCustomerLoyaltyBalance: vi
    .fn()
    .mockResolvedValue({ currentPoints: 100, nextExpiryDate: null, nextExpiryPoints: null }),
  getCustomerLoyaltyEntries: vi
    .fn()
    .mockResolvedValue({ entries: [], pagination: { page: 1, limit: 20, total: 0 } }),
  getCustomerLoyaltyRedemptions: vi
    .fn()
    .mockResolvedValue({ redemptions: [], pagination: { page: 1, limit: 20, total: 0 } }),
  redeemPoints: vi.fn().mockResolvedValue({
    redemptionId: 'r-1',
    customerId: 'c-1',
    pointsRedeemed: 50,
    newBalance: 50,
    redeemedAt: '',
  }),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useLoyaltyBalance', () => {
  it('fetches balance', async () => {
    const { result } = renderHook(() => useLoyaltyBalance(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.currentPoints).toBe(100);
  });
});

describe('useLoyaltyEntries', () => {
  it('fetches entries', async () => {
    const { result } = renderHook(() => useLoyaltyEntries(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.entries).toHaveLength(0);
  });
});

describe('useLoyaltyRedemptions', () => {
  it('fetches redemptions', async () => {
    const { result } = renderHook(() => useLoyaltyRedemptions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.redemptions).toHaveLength(0);
  });
});

describe('useCustomerLoyaltyBalance', () => {
  it('is disabled when customerId is empty', () => {
    const { result } = renderHook(() => useCustomerLoyaltyBalance(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches when customerId is provided', async () => {
    const { result } = renderHook(() => useCustomerLoyaltyBalance('c-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.currentPoints).toBe(100);
  });
});

describe('useCustomerLoyaltyEntries', () => {
  it('fetches when customerId is provided', async () => {
    const { result } = renderHook(() => useCustomerLoyaltyEntries('c-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useCustomerLoyaltyRedemptions', () => {
  it('fetches when customerId is provided', async () => {
    const { result } = renderHook(() => useCustomerLoyaltyRedemptions('c-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useRedeemPoints', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useRedeemPoints(), { wrapper });
    act(() => result.current.mutate({ customerId: 'c-1', pointsToRedeem: 50 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
