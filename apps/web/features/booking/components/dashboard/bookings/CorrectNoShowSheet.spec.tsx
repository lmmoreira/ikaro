// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { CorrectNoShowSheet } from './CorrectNoShowSheet';

function renderSheet(overrides: Partial<Parameters<typeof CorrectNoShowSheet>[0]> = {}) {
  const props = {
    open: true,
    isSubmitting: false,
    contactName: 'João Silva',
    points: 12,
    services: 'Lavagem Simples',
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  renderWithIntl(<CorrectNoShowSheet {...props} />);
  return props;
}

const CONFIRM = 'Confirmar correção';

describe('CorrectNoShowSheet', () => {
  it('renders nothing while closed', () => {
    renderSheet({ open: false });

    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
  });

  it('names the points and services the correction awards', () => {
    renderSheet();

    expect(
      screen.getByText(/recebe 12 pontos de fidelidade \(Lavagem Simples\)/),
    ).toBeInTheDocument();
  });

  it('omits the points for a guest booking', () => {
    renderSheet({ points: null });

    expect(screen.getByText(/volta a constar como atendido\. A correção/)).toBeInTheDocument();
    expect(screen.queryByText(/pontos de fidelidade/)).not.toBeInTheDocument();
  });

  it('keeps confirm disabled until the trimmed reason has at least 10 characters', async () => {
    const user = userEvent.setup();
    renderSheet();
    const confirm = screen.getByRole('button', { name: CONFIRM });

    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '         123456789         ');
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '0');
    expect(confirm).toBeEnabled();
  });

  it('shows the trimmed length against the minimum', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByRole('textbox'), '  abcde  ');

    expect(screen.getByText('5/500 · mínimo de 10 caracteres')).toBeInTheDocument();
  });

  it('caps the reason at 500 characters', () => {
    renderSheet();

    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '500');
  });

  it('submits the trimmed reason and closes', async () => {
    const user = userEvent.setup();
    const props = renderSheet();

    await user.type(screen.getByRole('textbox'), '  Cliente chegou atrasado e foi atendido.  ');
    await user.click(screen.getByRole('button', { name: CONFIRM }));

    expect(props.onSubmit).toHaveBeenCalledWith('Cliente chegou atrasado e foi atendido.');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('disables confirm while submitting even with a valid reason', async () => {
    const user = userEvent.setup();
    renderSheet({ isSubmitting: true });

    await user.type(screen.getByRole('textbox'), 'Cliente chegou atrasado.');

    expect(screen.getByRole('button', { name: CONFIRM })).toBeDisabled();
  });
});
