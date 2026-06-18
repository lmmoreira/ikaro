// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AvailableSlot, HotsiteServiceResponse } from '@ikaro/types';
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

    render(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="idle"
        errorMessage={null}
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

    render(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="idle"
        errorMessage={null}
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

    render(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="idle"
        errorMessage={null}
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('shows a submitting state and disables both buttons', () => {
    const service = makeService();

    render(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="submitting"
        errorMessage={null}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
  });

  it('shows the error message when status is "error"', () => {
    const service = makeService();

    render(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="error"
        errorMessage="Horário indisponível, escolha outro"
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

    render(
      <ConfirmationStep
        slug="lavacar-beloauto"
        services={[service]}
        selectedServiceIds={[service.id]}
        selectedDate="2026-06-15"
        selectedSlot={slot}
        status="success"
        errorMessage={null}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId('booking-success')).toHaveTextContent(
      'Solicitação enviada! Aguarde a confirmação por email.',
    );
    expect(screen.queryByRole('button', { name: 'Confirmar agendamento' })).not.toBeInTheDocument();
  });
});
