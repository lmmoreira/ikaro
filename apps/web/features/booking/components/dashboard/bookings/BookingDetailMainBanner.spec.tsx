// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingDetailMainBanner } from './BookingDetailMainBanner';

const noShowProps = {
  noShowEndLabel: '10:30',
  correctionPoints: 5,
  onRefresh: vi.fn(),
  onRetryNoShow: vi.fn(),
  onRetryCorrect: vi.fn(),
};

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
    statusHistory: [],
    ...overrides,
  };
}

describe('BookingDetailMainBanner', () => {
  it('renders nothing for actionState idle on a pending booking', () => {
    const { container } = renderWithIntl(
      <BookingDetailMainBanner
        {...noShowProps}
        actionState="idle"
        booking={makeBooking()}
        approvedRangeLabel=""
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the approved banner with the contact name and range', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        {...noShowProps}
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
        {...noShowProps}
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
        {...noShowProps}
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
        {...noShowProps}
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
        {...noShowProps}
        actionState="idle"
        booking={makeBooking({ status: 'COMPLETED' })}
        approvedRangeLabel=""
      />,
    );

    expect(screen.getByTestId('booking-completed-title')).toBeInTheDocument();
  });

  it('renders the read-only no-show banner for a NO_SHOW booking', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        {...noShowProps}
        actionState="idle"
        booking={makeBooking({ status: 'NO_SHOW' })}
        approvedRangeLabel=""
      />,
    );

    expect(screen.getByTestId('booking-no-show-title')).toBeInTheDocument();
    expect(screen.getByText(/João Silva/)).toBeInTheDocument();
  });

  it('delegates a no-show outcome state to the no-show banner, whatever the booking status', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        {...noShowProps}
        actionState="no-show"
        booking={makeBooking({ status: 'NO_SHOW' })}
        approvedRangeLabel=""
      />,
    );

    expect(screen.getByTestId('booking-no-show-marked')).toBeInTheDocument();
    expect(screen.queryByTestId('booking-no-show-title')).not.toBeInTheDocument();
  });

  it('shows the not-yet-ended banner over an unchanged approved booking', () => {
    renderWithIntl(
      <BookingDetailMainBanner
        {...noShowProps}
        actionState="no-show-not-ended"
        booking={makeBooking({ status: 'APPROVED' })}
        approvedRangeLabel=""
      />,
    );

    expect(screen.getByTestId('booking-no-show-not-ended')).toBeInTheDocument();
    expect(screen.getByText(/O atendimento termina às 10:30/)).toBeInTheDocument();
  });
});
