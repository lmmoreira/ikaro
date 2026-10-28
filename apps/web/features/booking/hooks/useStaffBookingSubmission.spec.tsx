// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import type { AvailableSlot, BookingResponse } from '@ikaro/types';
import { createBookingByStaff } from '@/features/booking/api/staff-bookings';
import { ApiError } from '@/shared/lib/api/errors';
import { emptyAddress } from '@/features/booking/model/personal-info';
import type { BookingStepId } from '@/features/booking/model/booking-steps';
import { useStaffBookingSubmission } from './useStaffBookingSubmission';

vi.mock('@/features/booking/api/staff-bookings', () => ({ createBookingByStaff: vi.fn() }));

const SLOT: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  appointmentEndsAt: '2026-06-15T13:00:00.000Z',
  endsAt: '2026-06-15T13:00:00.000Z',
};

const BOOKING = {
  bookingId: 'b-1',
  status: 'APPROVED',
  scheduledAt: SLOT.startsAt,
  totalPrice: { amount: 150, currency: 'BRL' },
  totalDurationMins: 60,
  beforeServicePhotoUrls: [],
  lines: [],
} as unknown as BookingResponse;

const STEPS: BookingStepId[] = ['services', 'availability', 'confirmation'];

function baseParams(overrides: Partial<Parameters<typeof useStaffBookingSubmission>[0]> = {}) {
  return {
    recipient: { kind: 'customer' as const, customerId: 'cust-1' },
    selectedServiceIds: ['svc-1'],
    selectedSlot: SLOT,
    pickupAddress: emptyAddress(),
    requiresPickupAddress: false,
    resourcePicks: [],
    intakeFields: null,
    locale: 'pt-BR' as const,
    steps: STEPS,
    resolveInvalidPickerStep: vi.fn().mockResolvedValue(null),
    onRoute: vi.fn(),
    onSubmitStart: vi.fn(),
    ...overrides,
  };
}

describe('useStaffBookingSubmission', () => {
  afterEach(() => vi.mocked(createBookingByStaff).mockReset());

  it('submits a registered customer by customerId and keeps the booking', async () => {
    vi.mocked(createBookingByStaff).mockResolvedValue(BOOKING);
    const params = baseParams();
    const { result } = renderHook(() => useStaffBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.booking).toEqual(BOOKING);
    expect(params.onSubmitStart).toHaveBeenCalled();
    const body = vi.mocked(createBookingByStaff).mock.calls[0]![0];
    expect(body).toMatchObject({ customerId: 'cust-1', scheduledAt: SLOT.startsAt });
    expect(body).not.toHaveProperty('contactName');
  });

  it('submits a new contact as the contact trio, never with a customerId', async () => {
    vi.mocked(createBookingByStaff).mockResolvedValue(BOOKING);
    const params = baseParams({
      recipient: {
        kind: 'guest' as const,
        contactName: 'Maria',
        contactPhone: '+5531999990000',
        contactEmail: 'maria@example.com',
      },
    });
    const { result } = renderHook(() => useStaffBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    const body = vi.mocked(createBookingByStaff).mock.calls[0]![0];
    expect(body).toMatchObject({ contactName: 'Maria', contactEmail: 'maria@example.com' });
    expect(body).not.toHaveProperty('customerId');
  });

  it('does nothing without a chosen slot', async () => {
    const { result } = renderHook(() =>
      useStaffBookingSubmission(baseParams({ selectedSlot: null })),
    );

    await act(() => result.current.handleSubmit());

    expect(createBookingByStaff).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('routes a slot conflict back to the date step and leaves the form usable', async () => {
    vi.mocked(createBookingByStaff).mockRejectedValue(
      new ApiError(409, 'taken', { code: BookingErrorCode.SLOT_UNAVAILABLE }),
    );
    const params = baseParams();
    const { result } = renderHook(() => useStaffBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    expect(params.onRoute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'step', stepId: 'availability' }),
    );
    expect(result.current.status).toBe('idle');
  });

  it('keeps a staff-only failure on the confirmation step, with its code', async () => {
    vi.mocked(createBookingByStaff).mockRejectedValue(
      new ApiError(422, 'no phone', { code: BookingErrorCode.CUSTOMER_PHONE_NOT_SET }),
    );
    const params = baseParams();
    const { result } = renderHook(() => useStaffBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    expect(params.onRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'step',
        stepId: 'confirmation',
        code: BookingErrorCode.CUSTOMER_PHONE_NOT_SET,
      }),
    );
    expect(result.current.status).toBe('error');
  });
});
