// @vitest-environment jsdom
import { renderWithIntl, hotsiteServiceBookingDefaults } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AvailableSlot, BookingResponse, HotsiteServiceResponse } from '@ikaro/types';
import { ConfirmationStep } from './ConfirmationStep';

function makeService(overrides?: Partial<HotsiteServiceResponse>): HotsiteServiceResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Lavagem Completa',
    description: 'Lavagem externa e interna',
    price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...hotsiteServiceBookingDefaults,
    ...overrides,
  };
}

const slot: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  endsAt: '2026-06-15T13:00:00.000Z',
};

describe('ConfirmationStep', () => {
  it('renders the selected services, total and chosen date/time', () => {
    const service = makeService();

    renderWithIntl(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="idle"
        errorMessage={null}
        booking={null}
        picks={[]}
        requirements={[]}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 150,00 — 1h')).toBeInTheDocument();
    expect(screen.getByText('Segunda-feira, 15 de junho às 09:00')).toBeInTheDocument();
  });

  it('calls onBack when the "Voltar" button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const service = makeService();

    renderWithIntl(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="idle"
        errorMessage={null}
        booking={null}
        picks={[]}
        requirements={[]}
        onSubmit={vi.fn()}
        onBack={onBack}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onBack).toHaveBeenCalled();
  });

  it('calls onSubmit when "Confirmar agendamento" is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const service = makeService();

    renderWithIntl(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="idle"
        errorMessage={null}
        booking={null}
        picks={[]}
        requirements={[]}
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('shows a submitting state and disables both buttons', () => {
    const service = makeService();

    renderWithIntl(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="submitting"
        errorMessage={null}
        booking={null}
        picks={[]}
        requirements={[]}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
  });

  it('shows the error message when status is "error"', () => {
    const service = makeService();

    renderWithIntl(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="error"
        errorMessage="Horário indisponível, escolha outro"
        booking={null}
        picks={[]}
        requirements={[]}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId('confirmation-error')).toHaveTextContent(
      'Horário indisponível, escolha outro',
    );
  });

  it('shows the success message and hides the form when status is "success"', () => {
    const service = makeService();

    renderWithIntl(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="success"
        errorMessage={null}
        booking={null}
        picks={[]}
        requirements={[]}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId('booking-success')).toHaveTextContent(
      'Aguarde a confirmação por email.',
    );
    expect(screen.queryByRole('button', { name: 'Confirmar agendamento' })).not.toBeInTheDocument();
  });

  describe('on success with the created booking', () => {
    const service = makeService();
    const booking: BookingResponse = {
      bookingId: 'b-1',
      status: 'PENDING',
      scheduledAt: slot.startsAt,
      totalPrice: { amount: 150, currency: 'BRL' },
      totalDurationMins: 60,
      pickupAddress: null,
      beforeServicePhotoUrls: [],
      lines: [
        {
          lineId: 'l-1',
          serviceId: service.id,
          priceAtBooking: { amount: 150, currency: 'BRL' },
          durationMinsAtBooking: 60,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: false,
        },
      ],
    };

    function renderSuccess() {
      return renderWithIntl(
        <ConfirmationStep
          slug="lavacar-beloauto"
          services={[service]}
          selectedServiceIds={[service.id]}
          selectedDate="2026-06-15"
          selectedSlot={slot}
          status="success"
          errorMessage={null}
          booking={booking}
          picks={[]}
          requirements={[]}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );
    }

    it('keeps the unchanged message and the back link around the details box', () => {
      renderSuccess();

      expect(screen.getByRole('heading', { name: 'Solicitação enviada!' })).toBeInTheDocument();
      expect(screen.getByTestId('booking-success')).toBeInTheDocument();
      expect(screen.getByTestId('booking-submitted-details')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar para o site' })).toHaveAttribute(
        'href',
        '/lavacar-beloauto',
      );
    });
  });

  it('shows "a partir de" in the total of a per-time service', () => {
    const perTime = makeService({
      bookingPolicy: {
        ...hotsiteServiceBookingDefaults.bookingPolicy,
        durationPolicy: 'CUSTOMER_SELECTED',
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
      },
    });
    renderWithIntl(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[perTime]}
        selectedServiceIds={[perTime.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="idle"
        errorMessage={null}
        booking={null}
        picks={[]}
        requirements={[]}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Total: a partir de R$ 50,00 — duração a escolher'),
    ).toBeInTheDocument();
  });
});
