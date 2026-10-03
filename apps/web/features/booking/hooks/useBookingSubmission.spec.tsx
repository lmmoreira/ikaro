// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import type { AvailableSlot, BookingResponse, CustomerProfileResponse } from '@ikaro/types';
import { createAuthenticatedBooking, createBooking } from '@/features/booking/api/public';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { ApiError, AuthError } from '@/shared/lib/api/errors';
import { emptyPersonalInfo, emptyAddress } from '@/features/booking/model/personal-info';
import type { BookingStepId } from '@/features/booking/model/booking-steps';
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

const BOOKING: BookingResponse = {
  bookingId: 'b-1',
  status: 'PENDING',
  scheduledAt: SLOT.startsAt,
  totalPrice: { amount: 150, currency: 'BRL' },
  totalDurationMins: 60,
  pickupAddress: null,
  beforeServicePhotoUrls: [],
  lines: [],
};

const PROFILE: CustomerProfileResponse = {
  customerId: 'c-1',
  email: 'maria@example.com',
  name: 'Maria Silva',
  phone: null,
  defaultAddress: null,
};

const STEPS: BookingStepId[] = [
  'services',
  'picker:svc-1:-',
  'availability',
  'personal',
  'intake',
  'confirmation',
];

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
    resourcePicks: [],
    intakeFields: null,
    locale: 'pt-BR' as const,
    steps: STEPS,
    resolveInvalidPickerStep: vi.fn().mockResolvedValue('picker:svc-1:-'),
    onRoute: vi.fn(),
    onSubmitStart: vi.fn(),
    ...overrides,
  };
}

function problem(code: string, field?: string): ApiError {
  return new ApiError(422, 'detail', { code, field });
}

describe('useBookingSubmission', () => {
  afterEach(() => {
    vi.mocked(createBooking).mockReset();
    vi.mocked(createAuthenticatedBooking).mockReset();
    vi.mocked(getHotsiteCustomerProfile).mockReset();
  });

  it('submits a guest booking via createBooking and keeps the booking response', async () => {
    vi.mocked(createBooking).mockResolvedValue(BOOKING);
    const params = baseParams();
    const { result } = renderHook(() => useBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.booking).toEqual(BOOKING);
    expect(params.onSubmitStart).toHaveBeenCalled();
    expect(createBooking).toHaveBeenCalledWith(
      'lavacar-beloauto',
      expect.objectContaining({ contactName: 'Maria Silva' }),
    );
    expect(createAuthenticatedBooking).not.toHaveBeenCalled();
  });

  it('submits an authenticated booking and keeps the typed response', async () => {
    vi.mocked(createAuthenticatedBooking).mockResolvedValue(BOOKING);
    const { result } = renderHook(() =>
      useBookingSubmission(baseParams({ customerProfile: PROFILE })),
    );

    await act(() => result.current.handleSubmit());

    expect(result.current.booking).toEqual(BOOKING);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('sends resourceSelections, the duration-free payload and the intake fields on both paths', async () => {
    vi.mocked(createBooking).mockResolvedValue(BOOKING);
    vi.mocked(createAuthenticatedBooking).mockResolvedValue(BOOKING);
    const extra = {
      resourcePicks: [
        { serviceId: 'svc-1', legIndex: null, resourceType: 'STAFF' as const, resourceId: 'r-1' },
      ],
      intakeFields: { intakeSchemaVersion: 2, intakeAnswers: { a: 'b' }, consentAccepted: true },
    };
    const guest = renderHook(() => useBookingSubmission(baseParams(extra)));
    const customer = renderHook(() =>
      useBookingSubmission(baseParams({ ...extra, customerProfile: PROFILE })),
    );

    await act(() => guest.result.current.handleSubmit());
    await act(() => customer.result.current.handleSubmit());

    const expected = expect.objectContaining({
      resourceSelections: extra.resourcePicks,
      intakeSchemaVersion: 2,
      consentAccepted: true,
    });
    expect(createBooking).toHaveBeenCalledWith('lavacar-beloauto', expected);
    expect(createAuthenticatedBooking).toHaveBeenCalledWith(expected);
  });

  it('fetches the customer profile when it is still unknown and reports it', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(PROFILE);
    vi.mocked(createAuthenticatedBooking).mockResolvedValue(BOOKING);
    const params = baseParams({ customerProfile: undefined });
    const { result } = renderHook(() => useBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    expect(params.onCustomerProfileResolved).toHaveBeenCalledWith(PROFILE);
    expect(createAuthenticatedBooking).toHaveBeenCalled();
  });

  it('does nothing without a selected slot', async () => {
    const { result } = renderHook(() => useBookingSubmission(baseParams({ selectedSlot: null })));

    await act(() => result.current.handleSubmit());

    expect(result.current.status).toBe('idle');
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('routes a slot conflict to availability and goes back to idle', async () => {
    vi.mocked(createBooking).mockRejectedValue(problem(BookingErrorCode.SLOT_UNAVAILABLE));
    const params = baseParams();
    const { result } = renderHook(() => useBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    expect(params.onRoute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'step', stepId: 'availability' }),
    );
    expect(result.current.status).toBe('idle');
  });

  it('re-resolves the invalid picker step for a picker error', async () => {
    vi.mocked(createBooking).mockRejectedValue(
      problem(BookingErrorCode.RESOURCE_SELECTION_REQUIRED),
    );
    const params = baseParams();
    const { result } = renderHook(() => useBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    expect(params.resolveInvalidPickerStep).toHaveBeenCalled();
    expect(params.onRoute).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'picker:svc-1:-' }),
    );
  });

  it('falls back to Confirmation when no picker step is invalid', async () => {
    vi.mocked(createBooking).mockRejectedValue(
      problem(BookingErrorCode.SERVICE_RESOURCE_TYPE_UNAVAILABLE),
    );
    const params = baseParams({ resolveInvalidPickerStep: vi.fn().mockResolvedValue(null) });
    const { result } = renderHook(() => useBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    expect(params.onRoute).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'confirmation' }),
    );
    expect(result.current.status).toBe('error');
  });

  it('keeps status "error" for a generic failure and does not resolve a picker', async () => {
    vi.mocked(createBooking).mockRejectedValue(new Error('network'));
    const params = baseParams();
    const { result } = renderHook(() => useBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    expect(result.current.status).toBe('error');
    expect(params.resolveInvalidPickerStep).not.toHaveBeenCalled();
  });

  it('routes a 401 to the login', async () => {
    vi.mocked(createAuthenticatedBooking).mockRejectedValue(new AuthError('expired'));
    const params = baseParams({ customerProfile: PROFILE });
    const { result } = renderHook(() => useBookingSubmission(params));

    await act(() => result.current.handleSubmit());

    expect(params.onRoute).toHaveBeenCalledWith({ kind: 'login' });
    expect(result.current.status).toBe('idle');
  });
});
