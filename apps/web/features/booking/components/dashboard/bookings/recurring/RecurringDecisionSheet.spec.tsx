// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RecurringDecisionSheet } from './RecurringDecisionSheet';

const SUMMARY = 'As reservas de Ana Costa serão criadas de uma vez.';

function props(overrides: Partial<Parameters<typeof RecurringDecisionSheet>[0]> = {}) {
  return {
    kind: 'approve' as const,
    open: true,
    summary: SUMMARY,
    isSubmitting: false,
    onClose: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('RecurringDecisionSheet', () => {
  it('renders nothing while closed', () => {
    renderWithIntl(<RecurringDecisionSheet {...props({ open: false })} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks to confirm the approval, with the request-specific summary and no fields', () => {
    renderWithIntl(<RecurringDecisionSheet {...props()} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Aprovar recorrência')).toBeInTheDocument();
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeInTheDocument();
    // The reject endpoint takes no body, and neither does approve: nothing to type.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('asks to confirm the rejection, with no reason field', () => {
    renderWithIntl(<RecurringDecisionSheet {...props({ kind: 'reject' })} />);

    expect(screen.getByText('Recusar recorrência')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar recusa' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('confirms once on submit', async () => {
    const user = userEvent.setup();
    const sheet = props();
    renderWithIntl(<RecurringDecisionSheet {...sheet} />);

    await user.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

    expect(sheet.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('goes back without deciding', async () => {
    const user = userEvent.setup();
    const sheet = props();
    renderWithIntl(<RecurringDecisionSheet {...sheet} />);

    await user.click(screen.getAllByRole('button', { name: 'Voltar' })[0]!);

    expect(sheet.onClose).toHaveBeenCalled();
    expect(sheet.onConfirm).not.toHaveBeenCalled();
  });

  it('disables the confirm button and says "Enviando…" while the decision is in flight', () => {
    renderWithIntl(<RecurringDecisionSheet {...props({ isSubmitting: true })} />);

    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Confirmar aprovação' })).not.toBeInTheDocument();
  });
});
