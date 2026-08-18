// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { getBooking } from '@/features/booking/api/booking';
import {
  computeCompletedBookingForDisplay,
  useMarkCompleteSubmission,
} from './useMarkCompleteSubmission';

function IntlWrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <NextIntlClientProvider locale="pt-BR" messages={ptBRMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const completeBookingMutateAsync = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/hooks/useBookingMutations', () => ({
  useCompleteBooking: () => ({ mutateAsync: completeBookingMutateAsync, isPending: false }),
}));

vi.mock('@/features/booking/api/booking', () => ({
  getBooking: vi.fn(),
}));

function makeBooking(overrides?: Partial<StaffBookingDetailResponse>): StaffBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'APPROVED',
    scheduledAt: '2026-06-16T10:00:00.000Z',
    type: 'CUSTOMER',
    contactName: 'João Silva',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    pickupAddress: null,
    customerId: 'c-1',
    loyaltyBalance: 240,
    lines: [
      {
        lineId: 'l-1',
        serviceId: 'svc-1',
        serviceName: 'Lavagem Simples',
        priceAtBooking: { amount: 60, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 60, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    totalDurationMins: 30,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    beforeServicePhotoPaths: [],
    afterServicePhotoPaths: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    completedAt: null,
    rejectionReason: null,
    ...overrides,
  };
}

function baseParams(overrides: Partial<Parameters<typeof useMarkCompleteSubmission>[0]> = {}) {
  return {
    booking: makeBooking(),
    linePrices: { 'l-1': '60' },
    showLoyaltyPanel: false,
    pointsUsed: 0,
    discountAmount: 0,
    loyaltyBalance: 240,
    totalEarnedPoints: 5,
    onCompletedStatus: vi.fn(),
    ...overrides,
  };
}

function preventableEvent() {
  return { preventDefault: vi.fn() } as unknown as Parameters<
    ReturnType<typeof useMarkCompleteSubmission>['handleSubmit']
  >[0];
}

describe('useMarkCompleteSubmission', () => {
  afterEach(() => {
    completeBookingMutateAsync.mockReset();
    vi.mocked(getBooking).mockReset();
  });

  it('submits the entered line prices and marks completed on success', async () => {
    completeBookingMutateAsync.mockResolvedValue(undefined);
    vi.mocked(getBooking).mockResolvedValue(makeBooking({ status: 'COMPLETED' }));
    const onCompletedStatus = vi.fn();
    const { result } = renderHook(
      () => useMarkCompleteSubmission(baseParams({ onCompletedStatus })),
      { wrapper: IntlWrapper },
    );

    await act(() => result.current.handleSubmit(preventableEvent()));

    await waitFor(() => expect(result.current.completed).toBe(true));
    expect(completeBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: { lines: [{ lineId: 'l-1', actualPriceCharged: 60 }] },
    });
    expect(onCompletedStatus).toHaveBeenCalled();
  });

  it('includes discountByPoints only when showLoyaltyPanel and pointsUsed are set', async () => {
    completeBookingMutateAsync.mockResolvedValue(undefined);
    vi.mocked(getBooking).mockResolvedValue(makeBooking());
    const { result } = renderHook(
      () =>
        useMarkCompleteSubmission(
          baseParams({ showLoyaltyPanel: true, pointsUsed: 240, discountAmount: 24 }),
        ),
      { wrapper: IntlWrapper },
    );

    await act(() => result.current.handleSubmit(preventableEvent()));

    expect(completeBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: {
        lines: [{ lineId: 'l-1', actualPriceCharged: 60 }],
        discountByPoints: { pointsUsed: 240, amountDeducted: 24 },
      },
    });
  });

  it('sets an error and does not complete when a line price is invalid', async () => {
    const { result } = renderHook(
      () => useMarkCompleteSubmission(baseParams({ linePrices: { 'l-1': '' } })),
      { wrapper: IntlWrapper },
    );

    await act(() => result.current.handleSubmit(preventableEvent()));

    expect(result.current.error).toBeTruthy();
    expect(result.current.completed).toBe(false);
    expect(completeBookingMutateAsync).not.toHaveBeenCalled();
  });

  it('sets a generic error when the mutation rejects', async () => {
    completeBookingMutateAsync.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useMarkCompleteSubmission(baseParams()), {
      wrapper: IntlWrapper,
    });

    await act(() => result.current.handleSubmit(preventableEvent()));

    expect(result.current.error).toBeTruthy();
    expect(result.current.completed).toBe(false);
  });
});

describe('computeCompletedBookingForDisplay', () => {
  it('returns the refreshed booking untouched for a guest booking', () => {
    const booking = makeBooking({ customerId: null });
    const refreshed = makeBooking({ customerId: null, status: 'COMPLETED' });

    const result = computeCompletedBookingForDisplay(booking, 0, 5, 0, refreshed);

    expect(result).toBe(refreshed);
  });

  it('projects the post-completion loyalty balance for a customer booking', () => {
    const booking = makeBooking();
    const refreshed = makeBooking({ status: 'COMPLETED', loyaltyBalance: 240 });

    const result = computeCompletedBookingForDisplay(booking, 240, 5, 20, refreshed);

    expect(result.loyaltyBalance).toBe(225);
  });

  it('falls back to the original booking when no refreshed booking is available yet', () => {
    const booking = makeBooking();

    const result = computeCompletedBookingForDisplay(booking, 240, 5, 0, null);

    expect(result.loyaltyBalance).toBe(245);
  });
});
