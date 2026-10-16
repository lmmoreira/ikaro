// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import {
  useApproveRecurringSchedule,
  useCreateRecurringScheduleAsStaff,
  usePendingRecurringSchedules,
  useRecurringScheduleForStaff,
  useRecurringScheduleService,
  useRejectRecurringSchedule,
} from './useRecurringSchedules';

const mockListPending = vi.fn();
const mockGetSchedule = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockCreateAsStaff = vi.fn();
const mockGetService = vi.fn();

vi.mock('@/features/booking/api/recurring-booking-schedules', () => ({
  listPendingRecurringSchedules: (...args: unknown[]) => mockListPending(...args),
  getRecurringSchedule: (...args: unknown[]) => mockGetSchedule(...args),
  approveRecurringScheduleAsStaff: (...args: unknown[]) => mockApprove(...args),
  rejectRecurringScheduleAsStaff: (...args: unknown[]) => mockReject(...args),
  createRecurringScheduleAsStaff: (...args: unknown[]) => mockCreateAsStaff(...args),
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

describe('useCreateRecurringScheduleAsStaff', () => {
  const BODY = {
    serviceId: 'svc-1',
    recurrence: {
      frequency: 'WEEKLY' as const,
      daysOfWeek: ['monday' as const],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-10-12',
    endsOn: '2026-11-09',
    customerId: 'cust-1',
  };

  it('posts the body and, once the schedule exists, refreshes the schedules, bookings and day grid by prefix', async () => {
    mockCreateAsStaff.mockResolvedValue({
      id: 's-1',
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
    });
    const { wrapper, invalidate } = setup();

    const { result } = renderHook(() => useCreateRecurringScheduleAsStaff(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync(BODY);
    });

    expect(mockCreateAsStaff).toHaveBeenCalledWith(BODY);
    expect(outcome).toEqual({
      kind: 'ACTIVE',
      schedule: { id: 's-1', status: 'ACTIVE', approvalHoldExpiresAt: null },
    });
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ['recurring-schedules', 't-1'],
        ['bookings', 't-1'],
        ['schedule', 'day-grid', 't-1'],
      ]),
    );
  });

  it('resolves every refusal as an outcome, never rejects, and refreshes nothing: nothing was created', async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useCreateRecurringScheduleAsStaff(), { wrapper });

    mockCreateAsStaff.mockRejectedValueOnce(
      new ApiError(409, 'x', {
        type: 't',
        title: 't',
        status: 409,
        code: BookingErrorCode.RECURRING_SCHEDULE_CAP_REACHED,
      }),
    );
    mockCreateAsStaff.mockRejectedValueOnce(
      new ApiError(404, 'x', {
        type: 't',
        title: 't',
        status: 404,
        code: BookingErrorCode.CUSTOMER_NOT_FOUND,
      }),
    );
    mockCreateAsStaff.mockRejectedValueOnce(new Error('network'));
    const outcomes: unknown[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        outcomes.push(await result.current.mutateAsync(BODY));
      });
    }

    expect(outcomes).toEqual([
      { kind: 'CAP_REACHED' },
      { kind: 'CUSTOMER_NOT_FOUND' },
      { kind: 'FAILURE' },
    ]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('treats a pending answer as a failure and refreshes nothing', async () => {
    mockCreateAsStaff.mockResolvedValue({
      id: 's-1',
      status: 'PENDING_APPROVAL',
      approvalHoldExpiresAt: '2026-10-13T10:00:00Z',
    });
    const { wrapper, invalidate } = setup();

    const { result } = renderHook(() => useCreateRecurringScheduleAsStaff(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync(BODY);
    });

    expect(outcome).toEqual({ kind: 'FAILURE' });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
