// @vitest-environment jsdom
import { createRef } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntlInFloatingFilterDock } from '@/test-utils';
import type { AgendaFilterOption } from '@/features/booking/schedule/agenda-preferences';
import { AgendaFilterMenu } from './AgendaFilterMenu';

function baseProps(hidden: AgendaFilterOption[] = []) {
  return {
    containerRef: createRef<HTMLDivElement>(),
    open: true,
    onToggleOpen: vi.fn(),
    hiddenOptions: new Set<AgendaFilterOption>(hidden),
    counts: { bookings: 4, recurrences: 1, today: 2, upcoming: 3 },
    onToggleOption: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('AgendaFilterMenu', () => {
  it('shows the trigger only while closed', () => {
    renderWithIntlInFloatingFilterDock(<AgendaFilterMenu {...baseProps()} open={false} />);

    expect(screen.getByRole('button', { name: 'Filtrar agenda' })).toBeInTheDocument();
    expect(screen.queryByText('Mostrar na agenda')).not.toBeInTheDocument();
  });

  it('lists the four blocks in their two groups, all ticked by default, each with its count', () => {
    renderWithIntlInFloatingFilterDock(<AgendaFilterMenu {...baseProps()} />);

    expect(screen.getByText('Precisa de ação')).toBeInTheDocument();
    expect(screen.getByText('Confirmados')).toBeInTheDocument();
    for (const [name, count] of [
      ['Agendamentos', '4'],
      ['Recorrências', '1'],
      ['Hoje', '2'],
      ['Próximos dias', '3'],
    ] as const) {
      const checkbox = screen.getByRole('checkbox', { name: new RegExp(name) });
      expect(checkbox).toBeChecked();
      expect(checkbox.closest('label')).toHaveTextContent(count);
    }
  });

  it('unticks the options the user hid', () => {
    renderWithIntlInFloatingFilterDock(
      <AgendaFilterMenu {...baseProps(['recurrences', 'upcoming'])} />,
    );

    expect(screen.getByRole('checkbox', { name: /Recorrências/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Próximos dias/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Agendamentos/ })).toBeChecked();
  });

  it('reports which option was toggled', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntlInFloatingFilterDock(<AgendaFilterMenu {...props} />);

    await user.click(screen.getByRole('checkbox', { name: /Recorrências/ }));
    await user.click(screen.getByRole('checkbox', { name: /Hoje/ }));

    expect(props.onToggleOption).toHaveBeenNthCalledWith(1, 'recurrences');
    expect(props.onToggleOption).toHaveBeenNthCalledWith(2, 'today');
  });

  it('badges the trigger with how many options are hidden, and not at all when none are', () => {
    const { rerender } = renderWithIntlInFloatingFilterDock(
      <AgendaFilterMenu {...baseProps()} open={false} />,
    );
    expect(screen.queryByTestId('floating-filter-hidden-count')).not.toBeInTheDocument();

    rerender(<AgendaFilterMenu {...baseProps(['today', 'upcoming'])} open={false} />);
    expect(screen.getByTestId('floating-filter-hidden-count')).toHaveTextContent('2');
    expect(screen.getByLabelText('2 opções ocultas')).toBeInTheDocument();
  });

  it('resets with "Padrão" and closes with "Fechar"', async () => {
    const user = userEvent.setup();
    const props = baseProps(['today']);
    renderWithIntlInFloatingFilterDock(<AgendaFilterMenu {...props} />);

    await user.click(screen.getByRole('button', { name: 'Padrão' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(props.onReset).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
