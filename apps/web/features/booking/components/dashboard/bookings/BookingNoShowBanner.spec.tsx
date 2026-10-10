// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import {
  BookingNoShowBanner,
  isBookingNoShowActionState,
  type BookingNoShowActionState,
} from './BookingNoShowBanner';

const booking = {
  contactName: 'João Silva',
  lines: [{ serviceName: 'Lavagem Simples' }, { serviceName: 'Cera' }],
} as unknown as StaffBookingDetailResponse;

function renderBanner(
  actionState: BookingNoShowActionState,
  overrides: Partial<Parameters<typeof BookingNoShowBanner>[0]> = {},
) {
  const props = {
    actionState,
    booking,
    noShowEndLabel: '17:30',
    correctionPoints: 12,
    onRefresh: vi.fn(),
    onRetryNoShow: vi.fn(),
    onRetryCorrect: vi.fn(),
    ...overrides,
  };
  renderWithIntl(<BookingNoShowBanner {...props} />);
  return props;
}

describe('BookingNoShowBanner', () => {
  it('marks the booking as no-show and says the customer was emailed and got no points', () => {
    renderBanner('no-show');

    expect(screen.getByTestId('booking-no-show-marked')).toBeInTheDocument();
    expect(screen.getByText('Marcado como não compareceu')).toBeInTheDocument();
    expect(
      screen.getByText(
        'João Silva foi avisado por email. Nenhum ponto de fidelidade foi concedido.',
      ),
    ).toBeInTheDocument();
  });

  it('names the end time in the not-yet-ended banner', () => {
    renderBanner('no-show-not-ended');

    expect(screen.getByText('Ainda não é possível marcar não compareceu')).toBeInTheDocument();
    expect(screen.getByText(/O atendimento termina às 17:30/)).toBeInTheDocument();
  });

  it('offers a refresh on the already-closed banner and says nothing was changed', async () => {
    const user = userEvent.setup();
    const props = renderBanner('no-show-terminal');

    expect(screen.getByText('Este agendamento já foi encerrado')).toBeInTheDocument();
    expect(screen.getByText(/Nada foi alterado por você/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('offers a retry on the no-show failure banner and says nothing was changed', async () => {
    const user = userEvent.setup();
    const props = renderBanner('no-show-error');

    expect(screen.getByText('Não foi possível registrar o não comparecimento')).toBeInTheDocument();
    expect(screen.getByText(/Nada foi alterado\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(props.onRetryNoShow).toHaveBeenCalledTimes(1);
  });

  it('names the points and services awarded by a correction', () => {
    renderBanner('corrected');

    expect(screen.getByText('Corrigido para concluído')).toBeInTheDocument();
    expect(
      screen.getByText(
        'João Silva recebeu 12 pontos de fidelidade (Lavagem Simples, Cera). A correção ficou registrada no histórico.',
      ),
    ).toBeInTheDocument();
  });

  it('omits the points from the correction banner for a guest booking', () => {
    renderBanner('corrected', { correctionPoints: null });

    expect(screen.getByText('A correção ficou registrada no histórico.')).toBeInTheDocument();
    expect(screen.queryByText(/pontos de fidelidade/)).not.toBeInTheDocument();
  });

  it('explains that only managers can correct on a 403, with no retry', () => {
    renderBanner('correct-forbidden');

    expect(screen.getByText('Somente gerentes podem corrigir')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a retry on the correction failure banner', async () => {
    const user = userEvent.setup();
    const props = renderBanner('correct-error');

    expect(screen.getByText('Não foi possível corrigir')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(props.onRetryCorrect).toHaveBeenCalledTimes(1);
  });
});

describe('isBookingNoShowActionState', () => {
  it.each([
    'no-show',
    'no-show-terminal',
    'no-show-not-ended',
    'no-show-error',
    'corrected',
    'correct-error',
    'correct-forbidden',
  ])('recognises %s', (state) => {
    expect(isBookingNoShowActionState(state)).toBe(true);
  });

  it.each(['idle', 'submitting', 'approved', 'cancelled', 'slot-conflict'])(
    'does not claim %s',
    (state) => {
      expect(isBookingNoShowActionState(state)).toBe(false);
    },
  );
});
