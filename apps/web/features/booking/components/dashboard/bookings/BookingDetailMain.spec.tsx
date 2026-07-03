// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { BookingDetailMain } from './BookingDetailMain';

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
    beforeServicePhotoUrls: ['https://cdn.example.com/before-1.jpg'],
    afterServicePhotoUrls: ['https://cdn.example.com/after-1.jpg'],
    infoRequestMessage: 'Enviar mais fotos?',
    infoResponseMessage: 'Claro',
    approvedAt: null,
    approvedBy: null,
    completedAt: null,
    rejectionReason: null,
    ...overrides,
  };
}

describe('BookingDetailMain', () => {
  it('renders the customer, time, services, and photos sections', () => {
    renderWithIntl(<BookingDetailMain booking={makeBooking()} />);

    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('joao@example.com')).toBeInTheDocument();
    expect(screen.getByText('★ 240 pontos ativos')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 100,00')).toHaveLength(2);
    expect(screen.getAllByText('R$ 100,00')[0]).toHaveClass('text-blue-700');
    expect(screen.getAllByText('R$ 100,00')[1]).toHaveClass('text-blue-700');
    expect(screen.getAllByText('30 min')).toHaveLength(2);
    expect(screen.getByText('Fotos')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('shows the info request section when present', () => {
    renderWithIntl(<BookingDetailMain booking={makeBooking()} />);

    expect(screen.getByText('O que foi pedido')).toBeInTheDocument();
    expect(screen.getByText('Enviar mais fotos?')).toBeInTheDocument();
    expect(screen.getByText('Resposta do cliente')).toBeInTheDocument();
    expect(screen.getByText('Claro')).toBeInTheDocument();
  });

  it('shows the info sent badge when the booking is already awaiting info', () => {
    renderWithIntl(<BookingDetailMain booking={makeBooking({ status: 'INFO_REQUESTED' })} />);

    expect(screen.getByText('Info enviada')).toBeInTheDocument();
  });
});
