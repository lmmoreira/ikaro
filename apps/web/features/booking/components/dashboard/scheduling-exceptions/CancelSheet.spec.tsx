// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { CancelSheet } from './CancelSheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof CancelSheet>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  renderWithIntl(
    <CancelSheet
      open
      count={2}
      isSubmitting={false}
      error={null}
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit, onClose };
}

describe('CancelSheet', () => {
  it('renders nothing while closed', () => {
    renderSheet({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation with the count and warns it cannot be undone', () => {
    renderSheet();

    expect(screen.getByText('Cancelar 2 reservas?')).toBeInTheDocument();
    expect(screen.getByText(/Isso não pode ser desfeito/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar 2 reservas' })).toBeInTheDocument();
  });

  it('uses the singular for one booking', () => {
    renderSheet({ count: 1 });

    expect(screen.getByText('Cancelar 1 reserva?')).toBeInTheDocument();
  });

  it('submits without a reason when none is typed', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Cancelar 2 reservas' }));

    expect(onSubmit).toHaveBeenCalledWith({ reason: undefined });
  });

  it('submits the trimmed reason', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.type(screen.getByRole('textbox'), '  Box 2 desativado  ');
    await user.click(screen.getByRole('button', { name: 'Cancelar 2 reservas' }));

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'Box 2 desativado' });
  });

  it('shows the inline error and disables submit while sending', () => {
    renderSheet({ error: 'Algo deu errado.', isSubmitting: true });

    expect(screen.getByTestId('action-sheet-error')).toHaveTextContent('Algo deu errado.');
    expect(screen.getByRole('button', { name: 'Cancelar 2 reservas' })).toBeDisabled();
  });
});
