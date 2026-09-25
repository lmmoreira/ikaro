// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import type { TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import type { ScheduleWeekDayInfo } from '@/features/booking/schedule/schedule-page-derived';
import { ScheduleWeekView } from './ScheduleWeekView';

const STATUS_LABELS: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'Pendente',
  [BOOKING_STATUS.INFO_REQUESTED]: 'Info solicitada',
  [BOOKING_STATUS.APPROVED]: 'Aprovado',
  [BOOKING_STATUS.REJECTED]: 'Rejeitado',
  [BOOKING_STATUS.CANCELLED]: 'Cancelado',
  [BOOKING_STATUS.COMPLETED]: 'Concluído',
};

function buildEmptyTimeline(): TimelineDayData {
  return {
    selectedOpening: null,
    selectedDayHours: null,
    selectedDayClosed: true,
    timelineStartMinutes: 0,
    timelineEndMinutes: 0,
    slotCount: 0,
    slotHeight: 20,
    events: [],
  };
}

// An open (not-closed) day — needed for the scroll-to-now marker tests below, since
// ScheduleTimelineBoard only renders a grid (and therefore only ever mounts the marker) for a day
// that actually has hours; buildEmptyTimeline()'s selectedDayClosed: true renders the empty state
// instead.
function buildOpenTimeline(): TimelineDayData {
  return {
    selectedOpening: null,
    selectedDayHours: { open: '08:00', close: '18:00' },
    selectedDayClosed: false,
    timelineStartMinutes: 480,
    timelineEndMinutes: 1080,
    slotCount: 20,
    slotHeight: 20,
    events: [],
  };
}

const WEEK_DAY_INFO: ScheduleWeekDayInfo[] = [
  {
    dateKey: '2026-08-17',
    opening: null,
    hours: { open: '08:00', close: '18:00' },
    isClosed: false,
  },
  { dateKey: '2026-08-18', opening: null, hours: null, isClosed: true },
];

describe('ScheduleWeekView', () => {
  it('renders one card per day and calls onSelectDate when a card is clicked', async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();

    renderWithIntl(
      <ScheduleWeekView
        weekDayInfo={WEEK_DAY_INFO}
        weekTimelineCards={[buildEmptyTimeline(), buildEmptyTimeline()]}
        selectedDateKey="2026-08-17"
        todayKey="2026-08-17"
        onSelectDate={onSelectDate}
        slotGranularityMinutes={30}
        statusLabels={STATUS_LABELS}
        timezone="America/Sao_Paulo"
        scheduleReturnTo="/dashboard/schedule"
        onOpeningClick={vi.fn()}
        onClosureClick={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId('schedule-week-day-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByTestId('schedule-week-view')).toBeInTheDocument();

    const dayButtons = screen.getAllByRole('button');
    await user.click(dayButtons[1]);
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-18');
  });

  it('shows the closed badge for a closed day', () => {
    renderWithIntl(
      <ScheduleWeekView
        weekDayInfo={WEEK_DAY_INFO}
        weekTimelineCards={[buildEmptyTimeline(), buildEmptyTimeline()]}
        selectedDateKey="2026-08-17"
        todayKey="2026-08-17"
        onSelectDate={vi.fn()}
        slotGranularityMinutes={30}
        statusLabels={STATUS_LABELS}
        timezone="America/Sao_Paulo"
        scheduleReturnTo="/dashboard/schedule"
        onOpeningClick={vi.fn()}
        onClosureClick={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Fechado').length).toBeGreaterThan(0);
  });

  it("renders the scroll-to-now marker only on today's day-card (TD44 Story 4)", () => {
    renderWithIntl(
      <ScheduleWeekView
        weekDayInfo={WEEK_DAY_INFO}
        weekTimelineCards={[buildOpenTimeline(), buildEmptyTimeline()]}
        selectedDateKey="2026-08-17"
        todayKey="2026-08-17"
        onSelectDate={vi.fn()}
        slotGranularityMinutes={30}
        statusLabels={STATUS_LABELS}
        timezone="America/Sao_Paulo"
        scheduleReturnTo="/dashboard/schedule"
        onOpeningClick={vi.fn()}
        onClosureClick={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('schedule-now-marker')).toHaveLength(1);
  });

  it('renders no scroll-to-now marker when today is outside the visible week (TD44 Story 4, non-regression)', () => {
    renderWithIntl(
      <ScheduleWeekView
        weekDayInfo={WEEK_DAY_INFO}
        weekTimelineCards={[buildOpenTimeline(), buildEmptyTimeline()]}
        selectedDateKey="2026-08-17"
        todayKey="2026-09-01"
        onSelectDate={vi.fn()}
        slotGranularityMinutes={30}
        statusLabels={STATUS_LABELS}
        timezone="America/Sao_Paulo"
        scheduleReturnTo="/dashboard/schedule"
        onOpeningClick={vi.fn()}
        onClosureClick={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('schedule-now-marker')).not.toBeInTheDocument();
  });
});
