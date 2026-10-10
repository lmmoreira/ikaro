// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NoShowSheet } from './NoShowSheet';

function renderSheet(overrides: Partial<Parameters<typeof NoShowSheet>[0]> = {}) {
  const props = {
    open: true,
    isSubmitting: false,
    contactName: 'João Silva',
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  renderWithIntl(<NoShowSheet {...props} />);
  return props;
}

describe('NoShowSheet', () => {
  it('renders nothing while closed', () => {
    renderSheet({ open: false });

    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
  });

  it('names the customer and states that no points are awarded', () => {
    renderSheet();

    expect(screen.getByText(/João Silva vai receber um email/)).toBeInTheDocument();
    expect(screen.getByText(/Nenhum ponto de fidelidade será concedido/)).toBeInTheDocument();
  });

  it('submits without a reason, as undefined, and closes', async () => {
    const user = userEvent.setup();
    const props = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Confirmar não comparecimento' }));

    expect(props.onSubmit).toHaveBeenCalledWith(undefined);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('submits the trimmed reason', async () => {
    const user = userEvent.setup();
    const props = renderSheet();

    await user.type(screen.getByRole('textbox'), '  Cliente não atendeu o telefone.  ');
    await user.click(screen.getByRole('button', { name: 'Confirmar não comparecimento' }));

    expect(props.onSubmit).toHaveBeenCalledWith('Cliente não atendeu o telefone.');
  });

  it('caps the reason at 500 characters', () => {
    renderSheet();

    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '500');
  });

  it('shows the running character count', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByRole('textbox'), 'abc');

    expect(screen.getByText('3 / 500')).toBeInTheDocument();
  });

  it('disables the confirm button while submitting', () => {
    renderSheet({ isSubmitting: true });

    expect(screen.getByRole('button', { name: 'Confirmar não comparecimento' })).toBeDisabled();
  });

  it('closes without submitting when the user cancels', async () => {
    const user = userEvent.setup();
    const props = renderSheet();

    await user.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);

    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
