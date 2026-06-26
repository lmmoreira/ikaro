// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useActionNeededBookings,
  useBooking,
  useBookings,
  useTodayBookings,
  useUpcomingBookings,
} from './useBookings';

const mockListBookings = vi.fn();
const mockGetBooking = vi.fn();

vi.mock('@/lib/api/dashboard/bookings', () => ({
  listBookings: (...args: unknown[]) => mockListBookings(...args),
  getBooking: (...args: unknown[]) => mockGetBooking(...args),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
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

const emptyList = { items: [], total: 0, page: 1, limit: 25 };

describe('useActionNeededBookings', () => {
  it('returns initialData immediately without fetching', () => {
    const { result } = renderHook(
      () => useActionNeededBookings('2026-06-26', '2026-07-09', emptyList),
      { wrapper },
    );
    expect(result.current.data).toEqual(emptyList);
    expect(result.current.isSuccess).toBe(true);
  });

  it('fetches via proxy with PENDING,INFO_REQUESTED status and date range', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => emptyList });
    vi.stubGlobal('fetch', mockFetch);
    const { result } = renderHook(() => useActionNeededBookings('2026-06-26', '2026-07-09'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/bookings');
    expect(calledUrl).toContain('from=2026-06-26');
    expect(calledUrl).toContain('to=2026-07-09');
    vi.unstubAllGlobals();
  });
});

describe('useTodayBookings', () => {
  it('returns initialData immediately without fetching', () => {
    const { result } = renderHook(() => useTodayBookings('2026-06-26', emptyList), { wrapper });
    expect(result.current.data).toEqual(emptyList);
    expect(result.current.isSuccess).toBe(true);
  });

  it('fetches via proxy with date param when no initialData', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => emptyList });
    vi.stubGlobal('fetch', mockFetch);
    const { result } = renderHook(() => useTodayBookings('2026-06-26'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('date=2026-06-26'),
      expect.objectContaining({ cache: 'no-store' }),
    );
    vi.unstubAllGlobals();
  });
});

describe('useUpcomingBookings', () => {
  it('returns initialData immediately without fetching', () => {
    const { result } = renderHook(
      () => useUpcomingBookings('2026-06-27', '2026-07-09', emptyList),
      { wrapper },
    );
    expect(result.current.data).toEqual(emptyList);
    expect(result.current.isSuccess).toBe(true);
  });

  it('fetches via proxy with from and to params when no initialData', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => emptyList });
    vi.stubGlobal('fetch', mockFetch);
    const { result } = renderHook(() => useUpcomingBookings('2026-06-27', '2026-07-09'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('from=2026-06-27');
    expect(calledUrl).toContain('to=2026-07-09');
    vi.unstubAllGlobals();
  });
});
