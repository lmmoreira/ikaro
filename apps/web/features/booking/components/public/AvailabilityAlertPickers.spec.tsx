// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { DateTimeField, ExpirySelect, TimeField } from './AvailabilityAlertPickers';

// Only `Date` is faked, so the calendar opens on a known month while userEvent and the Radix
// popper keep their real timers. 15:00Z is 12:00 in the pt-BR tenant zone (America/Sao_Paulo),
// so "today" is 2026-10-06 on the tenant's calendar.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-06T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function clickDay(isoDate: string): void {
  const cell = document.querySelector(`[data-day="${isoDate}"] button`);
  if (!cell) throw new Error(`day cell for ${isoDate} not found`);
  fireEvent.click(cell);
}

function renderDateTime(overrides: Partial<React.ComponentProps<typeof DateTimeField>> = {}) {
  const props = {
    rowKey: 'rangeFrom' as const,
    labelKey: 'range.from' as const,
    date: '',
    time: '09:00',
    disabled: false,
    error: null,
    onDateChange: vi.fn(),
    onTimeChange: vi.fn(),
    ...overrides,
  };
  renderWithIntl(<DateTimeField {...props} />);
  return props;
}

describe('DateTimeField — the day', () => {
  it('shows a placeholder until a day is picked, and names its field', () => {
    renderDateTime();

    const trigger = screen.getByTestId('alert-date');
    expect(trigger).toHaveTextContent('Escolha a data');
    expect(trigger).toHaveAccessibleName('De');
    expect(trigger).toHaveAttribute('data-row-key', 'rangeFrom');
  });

  it('shows the picked day written out in full', () => {
    renderDateTime({ date: '2026-10-20' });

    expect(screen.getByTestId('alert-date')).toHaveTextContent('Terça-feira, 20 de outubro');
  });

  it('opens a calendar popover, reports the picked day and closes', async () => {
    const props = renderDateTime();

    await userEvent.click(screen.getByTestId('alert-date'));
    clickDay('2026-10-20');

    expect(props.onDateChange).toHaveBeenCalledWith('2026-10-20');
    expect(document.querySelector('[data-day="2026-10-20"]')).not.toBeInTheDocument();
  });

  it('shows two months, so a day in the next month needs no navigation', async () => {
    const props = renderDateTime();

    await userEvent.click(screen.getByTestId('alert-date'));
    clickDay('2026-11-03');

    expect(props.onDateChange).toHaveBeenCalledWith('2026-11-03');
  });

  it('does not offer days before today on the tenant calendar', async () => {
    renderDateTime();

    await userEvent.click(screen.getByTestId('alert-date'));

    expect(document.querySelector('[data-day="2026-10-05"] button')).toBeDisabled();
    expect(document.querySelector('[data-day="2026-10-06"] button')).toBeEnabled();
  });

  it('is inert while the form is saving', () => {
    renderDateTime({ disabled: true });

    expect(screen.getByTestId('alert-date')).toBeDisabled();
  });

  it('shows the field error', () => {
    renderDateTime({ error: 'O período precisa terminar no futuro.' });

    expect(screen.getByRole('alert')).toHaveTextContent('O período precisa terminar no futuro.');
  });
});

describe('DateTimeField — the hour', () => {
  it('uses the shared TimePicker, labelled with its row', () => {
    renderDateTime({ time: '09:05' });

    expect(screen.getByRole('combobox', { name: 'De: hora' })).toHaveTextContent('09');
    expect(screen.getByRole('combobox', { name: 'De: minuto' })).toHaveTextContent('05');
  });

  it('reports the new time as HH:MM', async () => {
    const props = renderDateTime({ time: '09:00' });

    await userEvent.click(screen.getByRole('combobox', { name: 'De: hora' }));
    await userEvent.click(screen.getByRole('option', { name: '14' }));

    expect(props.onTimeChange).toHaveBeenCalledWith('14:00');
  });

  it('tags every select with the row so E2E can tell the two ends apart', () => {
    renderDateTime({ rowKey: 'rangeTo', labelKey: 'range.to' });

    expect(screen.getByTestId('alert-time-hour')).toHaveAttribute('data-row-key', 'rangeTo');
    expect(screen.getByTestId('alert-time-minute')).toHaveAttribute('data-row-key', 'rangeTo');
  });
});

describe('TimeField', () => {
  it('shows only an hour picker for the weekly window and reports a change', async () => {
    const onChange = vi.fn();
    renderWithIntl(
      <TimeField
        rowKey="weeklyFrom"
        labelKey="weekly.from"
        value="09:00"
        disabled={false}
        error={null}
        onChange={onChange}
      />,
    );

    expect(screen.queryByTestId('alert-date')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Entre: minuto' }));
    await userEvent.click(screen.getByRole('option', { name: '30' }));

    expect(onChange).toHaveBeenCalledWith('09:30');
  });

  it('follows the tenant 12-hour format with an AM/PM select', () => {
    renderWithIntl(
      <TimeField
        rowKey="weeklyTo"
        labelKey="weekly.to"
        value="14:30"
        disabled={false}
        error={null}
        onChange={vi.fn()}
      />,
      { locale: 'en' },
    );

    expect(screen.getByRole('combobox', { name: 'And: hour' })).toHaveTextContent('2');
    expect(screen.getByRole('combobox', { name: 'And: period' })).toHaveTextContent('PM');
  });

  it('shows the field error', () => {
    renderWithIntl(
      <TimeField
        rowKey="weeklyTo"
        labelKey="weekly.to"
        value="09:00"
        disabled={false}
        error="O horário final precisa ser depois do inicial."
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('O horário final');
  });
});

describe('ExpirySelect', () => {
  it('is the shadcn select, showing the current choice', () => {
    renderWithIntl(<ExpirySelect value={30} disabled={false} onChange={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Manter o aviso por' })).toHaveTextContent(
      '30 dias (padrão)',
    );
  });

  it('lists the five durations, marking the default and the maximum', async () => {
    renderWithIntl(<ExpirySelect value={30} disabled={false} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('alert-expiry'));

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '30 dias (padrão)',
      '60 dias',
      '90 dias',
      '180 dias',
      '365 dias (máximo)',
    ]);
  });

  it('reports the chosen number of days', async () => {
    const onChange = vi.fn();
    renderWithIntl(<ExpirySelect value={30} disabled={false} onChange={onChange} />);

    await userEvent.click(screen.getByTestId('alert-expiry'));
    await userEvent.click(screen.getByRole('option', { name: '180 dias' }));

    expect(onChange).toHaveBeenCalledWith(180);
  });

  it('is inert while the form is saving', () => {
    renderWithIntl(<ExpirySelect value={30} disabled onChange={vi.fn()} />);

    expect(screen.getByTestId('alert-expiry')).toBeDisabled();
  });
});

describe('accessibility', () => {
  it('the pickers have no violations together', async () => {
    const { container } = renderWithIntl(
      <form>
        <DateTimeField
          rowKey="rangeFrom"
          labelKey="range.from"
          date="2026-10-20"
          time="09:00"
          disabled={false}
          error={null}
          onDateChange={vi.fn()}
          onTimeChange={vi.fn()}
        />
        <TimeField
          rowKey="weeklyFrom"
          labelKey="weekly.from"
          value="09:00"
          disabled={false}
          error={null}
          onChange={vi.fn()}
        />
        <ExpirySelect value={30} disabled={false} onChange={vi.fn()} />
      </form>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
