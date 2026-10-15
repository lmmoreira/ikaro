// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { makeSchedulingException } from './scheduling-exception.fixtures';
import { ReassignSheet } from './ReassignSheet';

const box = (id: string, name: string) => ({ resourceId: id, resourceName: name });

const items = [
  makeSchedulingException({ id: 'a', alternatives: [box('r1', 'Box 1'), box('r3', 'Box 3')] }),
  makeSchedulingException({ id: 'b', alternatives: [box('r1', 'Box 1')] }),
];

function renderSheet(overrides: Partial<React.ComponentProps<typeof ReassignSheet>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  renderWithIntl(
    <ReassignSheet
      open
      items={items}
      isSubmitting={false}
      error={null}
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit, onClose };
}

describe('ReassignSheet', () => {
  it('renders nothing while closed', () => {
    renderSheet({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('titles the sheet with the number of bookings and submits with the same count', () => {
    renderSheet();

    expect(screen.getByRole('dialog', { name: 'Reatribuir 2 reservas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reatribuir 2 reservas' })).toBeInTheDocument();
  });

  it('defaults to "Qualquer recurso livre" and sends { mode: AUTO }', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    expect(screen.getByRole('radio', { name: /Qualquer recurso livre/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Reatribuir 2 reservas' }));

    expect(onSubmit).toHaveBeenCalledWith({ target: { mode: 'AUTO' }, reason: undefined });
  });

  it('lists the stored alternatives with how many of the selected bookings each is free for', () => {
    renderSheet();

    expect(screen.getByRole('radio', { name: /Box 1/ })).toBeInTheDocument();
    expect(screen.getByText('Livre em 2 de 2 reservas')).toBeInTheDocument();
    expect(screen.getByText('Livre em 1 de 2 reservas')).toBeInTheDocument();
  });

  it('sends the chosen resource and the trimmed reason', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole('radio', { name: /Box 3/ }));
    await user.type(screen.getByRole('textbox'), '  Box 2 em manutenção  ');
    await user.click(screen.getByRole('button', { name: 'Reatribuir 2 reservas' }));

    expect(onSubmit).toHaveBeenCalledWith({
      target: { resourceId: 'r3' },
      reason: 'Box 2 em manutenção',
    });
  });

  it('offers only "any free resource" when no entry has an alternative', () => {
    renderSheet({ items: [makeSchedulingException({ alternatives: [] })] });

    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Reatribuir 1 reserva' })).toBeInTheDocument();
  });

  it('shows the inline error and disables submit while sending', () => {
    renderSheet({ error: 'Nenhuma reserva foi alterada.', isSubmitting: true });

    expect(screen.getByTestId('action-sheet-error')).toHaveTextContent(
      'Nenhuma reserva foi alterada.',
    );
    expect(screen.getByRole('button', { name: 'Reatribuir 2 reservas' })).toBeDisabled();
  });

  it('closes from Voltar', async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await user.click(screen.getAllByRole('button', { name: 'Voltar' })[0]);

    expect(onClose).toHaveBeenCalled();
  });
});
