// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaySummary } from '@ikaro/types';
import { fetchAvailabilitySummary } from '@/features/platform/hotsite/api/schedule';
import { AvailabilityCalendar } from './AvailabilityCalendar';

vi.mock('@/features/platform/hotsite/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

function renderCalendar(overrides?: Partial<Parameters<typeof AvailabilityCalendar>[0]>) {
  return renderWithIntl(
    <AvailabilityCalendar
      slug="lavacar-beloauto"
      serviceIds={['svc-1']}
      selectedDate={null}
      onSelectDate={vi.fn()}
      maxBookingAdvanceDays={90}
      {...overrides}
    />,
  );
}

function getCalendarDay(date: string): HTMLElement {
  const all = screen.getAllByTestId('calendar-day');
  const found = all.find((el) => el.getAttribute('data-date') === date);
  if (!found) throw new Error(`calendar-day with data-date="${date}" not found`);
  return found;
}

describe('AvailabilityCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(fetchAvailabilitySummary).mockReset();
  });

  it('shows a loading message while fetching', () => {
    vi.mocked(fetchAvailabilitySummary).mockReturnValue(new Promise(() => {}));

    renderCalendar();

    expect(screen.getByText('Carregando disponibilidade...')).toBeInTheDocument();
  });

  it('renders a month grid with the current month days once loaded', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    renderCalendar();

    const days = await screen.findAllByTestId('calendar-day');
    expect(days.length).toBeGreaterThan(25);
    expect(getCalendarDay('2026-06-15')).toBeInTheDocument();
  });

  it('shows an error message with a retry button when the fetch fails', async () => {
    vi.mocked(fetchAvailabilitySummary).mockRejectedValue(new Error('network error'));

    renderCalendar();

    expect(
      await screen.findByText('Não foi possível carregar a disponibilidade'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(2);
  });

  it("styles today's cell with a --ba-primary ring", async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([
      { date: '2026-06-15', available: true, slotCount: 5 },
    ]);

    renderCalendar();

    await screen.findAllByTestId('calendar-day');
    expect(getCalendarDay('2026-06-15')).toHaveStyle({
      boxShadow: 'inset 0 0 0 2px var(--ba-primary, #2563eb)',
    });
  });

  it('styles the selected day with --ba-primary background', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([
      { date: '2026-06-16', available: true, slotCount: 5 },
    ]);

    renderCalendar({ selectedDate: '2026-06-16' });

    await screen.findAllByTestId('calendar-day');
    expect(getCalendarDay('2026-06-16')).toHaveStyle({
      backgroundColor: 'var(--ba-primary, #2563eb)',
      color: 'var(--ba-btn-text, #ffffff)',
    });
  });

  it('disables a day the backend reports as unavailable', async () => {
    const days: DaySummary[] = [{ date: '2026-06-17', available: false, slotCount: 0 }];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCalendar();

    await screen.findAllByTestId('calendar-day');
    expect(getCalendarDay('2026-06-17')).toBeDisabled();
  });

  it('disables a day before today without ever asking the backend about it', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    renderCalendar();

    await screen.findAllByTestId('calendar-day');
    // System time is pinned to 2026-06-15 — the 10th is in the past relative to that.
    expect(getCalendarDay('2026-06-10')).toBeDisabled();
    const [, from] = vi.mocked(fetchAvailabilitySummary).mock.calls[0];
    expect(from).toBe('2026-06-15');
  });

  it('computes the "today" boundary from the UTC calendar day, not the viewer\'s local one', async () => {
    // 2026-06-16T01:00:00Z is still 2026-06-15 in this test runner's local timezone (UTC-3) —
    // this proves the "today" boundary tracks GetAvailabilitySummaryUseCase's own todayUTC()
    // contract (backend calendar-date.ts), not the viewer's local calendar date, which would
    // incorrectly still read June 15 here and drift a day behind the backend's actual cutoff.
    vi.setSystemTime(new Date('2026-06-16T01:00:00.000Z'));
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    renderCalendar();

    await screen.findAllByTestId('calendar-day');
    const [, from] = vi.mocked(fetchAvailabilitySummary).mock.calls[0];
    expect(from).toBe('2026-06-16');
  });

  it('calls onSelectDate when an in-range available day is clicked', async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([
      { date: '2026-06-20', available: true, slotCount: 5 },
    ]);

    renderCalendar({ onSelectDate });

    await screen.findAllByTestId('calendar-day');
    await user.click(getCalendarDay('2026-06-20'));

    expect(onSelectDate).toHaveBeenCalledWith('2026-06-20');
  });

  it('blocks selection past maxBookingAdvanceDays without calling onSelectDate, and shows a message', async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([
      { date: '2026-06-20', available: true, slotCount: 5 },
    ]);

    renderCalendar({ onSelectDate, maxBookingAdvanceDays: 3 });

    await screen.findAllByTestId('calendar-day');
    expect(screen.queryByTestId('calendar-out-of-range-message')).not.toBeInTheDocument();

    await user.click(getCalendarDay('2026-06-20'));

    expect(onSelectDate).not.toHaveBeenCalled();
    expect(await screen.findByTestId('calendar-out-of-range-message')).toHaveTextContent(
      'além do limite de 3 dias',
    );
  });

  it('uses singular "dia" (not "1 dias") when maxBookingAdvanceDays is 1', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    renderCalendar({ maxBookingAdvanceDays: 1 });

    await screen.findAllByTestId('calendar-day');
    await user.click(getCalendarDay('2026-06-20'));

    expect(await screen.findByTestId('calendar-out-of-range-message')).toHaveTextContent(
      'além do limite de 1 dia para agendamento.',
    );
  });

  it('clears the out-of-range message once a valid day is selected afterwards', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([
      { date: '2026-06-16', available: true, slotCount: 5 },
    ]);

    renderCalendar({ maxBookingAdvanceDays: 3 });

    await screen.findAllByTestId('calendar-day');
    await user.click(getCalendarDay('2026-06-20'));
    expect(await screen.findByTestId('calendar-out-of-range-message')).toBeInTheDocument();

    await user.click(getCalendarDay('2026-06-16'));

    expect(screen.queryByTestId('calendar-out-of-range-message')).not.toBeInTheDocument();
  });

  it('does not resurrect a stale out-of-range message after navigating away and back to the same month', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    // maxBookingAdvanceDays=26 puts maxDateIso at 2026-07-10 — July is reachable (not entirely
    // out of range) and itself contains both in-range (1-10) and out-of-range (11-31) days, so
    // it can be navigated to, away from, and back to.
    renderCalendar({ maxBookingAdvanceDays: 26 });

    await screen.findAllByTestId('calendar-day');
    await user.click(screen.getByTestId('calendar-next-month'));
    await screen.findByText('julho 2026');

    await user.click(getCalendarDay('2026-07-15'));
    expect(await screen.findByTestId('calendar-out-of-range-message')).toBeInTheDocument();

    await user.click(screen.getByTestId('calendar-previous-month'));
    await screen.findByText('junho 2026');
    expect(screen.queryByTestId('calendar-out-of-range-message')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('calendar-next-month'));
    await screen.findByText('julho 2026');

    expect(screen.queryByTestId('calendar-out-of-range-message')).not.toBeInTheDocument();
  });

  it('renders an out-of-range day muted before it is ever clicked', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([
      { date: '2026-06-20', available: true, slotCount: 5 },
    ]);

    renderCalendar({ maxBookingAdvanceDays: 3 });

    await screen.findAllByTestId('calendar-day');
    expect(getCalendarDay('2026-06-20')).toHaveStyle({ opacity: '0.6', color: '#9ca3af' });
  });

  it('navigating to the next month triggers a refetch for the new range', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    renderCalendar();

    await screen.findAllByTestId('calendar-day');
    // The current month's fetch starts at today (2026-06-15, per the pinned system time), not
    // the 1st — from clamps forward to today so the requested span never counts already-past
    // days of the visible month against maxBookingAdvanceDays.
    expect(fetchAvailabilitySummary).toHaveBeenCalledWith(
      'lavacar-beloauto',
      '2026-06-15',
      '2026-06-30',
      ['svc-1'],
    );

    await user.click(screen.getByTestId('calendar-next-month'));

    await vi.waitFor(() => {
      expect(fetchAvailabilitySummary).toHaveBeenCalledWith(
        'lavacar-beloauto',
        '2026-07-01',
        '2026-07-31',
        ['svc-1'],
      );
    });
  });

  it('stops forward navigation at the month containing the maxBookingAdvanceDays boundary', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    // System time pinned to 2026-06-15; a 20-day advance window puts the boundary on 2026-07-04
    // (today + 19 days) — endMonth should still allow navigating from June into July, but disable
    // "next" once July (the boundary month) is reached.
    renderCalendar({ maxBookingAdvanceDays: 20 });

    await screen.findAllByTestId('calendar-day');
    expect(screen.getByTestId('calendar-next-month')).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByTestId('calendar-next-month'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('calendar-next-month')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('renders pt-BR month/weekday labels by default', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    renderCalendar();

    await screen.findAllByTestId('calendar-day');
    expect(screen.getByText('junho 2026')).toBeInTheDocument();
  });

  it('renders en month/weekday labels', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);

    renderWithIntl(
      <AvailabilityCalendar
        slug="lavacar-beloauto"
        serviceIds={['svc-1']}
        selectedDate={null}
        onSelectDate={vi.fn()}
        maxBookingAdvanceDays={90}
      />,
      { locale: 'en' },
    );

    await screen.findAllByTestId('calendar-day');
    expect(screen.getByText('June 2026')).toBeInTheDocument();
  });
});
