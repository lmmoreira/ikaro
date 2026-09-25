// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import type { TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import { ScheduleTimelineBoard } from './ScheduleTimelineBoard';

const STATUS_LABELS: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'Pendente',
  [BOOKING_STATUS.INFO_REQUESTED]: 'Info solicitada',
  [BOOKING_STATUS.APPROVED]: 'Aprovado',
  [BOOKING_STATUS.REJECTED]: 'Rejeitado',
  [BOOKING_STATUS.CANCELLED]: 'Cancelado',
  [BOOKING_STATUS.COMPLETED]: 'Concluído',
};

function baseProps(timeline: TimelineDayData, compact: boolean) {
  return {
    timeline,
    compact,
    slotGranularityMinutes: 30,
    slotLabels: ['09:00', '09:30'],
    statusLabels: STATUS_LABELS,
    timezone: 'America/Sao_Paulo',
    scheduleReturnTo: '/dashboard/schedule',
    onOpeningClick: vi.fn(),
    onClosureClick: vi.fn(),
  };
}

const CLOSED_TIMELINE: TimelineDayData = {
  selectedOpening: null,
  selectedDayHours: null,
  selectedDayClosed: true,
  timelineStartMinutes: 0,
  timelineEndMinutes: 0,
  slotCount: 0,
  slotHeight: 48,
  events: [],
};

const OPEN_TIMELINE: TimelineDayData = {
  selectedOpening: null,
  selectedDayHours: { open: '09:00', close: '10:00' },
  selectedDayClosed: false,
  timelineStartMinutes: 540,
  timelineEndMinutes: 600,
  slotCount: 2,
  slotHeight: 48,
  events: [
    {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: [],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30,
      } as never,
    },
  ],
};

describe('ScheduleTimelineBoard', () => {
  it('renders the empty state when the day is closed', () => {
    renderWithIntl(<ScheduleTimelineBoard {...baseProps(CLOSED_TIMELINE, false)} />);
    expect(screen.getByText('Fechado')).toBeInTheDocument();
    expect(screen.getByText('Este dia está sem horário padrão.')).toBeInTheDocument();
  });

  it('renders a compact board with the booking event, no redundant status/count labels (TD44 Story 4)', () => {
    renderWithIntl(<ScheduleTimelineBoard {...baseProps(OPEN_TIMELINE, true)} />);
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    // Status badge + "N agendamento(s) neste dia" count removed — redundant with the grid itself
    // (and, for Week view specifically, with the day-card's own separate header badge).
    expect(screen.queryByText('Aberto na agenda padrão')).not.toBeInTheDocument();
    expect(screen.queryByText(/agendamento/)).not.toBeInTheDocument();
  });

  it('renders a desktop board with slot labels and the booking event', () => {
    renderWithIntl(<ScheduleTimelineBoard {...baseProps(OPEN_TIMELINE, false)} />);
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
    expect(screen.getByText('João Silva')).toBeInTheDocument();
  });

  it('renders no scroll-to-now marker when nowMarkerRef/nowMarkerTopPx are omitted (TD44 Story 4)', () => {
    renderWithIntl(<ScheduleTimelineBoard {...baseProps(OPEN_TIMELINE, false)} />);
    expect(screen.queryByTestId('schedule-now-marker')).not.toBeInTheDocument();
  });

  it('renders the scroll-to-now marker at the given offset when provided (TD44 Story 4)', () => {
    renderWithIntl(
      <ScheduleTimelineBoard
        {...baseProps(OPEN_TIMELINE, false)}
        nowMarkerRef={{ current: null }}
        nowMarkerTopPx={24}
      />,
    );
    const marker = screen.getByTestId('schedule-now-marker');
    expect(marker.style.top).toBe('24px');
  });
});
