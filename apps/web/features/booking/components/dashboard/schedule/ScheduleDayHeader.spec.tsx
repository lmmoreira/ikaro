// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ScheduleDayHeader } from './ScheduleDayHeader';

function baseProps() {
  return {
    selectedDayLabel: '18 de agosto',
    bookingCount: 0,
    scheduleViewMode: 'week' as const,
    onViewModeChange: vi.fn(),
    onGoToToday: vi.fn(),
    selectedDayClosed: false,
    onOpenSpecialDay: vi.fn(),
    onBlockPeriod: vi.fn(),
    closureWarning: null,
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

  it('shows a muted "no bookings" badge when bookingCount is 0 (TD44 Story 4)', () => {
    renderWithIntl(<ScheduleDayHeader {...baseProps()} />);
    expect(screen.getByTestId('schedule-day-header-booking-count')).toHaveTextContent(
      'Sem agendamentos',
    );
  });

  it('shows the booking count when bookingCount is greater than 0', () => {
    renderWithIntl(<ScheduleDayHeader {...baseProps()} bookingCount={3} />);
    expect(screen.getByTestId('schedule-day-header-booking-count')).toHaveTextContent('3');
  });
});
