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
  useScheduleDayGrid,
  useScheduleOpenings,
  useScheduleWeekDayGrid,
  useWeekBookings,
} from './useSchedule';
import { SCHEDULE_BOOKING_STATUS_ALL } from '@/features/booking/model/booking-status';

const bookingApi = vi.hoisted(() => ({
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 }),
}));

const scheduleApi = vi.hoisted(() => ({
  listClosures: vi.fn().mockResolvedValue({ items: [] }),
  listOpenings: vi.fn().mockResolvedValue({ items: [] }),
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 }),
  getScheduleDayGrid: vi.fn().mockResolvedValue({ date: '2026-08-17', columns: [] }),
}));

vi.mock('@/features/booking/api/schedule', () => ({
  listClosures: scheduleApi.listClosures,
  createClosure: vi.fn().mockResolvedValue({ id: 'c-1' }),
  removeClosure: vi.fn().mockResolvedValue(undefined),
  listOpenings: scheduleApi.listOpenings,
  createOpening: vi.fn().mockResolvedValue({ id: 'o-1' }),
  removeOpening: vi.fn().mockResolvedValue(undefined),
  listBookings: scheduleApi.listBookings,
  getScheduleDayGrid: scheduleApi.getScheduleDayGrid,
}));

vi.mock('@/features/booking/api/booking', () => bookingApi);

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
    expect(result.current.data).toBeUndefined();
    expect(scheduleApi.listClosures).not.toHaveBeenCalled();
  });

  it('fetches closures when dates are provided', async () => {
    const { result } = renderHook(() => useScheduleClosures('2026-07-01', '2026-07-31'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
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

  it('omits resourceId from the request when no resources are selected', async () => {
    renderHook(() => useScheduleClosures('2026-07-01', '2026-07-31'), { wrapper });
    await waitFor(() =>
      expect(scheduleApi.listClosures).toHaveBeenCalledWith('2026-07-01', '2026-07-31', undefined),
    );
  });

  it('passes resourceId through and refetches when the selection changes', async () => {
    const { rerender } = renderHook(
      ({ resourceIds }) => useScheduleClosures('2026-07-01', '2026-07-31', undefined, resourceIds),
      { wrapper, initialProps: { resourceIds: ['res-1'] } },
    );

    await waitFor(() =>
      expect(scheduleApi.listClosures).toHaveBeenCalledWith('2026-07-01', '2026-07-31', 'res-1'),
    );

    rerender({ resourceIds: ['res-2'] });

    await waitFor(() =>
      expect(scheduleApi.listClosures).toHaveBeenCalledWith('2026-07-01', '2026-07-31', 'res-2'),
    );
  });

  it('always fetches the tenant-wide scope alongside each selected resource and merges+de-duplicates the results', async () => {
    scheduleApi.listClosures.mockImplementation(
      (_from: string, _to: string, resourceId?: string) => {
        if (resourceId === 'res-1') {
          return Promise.resolve({ items: [{ id: 'res-1-only', resourceId: 'res-1' }] });
        }
        if (resourceId === 'res-2') {
          return Promise.resolve({ items: [{ id: 'res-2-only', resourceId: 'res-2' }] });
        }
        return Promise.resolve({ items: [{ id: 'tenant-wide-1', resourceId: null }] });
      },
    );

    const { result } = renderHook(
      () => useScheduleClosures('2026-07-01', '2026-07-31', undefined, ['res-1', 'res-2']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(scheduleApi.listClosures).toHaveBeenCalledWith('2026-07-01', '2026-07-31', undefined);
    expect(scheduleApi.listClosures).toHaveBeenCalledWith('2026-07-01', '2026-07-31', 'res-1');
    expect(scheduleApi.listClosures).toHaveBeenCalledWith('2026-07-01', '2026-07-31', 'res-2');
    expect(result.current.data?.items.map((item) => item.id).sort()).toEqual([
      'res-1-only',
      'res-2-only',
      'tenant-wide-1',
    ]);
  });

  it('surfaces isError/error when any scoped fetch fails, instead of silently resolving to no data', async () => {
    const fetchError = new Error('one resource request failed');
    scheduleApi.listClosures.mockImplementation(
      (_from: string, _to: string, resourceId?: string) =>
        resourceId === 'res-1'
          ? Promise.reject(fetchError)
          : Promise.resolve({ items: [{ id: 'tenant-wide-1', resourceId: null }] }),
    );

    const { result } = renderHook(
      () => useScheduleClosures('2026-07-01', '2026-07-31', undefined, ['res-1']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(fetchError);
    expect(result.current.data).toBeUndefined();
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
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.items).toHaveLength(0);
  });

  it('omits resourceId from the request when no resources are selected', async () => {
    renderHook(() => useScheduleOpenings('2026-07-01', '2026-07-31'), { wrapper });
    await waitFor(() =>
      expect(scheduleApi.listOpenings).toHaveBeenCalledWith('2026-07-01', '2026-07-31', undefined),
    );
  });

  it('passes resourceId through to the request', async () => {
    renderHook(() => useScheduleOpenings('2026-07-01', '2026-07-31', undefined, ['res-1']), {
      wrapper,
    });
    await waitFor(() =>
      expect(scheduleApi.listOpenings).toHaveBeenCalledWith('2026-07-01', '2026-07-31', 'res-1'),
    );
  });

  it('always fetches the tenant-wide scope alongside each selected resource and merges+de-duplicates the results', async () => {
    scheduleApi.listOpenings.mockImplementation(
      (_from: string, _to: string, resourceId?: string) => {
        if (resourceId === 'res-1') {
          return Promise.resolve({ items: [{ id: 'res-1-only', resourceId: 'res-1' }] });
        }
        if (resourceId === 'res-2') {
          return Promise.resolve({ items: [{ id: 'res-2-only', resourceId: 'res-2' }] });
        }
        return Promise.resolve({ items: [{ id: 'tenant-wide-1', resourceId: null }] });
      },
    );

    const { result } = renderHook(
      () => useScheduleOpenings('2026-07-01', '2026-07-31', undefined, ['res-1', 'res-2']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(scheduleApi.listOpenings).toHaveBeenCalledWith('2026-07-01', '2026-07-31', undefined);
    expect(result.current.data?.items.map((item) => item.id).sort()).toEqual([
      'res-1-only',
      'res-2-only',
      'tenant-wide-1',
    ]);
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
    expect(bookingApi.listBookings).toHaveBeenCalledWith({
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

    await waitFor(() => expect(bookingApi.listBookings).toHaveBeenCalledTimes(1));

    rerender({ from: '2026-07-08', to: '2026-07-14' });

    await waitFor(() => expect(bookingApi.listBookings).toHaveBeenCalledTimes(2));
  });
});

describe('useScheduleDayGrid', () => {
  it('is disabled when no resources are selected, even with a date', () => {
    const { result } = renderHook(() => useScheduleDayGrid('2026-08-17', []), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(scheduleApi.getScheduleDayGrid).not.toHaveBeenCalled();
  });

  it('is disabled when the date is empty, even with resources selected', () => {
    const { result } = renderHook(() => useScheduleDayGrid('', ['res-1']), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(scheduleApi.getScheduleDayGrid).not.toHaveBeenCalled();
  });

  it('fetches the day grid once a date and at least one resource are selected', async () => {
    const { result } = renderHook(() => useScheduleDayGrid('2026-08-17', ['res-1']), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(scheduleApi.getScheduleDayGrid).toHaveBeenCalledWith('2026-08-17');
    expect(result.current.data?.columns).toHaveLength(0);
  });

  it('refetches when the date changes, not when the resource selection changes', async () => {
    const { rerender } = renderHook(
      ({ date, resourceIds }) => useScheduleDayGrid(date, resourceIds),
      { wrapper, initialProps: { date: '2026-08-17', resourceIds: ['res-1'] } },
    );
    await waitFor(() => expect(scheduleApi.getScheduleDayGrid).toHaveBeenCalledTimes(1));

    // Same date, different resource selection — the query key doesn't include resourceIds (the
    // response doesn't vary by which are checked), so this must not trigger a second fetch.
    rerender({ date: '2026-08-17', resourceIds: ['res-1', 'res-2'] });
    await waitFor(() => expect(scheduleApi.getScheduleDayGrid).toHaveBeenCalledTimes(1));

    rerender({ date: '2026-08-18', resourceIds: ['res-1', 'res-2'] });
    await waitFor(() => expect(scheduleApi.getScheduleDayGrid).toHaveBeenCalledTimes(2));
  });
});

describe('useScheduleWeekDayGrid', () => {
  it('is disabled (no fetches) when no resources are selected, even with date keys', () => {
    const { result } = renderHook(() => useScheduleWeekDayGrid(['2026-08-17', '2026-08-18'], []), {
      wrapper,
    });
    expect(result.current.data).toBeUndefined();
    expect(scheduleApi.getScheduleDayGrid).not.toHaveBeenCalled();
  });

  it('fetches one day-grid per visible day once a resource is selected', async () => {
    const { result } = renderHook(
      () => useScheduleWeekDayGrid(['2026-08-17', '2026-08-18'], ['res-1']),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(scheduleApi.getScheduleDayGrid).toHaveBeenCalledTimes(2);
    expect(scheduleApi.getScheduleDayGrid).toHaveBeenCalledWith('2026-08-17');
    expect(scheduleApi.getScheduleDayGrid).toHaveBeenCalledWith('2026-08-18');
    expect(result.current.data).toHaveLength(2);
  });

  it('surfaces isError/error when any day fails, instead of silently resolving to no data', async () => {
    const fetchError = new Error('one day request failed');
    scheduleApi.getScheduleDayGrid.mockImplementation((date: string) =>
      date === '2026-08-18' ? Promise.reject(fetchError) : Promise.resolve({ date, columns: [] }),
    );

    const { result } = renderHook(
      () => useScheduleWeekDayGrid(['2026-08-17', '2026-08-18'], ['res-1']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(fetchError);
    expect(result.current.data).toBeUndefined();
  });

  it('shares its query key with useScheduleDayGrid for the same date, avoiding a duplicate fetch', async () => {
    function useBoth() {
      const day = useScheduleDayGrid('2026-08-17', ['res-1']);
      const week = useScheduleWeekDayGrid(['2026-08-17'], ['res-1']);
      return { day, week };
    }

    const { result } = renderHook(() => useBoth(), { wrapper });
    await waitFor(() => expect(result.current.week.data).toBeDefined());
    expect(scheduleApi.getScheduleDayGrid).toHaveBeenCalledTimes(1);
  });
});
