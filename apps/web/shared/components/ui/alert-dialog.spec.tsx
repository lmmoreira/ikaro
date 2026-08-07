// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

function renderDialog(open: boolean, onAction = vi.fn(), onOpenChange = vi.fn()) {
  renderWithIntl(
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Título</AlertDialogTitle>
          <AlertDialogDescription>Descrição</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onAction}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  );
  return { onAction, onOpenChange };
}

describe('AlertDialog', () => {
  it('renders its content when open', () => {
    renderDialog(true);

    expect(screen.getByText('Título')).toBeInTheDocument();
    expect(screen.getByText('Descrição')).toBeInTheDocument();
  });

  it('does not render its content when closed', () => {
    renderDialog(false);

    expect(screen.queryByText('Título')).not.toBeInTheDocument();
  });

  it('calls the action handler when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const { onAction } = renderDialog(true);

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenChange(false) when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog(true);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
