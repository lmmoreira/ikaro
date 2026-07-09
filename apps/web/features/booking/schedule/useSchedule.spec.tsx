// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateClosure,
  useCreateOpening,
  useRemoveClosure,
  useRemoveOpening,
  useScheduleClosures,
  useScheduleOpenings,
  useWeekBookings,
} from './useSchedule';
import { SCHEDULE_BOOKING_STATUS_ALL } from '@/features/booking/model/booking-status';

const staffApi = vi.hoisted(() => ({
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 }),
}));

const scheduleApi = vi.hoisted(() => ({
  listClosures: vi.fn().mockResolvedValue({ items: [] }),
  listOpenings: vi.fn().mockResolvedValue({ items: [] }),
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 }),
}));

vi.mock('@/features/booking/api/schedule', () => ({
  listClosures: scheduleApi.listClosures,
  createClosure: vi.fn().mockResolvedValue({ id: 'c-1' }),
  removeClosure: vi.fn().mockResolvedValue(undefined),
  listOpenings: scheduleApi.listOpenings,
  createOpening: vi.fn().mockResolvedValue({ id: 'o-1' }),
  removeOpening: vi.fn().mockResolvedValue(undefined),
  listBookings: scheduleApi.listBookings,
}));

vi.mock('@/features/booking/api/staff', () => staffApi);

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useScheduleClosures', () => {
  it('is disabled when from/to are empty', () => {
    const { result } = renderHook(() => useScheduleClosures('', ''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches closures when dates are provided', async () => {
    const { result } = renderHook(() => useScheduleClosures('2026-07-01', '2026-07-31'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(0);
  });

  it('refetches when the range changes even with initial data', async () => {
    const initialData = { items: [] };
    const { rerender } = renderHook(({ from, to }) => useScheduleClosures(from, to, initialData), {
      wrapper,
      initialProps: { from: '2026-07-01', to: '2026-07-07' },
    });

    await waitFor(() => expect(scheduleApi.listClosures).toHaveBeenCalledTimes(1));

    rerender({ from: '2026-07-08', to: '2026-07-14' });

    await waitFor(() => expect(scheduleApi.listClosures).toHaveBeenCalledTimes(2));
  });
});

describe('useCreateClosure', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useCreateClosure(), { wrapper });
    act(() => result.current.mutate({ date: '2026-07-04', reason: 'HOLIDAY' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useRemoveClosure', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useRemoveClosure(), { wrapper });
    act(() => result.current.mutate('c-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useScheduleOpenings', () => {
  it('fetches openings when dates are provided', async () => {
    const { result } = renderHook(() => useScheduleOpenings('2026-07-01', '2026-07-31'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(0);
  });
});

describe('useCreateOpening', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useCreateOpening(), { wrapper });
    act(() => result.current.mutate({ date: '2026-07-05', startTime: '09:00', endTime: '17:00' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useRemoveOpening', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useRemoveOpening(), { wrapper });
    act(() => result.current.mutate('o-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useWeekBookings', () => {
  it('fetches bookings for the requested week', async () => {
    const { result } = renderHook(() => useWeekBookings('2026-07-01', '2026-07-31'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(0);
    expect(staffApi.listBookings).toHaveBeenCalledWith({
      status: SCHEDULE_BOOKING_STATUS_ALL,
      from: '2026-07-01',
      to: '2026-07-31',
      limit: 100,
    });
  });

  it('refetches when the range changes even with initial data', async () => {
    const initialData = { items: [], total: 0, page: 1, limit: 25 };
    const { rerender } = renderHook(({ from, to }) => useWeekBookings(from, to, initialData), {
      wrapper,
      initialProps: { from: '2026-07-01', to: '2026-07-07' },
    });

    await waitFor(() => expect(staffApi.listBookings).toHaveBeenCalledTimes(1));

    rerender({ from: '2026-07-08', to: '2026-07-14' });

    await waitFor(() => expect(staffApi.listBookings).toHaveBeenCalledTimes(2));
  });
});
