// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/lib/api/errors';
import { useCreateRecurringSchedule } from './useCreateRecurringSchedule';

const createRecurringScheduleAsCustomer = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/recurring-booking-schedules', () => ({
  createRecurringScheduleAsCustomer,
}));

const body = {
  serviceId: 'svc-1',
  recurrence: {
    frequency: 'WEEKLY' as const,
    daysOfWeek: ['monday' as const],
    startTime: '10:00',
    durationMinutes: 60,
  },
  assignmentPolicy: 'RESOLVE_PER_OCCURRENCE' as const,
  startsOn: '2026-10-12',
  endsOn: '2026-11-09',
};

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useCreateRecurringSchedule', () => {
  it('resolves a 201 to its outcome and sends the body it was given', async () => {
    createRecurringScheduleAsCustomer.mockResolvedValue({
      id: 's-1',
      status: 'PENDING_APPROVAL',
      approvalHoldExpiresAt: '2026-10-13T10:00:00Z',
    });
    const { result } = renderHook(() => useCreateRecurringSchedule(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync(body);
    });

    expect(createRecurringScheduleAsCustomer).toHaveBeenCalledWith(body);
    expect(outcome).toMatchObject({ kind: 'PENDING_APPROVAL' });
  });

  it('resolves a refusal to its outcome instead of rejecting, so the form keeps the pattern', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValue(
      new ApiError(409, 'x', { code: 'BOOKING_RECURRING_SCHEDULE_CAP_REACHED' }),
    );
    const { result } = renderHook(() => useCreateRecurringSchedule(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync(body);
    });

    expect(outcome).toEqual({ kind: 'CAP_REACHED' });
  });

  it('resolves a network failure to the generic failure', async () => {
    createRecurringScheduleAsCustomer.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useCreateRecurringSchedule(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync(body);
    });

    expect(outcome).toEqual({ kind: 'FAILURE' });
  });
});
