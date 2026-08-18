// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { RescheduleSuccessView } from './RescheduleSuccessView';

function makeBooking(): StaffBookingDetailResponse {
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
  };
}

describe('RescheduleSuccessView', () => {
  it('renders the success title, contact email confirmation, and from/to summary', () => {
    renderWithIntl(
      <RescheduleSuccessView
        booking={makeBooking()}
        lastReschedule={{ from: '2026-06-16T10:00:00.000Z', to: '2026-06-17T14:00:00.000Z' }}
        backHref="/dashboard/bookings/b-1"
        agendaHref="/dashboard/schedule?weekStart=2026-06-16"
      />,
    );

    expect(screen.getByText('Agendamento reagendado')).toBeInTheDocument();
    expect(screen.getByTestId('reschedule-body-email')).toHaveTextContent('João Silva');
    const viewLinks = screen.getAllByRole('link', { name: 'Ver detalhe atualizado' });
    expect(viewLinks[0]).toHaveAttribute('href', '/dashboard/bookings/b-1');
    const backLinks = screen.getAllByRole('link', { name: 'Voltar à agenda' });
    expect(backLinks[0]).toHaveAttribute('href', '/dashboard/schedule?weekStart=2026-06-16');
  });
});
