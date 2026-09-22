// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvailableSlot } from '@ikaro/types';
import { createAuthenticatedBooking, createBooking } from '@/features/booking/api/public';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { ApiError } from '@/shared/lib/api/errors';
import { emptyPersonalInfo, emptyAddress } from '@/features/booking/model/personal-info';
import { useBookingSubmission } from './useBookingSubmission';

vi.mock('@/features/booking/api/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/booking/api/public')>();
  return {
    ...actual,
    createBooking: vi.fn(),
    createAuthenticatedBooking: vi.fn(),
  };
});

vi.mock('@/features/platform/hotsite/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

const SLOT: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  endsAt: '2026-06-15T13:00:00.000Z',
};

function baseParams(overrides: Partial<Parameters<typeof useBookingSubmission>[0]> = {}) {
  return {
    slug: 'lavacar-beloauto',
    customerProfile: null,
    onCustomerProfileResolved: vi.fn(),
    selectedServiceIds: ['svc-1'],
    selectedSlot: SLOT,
    pickupAddress: emptyAddress(),
    requiresPickupAddress: false,
    personalInfo: {
      ...emptyPersonalInfo(),
      contactName: 'Maria Silva',
      contactEmail: 'maria@example.com',
      contactPhone: '+5511999999999',
    },
    addressSpec: { requireNeighborhood: true } as Parameters<
      typeof useBookingSubmission
    >[0]['addressSpec'],
    locale: 'pt-BR' as const,
    onErrorStep: vi.fn(),
    ...overrides,
  };
}

describe('useBookingSubmission', () => {
  afterEach(() => {
    vi.mocked(createBooking).mockReset();
    vi.mocked(createAuthenticatedBooking).mockReset();
    vi.mocked(getHotsiteCustomerProfile).mockReset();
  });

  it('submits a guest booking via createBooking when customerProfile is null', async () => {
    vi.mocked(createBooking).mockResolvedValue({ bookingId: 'b-1', status: 'PENDING' } as Awaited<
      ReturnType<typeof createBooking>
    >);
    const { result } = renderHook(() => useBookingSubmission(baseParams()));

    await act(() => result.current.handleSubmit());

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(createBooking).toHaveBeenCalledWith(
      'lavacar-beloauto',
      expect.objectContaining({ contactName: 'Maria Silva' }),
    );
    expect(createAuthenticatedBooking).not.toHaveBeenCalled();
  });

  it('submits an authenticated booking via createAuthenticatedBooking when customerProfile is set', async () => {
    vi.mocked(createAuthenticatedBooking).mockResolvedValue({
      bookingId: 'b-1',
      status: 'PENDING',
    } as Awaited<ReturnType<typeof createAuthenticatedBooking>>);
    const { result } = renderHook(() =>
      useBookingSubmission(
        baseParams({
          customerProfile: {
            customerId: 'c-1',
            email: 'maria@example.com',
            name: 'Maria Silva',
            phone: null,
            defaultAddress: null,
          },
        }),
      ),
    );

    await act(() => result.current.handleSubmit());

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(createAuthenticatedBooking).toHaveBeenCalled();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('resolves the profile lazily via getHotsiteCustomerProfile when customerProfile is undefined', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
    vi.mocked(createBooking).mockResolvedValue({ bookingId: 'b-1', status: 'PENDING' } as Awaited<
      ReturnType<typeof createBooking>
    >);
    const onCustomerProfileResolved = vi.fn();
    const { result } = renderHook(() =>
      useBookingSubmission(baseParams({ customerProfile: undefined, onCustomerProfileResolved })),
    );

    await act(() => result.current.handleSubmit());

    expect(getHotsiteCustomerProfile).toHaveBeenCalledWith('lavacar-beloauto');
    expect(onCustomerProfileResolved).toHaveBeenCalledWith(null);
  });

  it('does nothing when there is no selectedSlot', async () => {
    const { result } = renderHook(() => useBookingSubmission(baseParams({ selectedSlot: null })));

    await act(() => result.current.handleSubmit());

    expect(createBooking).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('routes a slot-unavailable error back to step 2', async () => {
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(409, 'Slot unavailable', { code: 'BOOKING_SLOT_UNAVAILABLE' }),
    );
    const onErrorStep = vi.fn();
    const { result } = renderHook(() => useBookingSubmission(baseParams({ onErrorStep })));

    await act(() => result.current.handleSubmit());

    await waitFor(() => expect(onErrorStep).toHaveBeenCalledWith(2));
    expect(result.current.step2Error).toBeTruthy();
    expect(result.current.step1Error).toBeNull();
    expect(result.current.step3Error).toBeNull();
  });

  it('routes an unrecognized error to step 4 as a generic error', async () => {
    vi.mocked(createBooking).mockRejectedValue(new Error('network error'));
    const onErrorStep = vi.fn();
    const { result } = renderHook(() => useBookingSubmission(baseParams({ onErrorStep })));

    await act(() => result.current.handleSubmit());

    await waitFor(() => expect(onErrorStep).toHaveBeenCalledWith(4));
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBeTruthy();
  });

  it('clearStep2Error clears only the step2 error', async () => {
    vi.mocked(createBooking).mockRejectedValue(
      new ApiError(409, 'Slot unavailable', { code: 'BOOKING_SLOT_UNAVAILABLE' }),
    );
    const { result } = renderHook(() => useBookingSubmission(baseParams()));

    await act(() => result.current.handleSubmit());
    await waitFor(() => expect(result.current.step2Error).toBeTruthy());

    act(() => result.current.clearStep2Error());

    expect(result.current.step2Error).toBeNull();
  });
});
