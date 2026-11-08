// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { StaffBookingExtras } from './StaffBookingExtras';

function makeBooking(overrides?: Partial<StaffBookingDetailResponse>): StaffBookingDetailResponse {
  return {
    hasOpenException: false,
    bookingId: 'b-1',
    status: 'APPROVED',
    scheduledAt: '2026-06-16T13:00:00.000Z',
    type: 'CUSTOMER',
    contactName: 'João Silva',
    contactEmail: 'joao@example.com',
    contactPhone: '+5511987654321',
    contactAddress: null,
    pickupAddress: null,
    customerId: 'c-1',
    loyaltyBalance: 240,
    lines: [],
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
    statusHistory: [],
    notes: null,
    adminNotes: null,
    createdAt: '2026-06-14T12:12:00.000Z',
    createdByName: null,
    resources: [],
    itinerary: [],
    participantCount: null,
    attendees: [],
    intake: null,
    recurringScheduleId: null,
    cancellation: null,
    rejection: null,
    ...overrides,
  };
}

describe('StaffBookingExtras', () => {
  it('shows only the origin card for a plain booking (nothing else appears)', () => {
    renderWithIntl(<StaffBookingExtras booking={makeBooking()} />);

    expect(screen.getByTestId('booking-origin-card')).toBeInTheDocument();
    for (const id of [
      'booking-resources-card',
      'booking-itinerary-card',
      'booking-participants-card',
      'booking-intake-card',
      'booking-customer-notes-card',
      'booking-addresses-card',
      'booking-internal-notes-card',
      'booking-cancellation-card',
      'booking-rejection-card',
    ]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
  });

  it('shows the customer notes and the internal notes in their own cards', () => {
    renderWithIntl(
      <StaffBookingExtras
        booking={makeBooking({ notes: 'Carro com película.', adminNotes: 'Vaga coberta.' })}
      />,
    );

    expect(screen.getByText('Observações do cliente')).toBeInTheDocument();
    expect(screen.getByText('Carro com película.')).toBeInTheDocument();
    expect(screen.getByText('Notas internas')).toBeInTheDocument();
    expect(screen.getByText('Vaga coberta.')).toBeInTheDocument();
  });

  it('links an occurrence to its recurring schedule and names the staff creator', () => {
    renderWithIntl(
      <StaffBookingExtras
        booking={makeBooking({ recurringScheduleId: 's-1', createdByName: 'Ana Pereira' })}
      />,
    );

    expect(screen.getByRole('link', { name: 'Ver recorrência' })).toHaveAttribute(
      'href',
      '/dashboard/bookings/recurring/s-1',
    );
    expect(screen.getByText('Ana Pereira')).toBeInTheDocument();
  });

  it('shows the cancellation with the staff member named and the reason', () => {
    renderWithIntl(
      <StaffBookingExtras
        booking={makeBooking({
          status: 'CANCELLED',
          cancellation: {
            at: '2026-06-16T11:40:00.000Z',
            reason: 'Equipamento em manutenção.',
            by: { kind: 'STAFF', name: 'Ana Pereira' },
          },
        })}
      />,
    );

    expect(screen.getByTestId('booking-cancellation-card')).toBeInTheDocument();
    expect(screen.getByText('Ana Pereira (equipe)')).toBeInTheDocument();
    expect(screen.getByText('Equipamento em manutenção.')).toBeInTheDocument();
  });

  it('shows the expiry card with the system as the actor when the request expired unanswered (TD51)', () => {
    renderWithIntl(
      <StaffBookingExtras
        booking={makeBooking({
          status: 'CANCELLED',
          cancellation: {
            at: '2026-06-16T11:40:00.000Z',
            reason: null,
            by: { kind: 'SYSTEM', name: null },
          },
        })}
      />,
    );

    expect(screen.getByTestId('booking-expiry-card')).toBeInTheDocument();
    expect(screen.queryByTestId('booking-cancellation-card')).not.toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
    expect(screen.getByText('A solicitação expirou sem resposta')).toBeInTheDocument();
  });

  it('falls back to the role when the actor cannot be named, and labels a customer cancel', () => {
    const { rerender } = renderWithIntl(
      <StaffBookingExtras
        booking={makeBooking({
          cancellation: {
            at: '2026-06-16T11:40:00.000Z',
            reason: null,
            by: { kind: 'STAFF', name: null },
          },
        })}
      />,
    );
    expect(screen.getByText('Equipe')).toBeInTheDocument();

    rerender(
      <StaffBookingExtras
        booking={makeBooking({
          cancellation: {
            at: '2026-06-16T11:40:00.000Z',
            reason: null,
            by: { kind: 'CUSTOMER', name: 'João Silva' },
          },
        })}
      />,
    );
    expect(screen.getByText('João Silva (cliente)')).toBeInTheDocument();
    expect(screen.queryByText('Motivo')).not.toBeInTheDocument();
  });

  it('shows the rejection card with the reason the business gave', () => {
    renderWithIntl(
      <StaffBookingExtras
        booking={makeBooking({
          status: 'REJECTED',
          rejection: {
            at: '2026-06-15T20:20:00.000Z',
            reason: 'Não atendemos esse tipo de veículo.',
            by: { kind: 'STAFF', name: 'Ana Pereira' },
          },
        })}
      />,
    );

    expect(screen.getByText('Rejeição')).toBeInTheDocument();
    expect(screen.getByText('Não atendemos esse tipo de veículo.')).toBeInTheDocument();
  });

  it('keeps the resource and itinerary cards for a cancelled booking', () => {
    renderWithIntl(
      <StaffBookingExtras
        booking={makeBooking({
          status: 'CANCELLED',
          resources: [
            {
              lineId: 'l-1',
              serviceName: 'Sala',
              resourceType: 'ROOM',
              resourceName: 'Sala Aurora',
              origin: 'CUSTOMER_CHOICE',
              quantity: null,
            },
          ],
          itinerary: [
            {
              lineId: 'l-1',
              serviceName: 'Passeio',
              legIndex: 0,
              legName: 'Ida',
              resourceType: 'EQUIPMENT',
              resourceName: 'Van 2',
              startsAt: null,
              endsAt: null,
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('booking-resources-card')).toBeInTheDocument();
    expect(screen.getByTestId('booking-itinerary-card')).toBeInTheDocument();
  });
});
