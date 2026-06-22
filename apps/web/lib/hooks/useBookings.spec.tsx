// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBooking, useBookings } from './useBookings';

const mockListBookings = vi.fn();
const mockGetBooking = vi.fn();

vi.mock('@/lib/api/dashboard/bookings', () => ({
  listBookings: (...args: unknown[]) => mockListBookings(...args),
  getBooking: (...args: unknown[]) => mockGetBooking(...args),
}));

vi.mock('@/lib/api/bff-client', () => ({
  getTenantId: vi.fn().mockReturnValue('t-1'),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListBookings.mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 });
  mockGetBooking.mockResolvedValue({ bookingId: 'b-1', status: 'PENDING' });
});

describe('useBookings', () => {
  it('fetches and returns booking list', async () => {
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(0);
    expect(mockListBookings).toHaveBeenCalledOnce();
  });

  it('passes filters to listBookings', async () => {
    const { result } = renderHook(() => useBookings({ status: 'PENDING' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockListBookings).toHaveBeenCalledWith({ status: 'PENDING' });
  });
});

describe('useBooking', () => {
  it('is disabled when id is empty string', () => {
    const { result } = renderHook(() => useBooking(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches booking when id is provided', async () => {
    const { result } = renderHook(() => useBooking('b-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.bookingId).toBe('b-1');
    expect(mockGetBooking).toHaveBeenCalledWith('b-1');
  });
});
