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
    days: buildDays(),
    timeFormat: '24h' as const,
    onDayChange: vi.fn(),
    onCopyMondayToWeekdays: vi.fn(),
  };
}

describe('SettingsHoursSection', () => {
  it('renders the stored timezone as read-only text with the hint, and no select', () => {
    renderWithIntl(<SettingsHoursSection {...baseProps()} />);

    expect(screen.getByTestId('settings-timezone')).toHaveTextContent(
      'America/Sao_Paulo (Brasília)',
    );
    expect(
      screen.getByText(
        'O fuso horário é definido no cadastro. Para corrigi-lo, fale com o suporte.',
      ),
    ).toBeInTheDocument();
    // Negative guarantee (TD61): the manager has no control to change the timezone.
    expect(screen.queryByTestId('settings-timezone-select')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fuso horário/)).not.toBeInTheDocument();
  });

  it('renders the label and the hint in English', () => {
    renderWithIntl(<SettingsHoursSection {...baseProps()} />, { locale: 'en' });

    expect(screen.getByText('Timezone')).toBeInTheDocument();
    expect(
      screen.getByText('The timezone is set at signup. Contact support to correct it.'),
    ).toBeInTheDocument();
  });

  it('shows another stored zone as its raw IANA id', () => {
    renderWithIntl(<SettingsHoursSection {...{ ...baseProps(), timezone: 'America/Manaus' }} />);

    expect(screen.getByTestId('settings-timezone')).toHaveTextContent('America/Manaus');
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
