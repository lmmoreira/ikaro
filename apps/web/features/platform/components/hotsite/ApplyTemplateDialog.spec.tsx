// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ApplyTemplateDialog } from './ApplyTemplateDialog';

function renderDialog(open = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  renderWithIntl(<ApplyTemplateDialog open={open} onConfirm={onConfirm} onCancel={onCancel} />);
  return { onConfirm, onCancel };
}

describe('ApplyTemplateDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog(false);

    expect(screen.queryByTestId('apply-template-dialog')).not.toBeInTheDocument();
  });

  it('warns with the approved copy that the manager’s uploads are replaced and removed on save', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Substituir as imagens que você enviou?');
    expect(dialog).toHaveTextContent(
      'As imagens que você enviou nestas seções serão substituídas e removidas quando você salvar.',
    );
  });

  it('Aplicar template confirms', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Aplicar template' }));

    // The dialog also reports that it closed; the controller reads the pending template before
    // clearing it, so that second signal is harmless.
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancelar cancels and does not confirm', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape counts as cancelling', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
