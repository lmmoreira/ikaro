// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBookingOpenExceptions } from './useBookingOpenExceptions';

const mockForBooking = vi.fn();
const tenant = vi.hoisted(() => ({
  value: { tenantId: 't-1', tenantSlug: 'lavacar', role: 'MANAGER' as 'MANAGER' | 'STAFF' },
}));

vi.mock('@/features/booking/api/scheduling-exceptions', () => ({
  listOpenSchedulingExceptionsForBooking: (bookingId: string) => mockForBooking(bookingId),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => tenant.value,
}));

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { readonly children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenant.value = { tenantId: 't-1', tenantSlug: 'lavacar', role: 'MANAGER' };
  mockForBooking.mockResolvedValue({ items: [] });
});

describe('useBookingOpenExceptions (M23-S46)', () => {
  it('fetches one booking’s open entries once, under a key inside the worklist prefix', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useBookingOpenExceptions('b-1'), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockForBooking).toHaveBeenCalledTimes(1);
    expect(mockForBooking).toHaveBeenCalledWith('b-1');
    // Under ['scheduling-exceptions', tenantId], so every resolve, deactivation and reactivation
    // that refreshes the worklist refreshes this read too.
    expect(client.getQueryData(['scheduling-exceptions', 't-1', 'booking', 'b-1'])).toEqual({
      items: [],
    });
  });

  // Negative guarantee: the BFF route is manager-only, so a STAFF user must never fire the request.
  it('never fires the request for a STAFF user', async () => {
    tenant.value = { tenantId: 't-1', tenantSlug: 'lavacar', role: 'STAFF' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBookingOpenExceptions('b-1'), {
      wrapper: wrapperFor(client),
    });

    await Promise.resolve();
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockForBooking).not.toHaveBeenCalled();
  });
});
