// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AvailableSlot, BookingResponse } from '@ikaro/types';
import { AuthError } from '@/shared/lib/api/errors';
import type { BookingStepId } from '@/features/booking/model/booking-steps';
import { useBookingSubmitRunner } from './useBookingSubmitRunner';

const SLOT: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  endsAt: '2026-06-15T13:00:00.000Z',
};
const BOOKING = { bookingId: 'b-1' } as BookingResponse;
const STEPS: BookingStepId[] = ['services', 'availability', 'confirmation'];

function params(overrides: Partial<Parameters<typeof useBookingSubmitRunner>[0]> = {}) {
  return {
    selectedSlot: SLOT,
    locale: 'pt-BR' as const,
    steps: STEPS,
    resolveInvalidPickerStep: vi.fn().mockResolvedValue(null),
    onRoute: vi.fn(),
    onSubmitStart: vi.fn(),
    ...overrides,
  };
}

describe('useBookingSubmitRunner', () => {
  it('passes the chosen slot to the request and keeps what it returns', async () => {
    const submit = vi.fn().mockResolvedValue(BOOKING);
    const p = params();
    const { result } = renderHook(() => useBookingSubmitRunner(p));

    await act(() => result.current.run(submit));

    expect(submit).toHaveBeenCalledWith(SLOT);
    expect(result.current.status).toBe('success');
    expect(result.current.booking).toBe(BOOKING);
    expect(p.onSubmitStart).toHaveBeenCalledOnce();
  });

  it('does not send anything without a slot', async () => {
    const submit = vi.fn();
    const { result } = renderHook(() => useBookingSubmitRunner(params({ selectedSlot: null })));

    await act(() => result.current.run(submit));

    expect(submit).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('routes a 401 to the flow’s own login', async () => {
    const p = params();
    const { result } = renderHook(() => useBookingSubmitRunner(p));

    await act(() => result.current.run(() => Promise.reject(new AuthError('expired'))));

    expect(p.onRoute).toHaveBeenCalledWith({ kind: 'login' });
    expect(result.current.status).toBe('idle');
  });

  it('shows an unclassified failure on the confirmation step', async () => {
    const p = params();
    const { result } = renderHook(() => useBookingSubmitRunner(p));

    await act(() => result.current.run(() => Promise.reject(new Error('boom'))));

    expect(p.onRoute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'step', stepId: 'confirmation' }),
    );
    expect(result.current.status).toBe('error');
  });
});
