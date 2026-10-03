// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { IntakeAttendeesList } from './IntakeAttendeesList';

describe('IntakeAttendeesList', () => {
  it('renders no row and no error when there are no attendees (no minimum)', () => {
    renderWithIntl(<IntakeAttendeesList attendees={[]} hasError={false} onChange={vi.fn()} />);

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Adicionar participante' })).toBeInTheDocument();
  });

  it('adds a blank row', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<IntakeAttendeesList attendees={[]} hasError={false} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Adicionar participante' }));

    expect(onChange).toHaveBeenCalledWith([{ id: expect.any(String), name: '', isMinor: false }]);
  });

  it('edits the name and the minor flag of a row', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <IntakeAttendeesList
        attendees={[{ id: 'r6', name: 'Ana', isMinor: false }]}
        hasError={false}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('Nome do participante 1'), 'b');
    await user.click(screen.getByRole('checkbox', { name: 'Menor de idade' }));

    expect(onChange).toHaveBeenNthCalledWith(1, [{ id: 'r6', name: 'Anab', isMinor: false }]);
    expect(onChange).toHaveBeenNthCalledWith(2, [{ id: 'r6', name: 'Ana', isMinor: true }]);
  });

  it('removes a row', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <IntakeAttendeesList
        attendees={[
          { id: 'r9', name: 'Ana', isMinor: false },
          { id: 'r10', name: 'Bia', isMinor: true },
        ]}
        hasError={false}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remover participante 1' }));

    expect(onChange).toHaveBeenCalledWith([{ id: 'r10', name: 'Bia', isMinor: true }]);
  });

  it('shows the blank-name error', () => {
    renderWithIntl(
      <IntakeAttendeesList
        attendees={[{ id: 'r12', name: ' ', isMinor: false }]}
        hasError
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('intake-field-error-attendees')).toHaveTextContent(
      'Informe o nome do participante.',
    );
  });
});
