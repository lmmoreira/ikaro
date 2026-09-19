// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiscardChangesDialog } from './DiscardChangesDialog';

function renderDialog(overrides: Partial<Parameters<typeof DiscardChangesDialog>[0]> = {}) {
  const props = {
    open: true,
    title: 'Descartar alterações?',
    description: 'Você tem alterações não salvas.',
    keepEditingLabel: 'Continuar editando',
    discardLabel: 'Descartar alterações',
    onConfirmDiscard: vi.fn(),
    onCancel: vi.fn(),
    confirmTestId: 'discard-confirm',
    ...overrides,
  };
  render(<DiscardChangesDialog {...props} />);
  return props;
}

describe('DiscardChangesDialog', () => {
  it('renders the caller-provided copy when open', () => {
    renderDialog();

    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument();
    expect(screen.getByText('Você tem alterações não salvas.')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByText('Descartar alterações?')).not.toBeInTheDocument();
  });

  it('calls onCancel, not onConfirmDiscard, on "Continuar editando"', async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirmDiscard).not.toHaveBeenCalled();
  });

  it('calls onConfirmDiscard from the destructive action', async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByTestId('discard-confirm'));

    expect(props.onConfirmDiscard).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when dismissed with Escape', async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.keyboard('{Escape}');

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
