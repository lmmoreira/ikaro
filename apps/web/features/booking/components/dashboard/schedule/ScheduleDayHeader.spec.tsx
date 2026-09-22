// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ScheduleDayHeader } from './ScheduleDayHeader';

function baseProps() {
  return {
    selectedDayLabel: '18 de agosto',
    scheduleViewMode: 'week' as const,
    onViewModeChange: vi.fn(),
    onGoToToday: vi.fn(),
    selectedDayClosed: false,
    onOpenSpecialDay: vi.fn(),
    onBlockPeriod: vi.fn(),
    closureWarning: null,
    hasBookingInSelectedDay: false,
    bookingCount: 0,
  };
}

describe('ScheduleDayHeader', () => {
  it('renders the selected day label and calls onGoToToday', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<ScheduleDayHeader {...props} />);

    expect(screen.getByText('18 de agosto')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(props.onGoToToday).toHaveBeenCalledTimes(1);
  });

  it('shows "Bloquear período" when the day is open and calls onBlockPeriod', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<ScheduleDayHeader {...props} />);

    await user.click(screen.getByRole('button', { name: /Bloquear período/ }));
    expect(props.onBlockPeriod).toHaveBeenCalledTimes(1);
    expect(props.onOpenSpecialDay).not.toHaveBeenCalled();
  });

  it('shows "Abrir dia especial" when the day is closed and calls onOpenSpecialDay', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), selectedDayClosed: true };
    renderWithIntl(<ScheduleDayHeader {...props} />);

    await user.click(screen.getByRole('button', { name: /Abrir dia especial/ }));
    expect(props.onOpenSpecialDay).toHaveBeenCalledTimes(1);
  });

  it('renders the closure warning when present', () => {
    const props = { ...baseProps(), closureWarning: 'Aviso de sobreposição' };
    renderWithIntl(<ScheduleDayHeader {...props} />);

    expect(screen.getByText('Aviso de sobreposição')).toBeInTheDocument();
  });

  it('renders the booking count badge only when hasBookingInSelectedDay is true', () => {
    const props = { ...baseProps(), hasBookingInSelectedDay: true, bookingCount: 3 };
    renderWithIntl(<ScheduleDayHeader {...props} />);

    expect(screen.getByText('3 agendamentos neste dia')).toBeInTheDocument();
  });
});
