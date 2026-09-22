// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { MarkCompleteSuccessView } from './MarkCompleteSuccessView';

function makeBooking(overrides?: Partial<StaffBookingDetailResponse>): StaffBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'COMPLETED',
    scheduledAt: '2026-06-16T10:00:00.000Z',
    type: 'CUSTOMER',
    contactName: 'João Silva',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    pickupAddress: null,
    customerId: 'c-1',
    loyaltyBalance: 248,
    lines: [
      {
        lineId: 'l-1',
        serviceId: 'svc-1',
        serviceName: 'Lavagem Simples',
        priceAtBooking: { amount: 60, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: { amount: 60, currency: 'BRL' },
      },
    ],
    totalPrice: { amount: 60, currency: 'BRL' },
    totalActualPrice: { amount: 60, currency: 'BRL' },
    discountPointsUsed: null,
    discountAmount: null,
    totalDurationMins: 30,
    beforeServicePhotoUrls: ['https://cdn.example.com/before.jpg'],
    afterServicePhotoUrls: ['https://cdn.example.com/after.jpg'],
    beforeServicePhotoPaths: [],
    afterServicePhotoPaths: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    completedAt: '2026-06-16T10:50:00.000Z',
    rejectionReason: null,
    ...overrides,
  };
}

describe('MarkCompleteSuccessView', () => {
  it('renders the completed title and before/after photo sections', () => {
    const booking = makeBooking();
    renderWithIntl(
      <MarkCompleteSuccessView
        booking={booking}
        completedBookingForDisplay={booking}
        linePrices={{ 'l-1': '60' }}
        finalChargedTotal={60}
        showLoyaltyPanel={false}
        pointsUsed={0}
        discountAmount={0}
        totalEarnedPoints={5}
        backHref="/dashboard/bookings"
      />,
    );

    expect(screen.getByText('Serviço concluído')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto antes do serviço 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto depois do serviço 1' })).toBeInTheDocument();
  });

  it('omits the after-photos section when there are none', () => {
    const booking = makeBooking({ afterServicePhotoUrls: [] });
    renderWithIntl(
      <MarkCompleteSuccessView
        booking={booking}
        completedBookingForDisplay={booking}
        linePrices={{ 'l-1': '60' }}
        finalChargedTotal={60}
        showLoyaltyPanel={false}
        pointsUsed={0}
        discountAmount={0}
        totalEarnedPoints={5}
        backHref="/dashboard/bookings"
      />,
    );

    expect(screen.queryByRole('img', { name: /Foto depois/ })).not.toBeInTheDocument();
  });
});
