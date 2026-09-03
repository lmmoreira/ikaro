// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { WeekDayRow } from './week-day-row';

function baseProps() {
  return {
    day: 'monday' as const,
    label: 'Segunda',
    value: { open: '08:00', close: '18:00', closed: false },
    timeFormat: '24h' as const,
    closedLabel: 'Fechado',
    opensAtLabel: 'Abre às',
    closesAtLabel: 'Fecha às',
    hourLabel: 'Hora',
    minuteLabel: 'Minuto',
    periodLabel: 'Período',
    onChange: vi.fn(),
  };
}

describe('WeekDayRow', () => {
  it('calls onChange when the closed checkbox is toggled', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<WeekDayRow {...props} />);

    await user.click(screen.getByRole('checkbox', { name: /Fechado — Segunda/ }));
    expect(props.onChange).toHaveBeenCalledWith('monday', { closed: true });
  });

  it('renders the copy-to-weekdays button only when both props are provided', () => {
    const { rerender } = renderWithIntl(<WeekDayRow {...baseProps()} />);
    expect(screen.queryByTestId('day-copy-monday')).not.toBeInTheDocument();

    const onCopyToWeekdays = vi.fn();
    rerender(
      <WeekDayRow
        {...baseProps()}
        copyToWeekdaysLabel="Copiar para dias úteis"
        onCopyToWeekdays={onCopyToWeekdays}
      />,
    );
    expect(screen.getByTestId('day-copy-monday')).toHaveTextContent('Copiar para dias úteis');
  });
});
