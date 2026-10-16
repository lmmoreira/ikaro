// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { CustomerBookingExtras } from './CustomerBookingExtras';

function makeBooking(
  overrides?: Partial<CustomerBookingDetailResponse>,
): CustomerBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'APPROVED',
    scheduledAt: '2026-06-16T13:00:00.000Z',
    lines: [],
    totalPrice: { amount: 60, currency: 'BRL' },
    notes: null,
    pickupAddress: null,
    resources: [],
    itinerary: [],
    participantCount: null,
    attendees: [],
    intake: null,
    recurringScheduleId: null,
    cancellation: null,
    rejection: null,
    cancellableUntil: null,
    reschedule: null,
    infoRequestMessage: null,
    infoResponseMessage: null,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    completedAt: null,
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    pointsEarned: null,
    ...overrides,
  };
}

const AT = '2026-06-16T11:40:00.000Z';

describe('CustomerBookingExtras', () => {
  it('renders nothing for a plain booking', () => {
    renderWithIntl(<CustomerBookingExtras booking={makeBooking()} tenantSlug="beloauto" />);

    expect(screen.queryByTestId(/booking-.*-card/)).not.toBeInTheDocument();
  });

  it('shows the customer-visible cards and links the recurrence under the tenant slug', () => {
    renderWithIntl(
      <CustomerBookingExtras
        booking={makeBooking({
          participantCount: 2,
          attendees: [{ name: 'Maria', isMinor: false }],
          recurringScheduleId: 's-1',
          intake: {
            schemaVersion: 1,
            answers: [{ fieldKey: 'plate', label: 'Placa', type: 'FREE_TEXT', value: 'ABC1D23' }],
            consentAcceptedAt: null,
          },
        })}
        tenantSlug="beloauto"
      />,
    );

    expect(screen.getByTestId('booking-participants-card')).toBeInTheDocument();
    expect(screen.getByText('Suas respostas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver recorrência' })).toHaveAttribute(
      'href',
      '/beloauto/my-account/recurring-schedules/s-1',
    );
  });

  it('never shows a creator or request-time row to the customer', () => {
    renderWithIntl(
      <CustomerBookingExtras
        booking={makeBooking({ recurringScheduleId: 's-1' })}
        tenantSlug="beloauto"
      />,
    );

    expect(screen.queryByText('Criado por')).not.toBeInTheDocument();
    expect(screen.queryByText('Solicitado em')).not.toBeInTheDocument();
  });

  it('words a customer cancel as "Você" with no reason row', () => {
    renderWithIntl(
      <CustomerBookingExtras
        booking={makeBooking({
          status: 'CANCELLED',
          cancellation: { at: AT, byCustomer: true, reason: null },
        })}
        tenantSlug="beloauto"
      />,
    );

    expect(screen.getByText('Cancelado por')).toBeInTheDocument();
    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.queryByText('Motivo')).not.toBeInTheDocument();
  });

  it('words an establishment cancel as "O estabelecimento" and shows its reason', () => {
    renderWithIntl(
      <CustomerBookingExtras
        booking={makeBooking({
          status: 'CANCELLED',
          cancellation: { at: AT, byCustomer: false, reason: 'Equipamento em manutenção.' },
        })}
        tenantSlug="beloauto"
      />,
    );

    expect(screen.getByText('O estabelecimento')).toBeInTheDocument();
    expect(screen.getByText('Equipamento em manutenção.')).toBeInTheDocument();
  });

  it('shows a rejection as "Recusa" with the reason the business gave', () => {
    renderWithIntl(
      <CustomerBookingExtras
        booking={makeBooking({
          status: 'REJECTED',
          rejection: { at: AT, reason: 'Não atendemos esse tipo de veículo.' },
        })}
        tenantSlug="beloauto"
      />,
    );

    expect(screen.getByText('Recusa')).toBeInTheDocument();
    expect(screen.getByText('Não atendemos esse tipo de veículo.')).toBeInTheDocument();
  });

  it('keeps the resources of a cancelled booking', () => {
    renderWithIntl(
      <CustomerBookingExtras
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
        })}
        tenantSlug="beloauto"
      />,
    );

    expect(screen.getByText('Sala Aurora')).toBeInTheDocument();
  });
});
