// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingDetailMainBanner } from './BookingDetailMainBanner';

function makeBooking(overrides?: Partial<StaffBookingDetailResponse>): StaffBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'PENDING',
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
        priceAtBooking: { amount: 100, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
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

describe('BookingDetailMainBanner', () => {
  it('renders nothing for actionState idle on a pending booking', () => {
    const { container } = renderWithIntl(
      <BookingDetailMainBanner actionState="idle" booking={makeBooking()} approvedRangeLabel="" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the approved banner with the contact name and range', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        actionState="approved"
        booking={makeBooking()}
        approvedRangeLabel="10:00–10:30"
      />,
    );

    expect(screen.getByText(/João Silva/)).toBeInTheDocument();
    expect(screen.getByText(/10:00–10:30/)).toBeInTheDocument();
  });

  it('renders the rejected banner with the rejection reason', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        actionState="rejected"
        booking={makeBooking({ rejectionReason: 'Horário indisponível' })}
        approvedRangeLabel=""
      />,
    );

    expect(screen.getByTestId('booking-rejected-reason')).toHaveTextContent('Horário indisponível');
  });

  it('renders the info-requested banner with the request message', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        actionState="info-requested"
        booking={makeBooking({ infoRequestMessage: 'Precisamos confirmar seu endereço' })}
        approvedRangeLabel=""
      />,
    );

    expect(screen.getByTestId('booking-info-requested-message')).toHaveTextContent(
      'Precisamos confirmar seu endereço',
    );
  });

  it('renders the cancelled banner', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        actionState="cancelled"
        booking={makeBooking()}
        approvedRangeLabel="10:00–10:30"
      />,
    );

    expect(screen.getByTestId('booking-cancelled-title')).toBeInTheDocument();
  });

  it('falls back to the booking.status===COMPLETED banner when actionState is idle', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        actionState="idle"
        booking={makeBooking({ status: 'COMPLETED' })}
        approvedRangeLabel=""
      />,
    );

    expect(screen.getByTestId('booking-completed-title')).toBeInTheDocument();
  });
});
