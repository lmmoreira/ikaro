// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import type { DayHoursValue, WeekDay } from '@/features/platform/settings-form';
import { SettingsHoursSection } from './SettingsHoursSection';

function buildDays(): Record<WeekDay, DayHoursValue> {
  const open = { open: '08:00', close: '18:00', closed: false };
  return {
    monday: open,
    tuesday: open,
    wednesday: open,
    thursday: open,
    friday: open,
    saturday: { open: '09:00', close: '13:00', closed: false },
    sunday: { open: '', close: '', closed: true },
  };
}

function baseProps() {
  return {
    timezone: 'America/Sao_Paulo',
    timezoneError: undefined,
    timezones: ['America/Sao_Paulo', 'America/New_York'],
    days: buildDays(),
    timeFormat: '24h' as const,
    onTimezoneChange: vi.fn(),
    onDayChange: vi.fn(),
    onCopyMondayToWeekdays: vi.fn(),
  };
}

describe('SettingsHoursSection', () => {
  it('renders the timezone select and calls onTimezoneChange', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<SettingsHoursSection {...props} />);

    await user.selectOptions(screen.getByTestId('settings-timezone-select'), 'America/New_York');
    expect(props.onTimezoneChange).toHaveBeenCalledWith('America/New_York');
  });

  it('renders a copy-to-weekdays trigger only for Monday, calling onCopyMondayToWeekdays', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<SettingsHoursSection {...props} />);

    const copyButton = screen.getByTestId('day-copy-monday');
    await user.click(copyButton);
    expect(props.onCopyMondayToWeekdays).toHaveBeenCalledTimes(1);
  });

  it('calls onDayChange when a day is toggled closed', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<SettingsHoursSection {...props} />);

    await user.click(screen.getByRole('checkbox', { name: /Fechado — Domingo/ }));
    expect(props.onDayChange).toHaveBeenCalledWith('sunday', { closed: false });
  });
});
