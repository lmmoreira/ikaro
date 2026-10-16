// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useApproveRecurringSchedule,
  usePendingRecurringSchedules,
  useRecurringScheduleForStaff,
  useRecurringScheduleService,
  useRejectRecurringSchedule,
} from './useRecurringSchedules';

const mockListPending = vi.fn();
const mockGetSchedule = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockGetService = vi.fn();

vi.mock('@/features/booking/api/recurring-booking-schedules', () => ({
  listPendingRecurringSchedules: (...args: unknown[]) => mockListPending(...args),
  getRecurringSchedule: (...args: unknown[]) => mockGetSchedule(...args),
  approveRecurringScheduleAsStaff: (...args: unknown[]) => mockApprove(...args),
  rejectRecurringScheduleAsStaff: (...args: unknown[]) => mockReject(...args),
}));
vi.mock('@/features/booking/api/services', () => ({
  getService: (...args: unknown[]) => mockGetService(...args),
}));
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  function wrapper({ children }: { readonly children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { wrapper, invalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePendingRecurringSchedules', () => {
  it('returns the pending list', async () => {
    mockListPending.mockResolvedValue([{ id: 's-1' }]);
    const { wrapper } = setup();

    const { result } = renderHook(() => usePendingRecurringSchedules(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 's-1' }]);
  });
});

describe('useRecurringScheduleForStaff', () => {
  it('reads the schedule by id', async () => {
    mockGetSchedule.mockResolvedValue({ id: 's-1' });
    const { wrapper } = setup();

    const { result } = renderHook(() => useRecurringScheduleForStaff('s-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetSchedule).toHaveBeenCalledWith('s-1');
  });

  it('does not fetch without an id', () => {
    const { wrapper } = setup();

    renderHook(() => useRecurringScheduleForStaff(''), { wrapper });

    expect(mockGetSchedule).not.toHaveBeenCalled();
  });
});

describe('useRecurringScheduleService', () => {
  it('reads the service, and waits for its id', async () => {
    mockGetService.mockResolvedValue({ serviceId: 'svc-1', resourceRequirements: [] });
    const { wrapper } = setup();

    const waiting = renderHook(() => useRecurringScheduleService(undefined), { wrapper });
    expect(mockGetService).not.toHaveBeenCalled();
    expect(waiting.result.current.fetchStatus).toBe('idle');

    const { result } = renderHook(() => useRecurringScheduleService('svc-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetService).toHaveBeenCalledWith('svc-1');
  });
});

describe('useApproveRecurringSchedule', () => {
  it('approves without a body and refreshes the schedules, bookings and day grid', async () => {
    mockApprove.mockResolvedValue({ id: 's-1', status: 'ACTIVE', occurrenceCount: 12 });
    const { wrapper, invalidate } = setup();

    const { result } = renderHook(() => useApproveRecurringSchedule(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('s-1');
    });

    expect(mockApprove).toHaveBeenCalledWith('s-1');
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ['recurring-schedules', 't-1'],
        ['bookings', 't-1'],
        ['schedule', 'day-grid', 't-1'],
      ]),
    );
  });

  it('refreshes nothing when the approval is refused', async () => {
    mockApprove.mockRejectedValue(new Error('409'));
    const { wrapper, invalidate } = setup();

    const { result } = renderHook(() => useApproveRecurringSchedule(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('s-1').catch(() => undefined);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('useRejectRecurringSchedule', () => {
  it('rejects with only the id and refreshes the same caches', async () => {
    mockReject.mockResolvedValue({ id: 's-1', status: 'CANCELLED' });
    const { wrapper, invalidate } = setup();

    const { result } = renderHook(() => useRejectRecurringSchedule(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('s-1');
    });

    expect(mockReject).toHaveBeenCalledWith('s-1');
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});
