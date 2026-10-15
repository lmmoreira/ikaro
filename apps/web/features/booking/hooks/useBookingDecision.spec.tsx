// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulingExceptionItem, StaffBookingDetailResponse } from '@ikaro/types';
import { useBookingDecision } from './useBookingDecision';

const mockForBooking = vi.fn();
const mockResolve = vi.fn();
const mockGetBooking = vi.fn();
const tenant = vi.hoisted(() => ({
  value: { tenantId: 't-1', tenantSlug: 'lavacar', role: 'MANAGER' as 'MANAGER' | 'STAFF' },
}));

vi.mock('@/features/booking/api/scheduling-exceptions', () => ({
  listOpenSchedulingExceptionsForBooking: (bookingId: string) => mockForBooking(bookingId),
  resolveSchedulingExceptions: (body: unknown) => mockResolve(body),
}));
vi.mock('@/features/booking/api/booking', () => ({
  getBooking: (id: string) => mockGetBooking(id),
}));
vi.mock('@/providers/tenant-provider', () => ({ useTenant: () => tenant.value }));
vi.mock('@/shared/lib/i18n/use-resolved-locale', () => ({ useResolvedLocale: () => 'pt-BR' }));

function entry(id: string, resourceName = 'Sala 1'): SchedulingExceptionItem {
  return {
    id,
    sourceType: 'RESOURCE_DEACTIVATION',
    sourceId: `res-${id}`,
    affectedType: 'BOOKING',
    affectedId: 'b-1',
    status: 'OPEN',
    alternatives: [{ resourceId: 'alt-1', resourceName: 'Sala 2' }],
    createdAt: '2026-10-15T10:00:00.000Z',
    booking: {
      contactName: 'Ana',
      scheduledAt: '2026-10-20T10:00:00.000Z',
      totalDurationMins: 60,
      serviceNames: ['Sessão'],
      status: 'APPROVED',
      resourceName,
      isCustomer: true,
      totalPrice: { amount: 100, currency: 'BRL' },
    },
  };
}

const freshBooking = { bookingId: 'b-1', status: 'APPROVED' } as StaffBookingDetailResponse;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onBookingRefreshed = vi.fn();
  const wrapper = ({ children }: { readonly children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(() => useBookingDecision({ bookingId: 'b-1', onBookingRefreshed }), {
    wrapper,
  });
  return { ...hook, onBookingRefreshed };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenant.value = { tenantId: 't-1', tenantSlug: 'lavacar', role: 'MANAGER' };
  mockForBooking.mockResolvedValue({ items: [entry('e1')] });
  mockGetBooking.mockResolvedValue(freshBooking);
  mockResolve.mockResolvedValue({ results: [{ exceptionId: 'e1', outcome: 'RESOLVED' }] });
});

describe('useBookingDecision (M23-S46)', () => {
  it('loads the booking’s open entries', async () => {
    const { result } = setup();

    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    expect(mockForBooking).toHaveBeenCalledWith('b-1');
    expect(result.current.isLoading).toBe(false);
  });

  it('after a resolved reassign, closes the sheet and hands back the booking as the server has it', async () => {
    const { result, onBookingRefreshed } = setup();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => result.current.openSheet('reassign', ['e1']));
    await act(async () => {
      await result.current.submitReassign({ target: { mode: 'AUTO' } });
    });

    expect(mockResolve).toHaveBeenCalledWith({
      exceptionIds: ['e1'],
      resolutionType: 'REASSIGN',
      target: { mode: 'AUTO' },
    });
    expect(mockGetBooking).toHaveBeenCalledWith('b-1');
    expect(onBookingRefreshed).toHaveBeenCalledWith(freshBooking);
    expect(result.current.sheet).toBeNull();
  });

  it('sends every entry id in one CANCEL request and treats a later "still open" as settled once something resolved', async () => {
    mockForBooking.mockResolvedValue({ items: [entry('e1'), entry('e2', 'Projetor 1')] });
    mockResolve.mockResolvedValue({
      results: [
        { exceptionId: 'e1', outcome: 'RESOLVED' },
        { exceptionId: 'e2', outcome: 'STILL_OPEN', errorCode: 'BOOKING_INVALID_TRANSITION' },
      ],
    });
    const { result, onBookingRefreshed } = setup();
    await waitFor(() => expect(result.current.entries).toHaveLength(2));

    act(() => result.current.openSheet('cancel', ['e1', 'e2']));
    await act(async () => {
      await result.current.submitCancel({ reason: 'resource gone' });
    });

    expect(mockResolve).toHaveBeenCalledWith({
      exceptionIds: ['e1', 'e2'],
      resolutionType: 'CANCEL',
      reason: 'resource gone',
    });
    expect(onBookingRefreshed).toHaveBeenCalledWith(freshBooking);
    expect(result.current.sheet).toBeNull();
    expect(result.current.sheetError).toBeNull();
  });

  // The target slot was taken in the meantime: nothing changed, so the sheet stays open with the
  // reason and the booking is not refetched.
  it('keeps the sheet open with the translated reason when nothing resolved', async () => {
    mockResolve.mockResolvedValue({
      results: [
        {
          exceptionId: 'e1',
          outcome: 'STILL_OPEN',
          errorCode: 'BOOKING_EXCEPTION_REASSIGN_TARGET_INVALID',
        },
      ],
    });
    const { result, onBookingRefreshed } = setup();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => result.current.openSheet('reassign', ['e1']));
    await act(async () => {
      await result.current.submitReassign({ target: { resourceId: 'alt-1' } });
    });

    expect(result.current.sheet).not.toBeNull();
    expect(result.current.sheetError).toEqual(expect.any(String));
    expect(result.current.sheetError).not.toBe('');
    expect(mockGetBooking).not.toHaveBeenCalled();
    expect(onBookingRefreshed).not.toHaveBeenCalled();
  });

  it('refetches and drops the panel when the entry was already resolved elsewhere', async () => {
    mockResolve.mockResolvedValue({
      results: [
        {
          exceptionId: 'e1',
          outcome: 'STILL_OPEN',
          errorCode: 'BOOKING_EXCEPTION_ALREADY_RESOLVED',
        },
      ],
    });
    const { result, onBookingRefreshed } = setup();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => result.current.openSheet('cancel', ['e1']));
    await act(async () => {
      await result.current.submitCancel({});
    });

    expect(onBookingRefreshed).toHaveBeenCalledWith(freshBooking);
    expect(result.current.sheet).toBeNull();
  });

  it('shows an inline error when the whole request fails, and keeps the sheet open', async () => {
    mockResolve.mockRejectedValue(new Error('network down'));
    const { result } = setup();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => result.current.openSheet('cancel', ['e1']));
    await act(async () => {
      await result.current.submitCancel({});
    });

    expect(result.current.sheet).not.toBeNull();
    expect(result.current.sheetError).toEqual(expect.any(String));
    expect(mockGetBooking).not.toHaveBeenCalled();
  });

  // The resolve went through but the booking could not be reloaded: say so, never pretend.
  it('flags a refetch failure after a successful resolve and does not hand back a stale booking', async () => {
    mockGetBooking.mockRejectedValue(new Error('boom'));
    const { result, onBookingRefreshed } = setup();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => result.current.openSheet('cancel', ['e1']));
    await act(async () => {
      await result.current.submitCancel({});
    });

    expect(result.current.refreshFailed).toBe(true);
    expect(onBookingRefreshed).not.toHaveBeenCalled();
    expect(result.current.sheet).toBeNull();
  });

  it('does nothing when a submit arrives with no sheet open', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    await act(async () => {
      await result.current.submitCancel({});
    });

    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('reports a load error and can retry it', async () => {
    mockForBooking.mockRejectedValueOnce(new Error('load failed'));
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));

    mockForBooking.mockResolvedValue({ items: [entry('e1')] });
    act(() => result.current.retryLoad());

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });
});
