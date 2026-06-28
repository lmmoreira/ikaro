// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingClientCard } from './BookingClientCard';

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
    lines: [],
    totalPrice: { amount: 0, currency: 'BRL' },
    totalDurationMins: 0,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null,
    ...overrides,
  };
}

describe('BookingClientCard', () => {
  it('renders the client shell with initials, contact data and type badge', () => {
    renderWithIntl(<BookingClientCard booking={makeBooking()} />);

    expect(screen.getAllByText('Cliente')).toHaveLength(2);
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('joao@example.com')).toBeInTheDocument();
    expect(screen.getByText('+5531999999999')).toBeInTheDocument();
    expect(screen.getByText('JS')).toBeInTheDocument();
    expect(screen.getByText('★ 240 pontos ativos')).toBeInTheDocument();
  });

  it('hides the loyalty line when requested', () => {
    renderWithIntl(<BookingClientCard booking={makeBooking()} showLoyaltyBalance={false} />);

    expect(screen.queryByText('★ 240 pontos ativos')).not.toBeInTheDocument();
  });

  it('renders the guest badge when the booking is from a visitor', () => {
    renderWithIntl(<BookingClientCard booking={makeBooking({ type: 'GUEST' })} />);

    expect(screen.getByText('Visitante')).toBeInTheDocument();
  });
});
