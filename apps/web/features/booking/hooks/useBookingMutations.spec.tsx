// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveBooking } from '@/features/booking/api/staff';
import {
  useApproveBooking,
  useCancelBooking,
  useCompleteBooking,
  useCreateAuthenticatedBooking,
  useRejectBooking,
  useRequestMoreInfo,
  useRescheduleBooking,
  useSubmitBookingInfo,
} from './useBookingMutations';

vi.mock('@/features/booking/api/staff', () => ({
  approveBooking: vi
    .fn()
    .mockResolvedValue({ bookingId: 'b-1', status: 'APPROVED', approvedAt: '' }),
  rejectBooking: vi
    .fn()
    .mockResolvedValue({ bookingId: 'b-1', status: 'REJECTED', rejectedAt: '' }),
  cancelBooking: vi.fn().mockResolvedValue({ bookingId: 'b-1', status: 'CANCELLED' }),
  rescheduleBooking: vi
    .fn()
    .mockResolvedValue({ bookingId: 'b-1', status: 'APPROVED', scheduledAt: '' }),
  completeBooking: vi.fn().mockResolvedValue({
    bookingId: 'b-1',
    status: 'COMPLETED',
    completedAt: '',
    totalActualPrice: { amount: 100, currency: 'BRL' },
  }),
  requestMoreInfo: vi
    .fn()
    .mockResolvedValue({ bookingId: 'b-1', status: 'INFO_REQUESTED', infoRequestedAt: '' }),
  submitBookingInfo: vi
    .fn()
    .mockResolvedValue({ bookingId: 'b-1', status: 'PENDING', infoSubmittedAt: '' }),
  createAuthenticatedBooking: vi.fn().mockResolvedValue({ bookingId: 'b-new', status: 'PENDING' }),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useApproveBooking', () => {
  it('calls approveBooking on mutate', async () => {
    const { result } = renderHook(() => useApproveBooking(), { wrapper });
    act(() => result.current.mutate({ id: 'b-1' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(approveBooking)).toHaveBeenCalledWith('b-1', undefined);
  });

  it('forwards an optional scheduledAt body', async () => {
    const { result } = renderHook(() => useApproveBooking(), { wrapper });
    act(() =>
      result.current.mutate({
        id: 'b-1',
        body: { scheduledAt: '2026-07-01T10:00:00.000Z' },
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(approveBooking)).toHaveBeenCalledWith('b-1', {
      scheduledAt: '2026-07-01T10:00:00.000Z',
    });
  });
});

describe('useRejectBooking', () => {
  it('calls rejectBooking on mutate', async () => {
    const { result } = renderHook(() => useRejectBooking(), { wrapper });
    act(() => result.current.mutate({ id: 'b-1', body: { reason: 'No slot' } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useCancelBooking', () => {
  it('calls cancelBooking on mutate', async () => {
    const { result } = renderHook(() => useCancelBooking(), { wrapper });
    act(() => result.current.mutate({ id: 'b-1' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useRescheduleBooking', () => {
  it('calls rescheduleBooking on mutate', async () => {
    const { result } = renderHook(() => useRescheduleBooking(), { wrapper });
    act(() => result.current.mutate({ id: 'b-1', body: { scheduledAt: '2026-07-01T09:00:00Z' } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useCompleteBooking', () => {
  it('calls completeBooking on mutate', async () => {
    const { result } = renderHook(() => useCompleteBooking(), { wrapper });
    act(() =>
      result.current.mutate({
        id: 'b-1',
        body: { lines: [{ lineId: 'l-1', actualPriceCharged: 100 }] },
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useRequestMoreInfo', () => {
  it('calls requestMoreInfo on mutate', async () => {
    const { result } = renderHook(() => useRequestMoreInfo(), { wrapper });
    act(() => result.current.mutate({ id: 'b-1', body: { message: 'Send photo' } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useSubmitBookingInfo', () => {
  it('calls submitBookingInfo on mutate', async () => {
    const { result } = renderHook(() => useSubmitBookingInfo(), { wrapper });
    act(() => result.current.mutate({ id: 'b-1', body: { response: 'Here it is' } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useCreateAuthenticatedBooking', () => {
  it('calls createAuthenticatedBooking on mutate', async () => {
    const { result } = renderHook(() => useCreateAuthenticatedBooking(), { wrapper });
    act(() =>
      result.current.mutate({ scheduledAt: '2026-07-01T09:00:00Z', serviceIds: ['svc-1'] }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
