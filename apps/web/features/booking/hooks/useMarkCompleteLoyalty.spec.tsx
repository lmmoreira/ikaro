// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { useMarkCompleteLoyalty } from './useMarkCompleteLoyalty';

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
      {
        lineId: 'l-2',
        serviceId: 'svc-2',
        serviceName: 'Cera',
        priceAtBooking: { amount: 40, currency: 'BRL' },
        durationMinsAtBooking: 20,
        pointsValueAtBooking: 3,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    totalDurationMins: 50,
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

describe('useMarkCompleteLoyalty', () => {
  it("seeds linePrices from each line's quoted price", () => {
    const { result } = renderHook(() => useMarkCompleteLoyalty(makeBooking(), 10));

    expect(result.current.linePrices).toEqual({ 'l-1': '60', 'l-2': '40' });
    expect(result.current.totalCharged).toBe(100);
  });

  it('hides the loyalty panel when there is no customer', () => {
    const { result } = renderHook(() =>
      useMarkCompleteLoyalty(makeBooking({ customerId: null }), 10),
    );

    expect(result.current.showLoyaltyPanel).toBe(false);
    expect(result.current.maxRedeemablePoints).toBe(0);
  });

  it('caps maxRedeemablePoints by both the loyalty balance and the total charged', () => {
    const { result } = renderHook(() =>
      useMarkCompleteLoyalty(makeBooking({ loyaltyBalance: 50 }), 10),
    );

    // balance=50 caps below totalCharged*10=1000, rounded down to a multiple of 10
    expect(result.current.maxRedeemablePoints).toBe(50);
  });

  it('onUseAllPoints sets pointsUsed to maxRedeemablePoints and computes the discount', () => {
    const { result } = renderHook(() => useMarkCompleteLoyalty(makeBooking(), 10));

    act(() => result.current.onUseAllPoints());

    expect(result.current.pointsUsed).toBe(240);
    expect(result.current.discountAmount).toBe(24);
    expect(result.current.finalChargedTotal).toBe(76);
  });

  it('onPointsChange normalizes to a multiple of loyaltyPointsPerCurrencyUnit and caps at maxRedeemablePoints', () => {
    const { result } = renderHook(() => useMarkCompleteLoyalty(makeBooking(), 10));

    act(() => result.current.onPointsChange('35'));
    expect(result.current.pointsUsed).toBe(30);

    act(() => result.current.onPointsChange('9999'));
    expect(result.current.pointsUsed).toBe(240);
  });

  it('onLinePriceChange updates only the edited line and recomputes totalCharged', () => {
    const { result } = renderHook(() => useMarkCompleteLoyalty(makeBooking(), 10));

    act(() => result.current.onLinePriceChange('l-1', '50'));

    expect(result.current.linePrices).toEqual({ 'l-1': '50', 'l-2': '40' });
    expect(result.current.totalCharged).toBe(90);
  });
});
