// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RecurringApprovalActions } from './RecurringApprovalActions';

function props(overrides: Partial<Parameters<typeof RecurringApprovalActions>[0]> = {}) {
  return {
    backHref: '/dashboard/bookings',
    canDecide: true,
    canApprove: true,
    isRetry: false,
    isSubmitting: false,
    settledNote: 'Este pedido não tem mais ações disponíveis.',
    onApprove: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };
}

describe('RecurringApprovalActions', () => {
  it('offers approve and reject on a pending request, and the way back to the Agenda', async () => {
    const user = userEvent.setup();
    const actions = props();
    renderWithIntl(<RecurringApprovalActions {...actions} />);

    await user.click(screen.getByRole('button', { name: 'Aprovar recorrência' }));
    await user.click(screen.getByRole('button', { name: 'Recusar' }));

    expect(actions.onApprove).toHaveBeenCalledTimes(1);
    expect(actions.onReject).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
    expect(screen.getByText(/Uma única decisão/)).toBeInTheDocument();
  });

  it('reads "Tentar aprovar de novo" after a refused approval', () => {
    renderWithIntl(<RecurringApprovalActions {...props({ isRetry: true })} />);

    expect(screen.getByRole('button', { name: 'Tentar aprovar de novo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar recorrência' })).not.toBeInTheDocument();
  });

  it('leaves only "Recusar" when approving can no longer work (every date passed, service changed)', () => {
    renderWithIntl(<RecurringApprovalActions {...props({ canApprove: false })} />);

    expect(
      screen.queryByRole('button', { name: /Aprovar|Tentar aprovar/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument();
  });

  it('disables both decisions while one is in flight', () => {
    renderWithIntl(<RecurringApprovalActions {...props({ isSubmitting: true })} />);

    expect(screen.getByRole('button', { name: 'Aprovar recorrência' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeDisabled();
  });

  it('shows only the note and the way back once the request is settled', () => {
    renderWithIntl(<RecurringApprovalActions {...props({ canDecide: false })} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Este pedido não tem mais ações disponíveis.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
  });
});
