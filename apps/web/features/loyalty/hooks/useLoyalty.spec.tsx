// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedeemPoints } from './useLoyalty';

vi.mock('@/features/loyalty/api', () => ({
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

describe('useRedeemPoints', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useRedeemPoints(), { wrapper });
    act(() => result.current.mutate({ customerId: 'c-1', pointsToRedeem: 50 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
