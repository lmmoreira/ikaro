// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus, type TenantBusinessHours } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ScheduleMainView } from './ScheduleMainView';

vi.mock('./ScheduleWeekView', () => ({
  ScheduleWeekView: () => <div data-testid="mock-week-view" />,
}));

vi.mock('./ScheduleResourceColumnsBoard', () => ({
  ScheduleResourceColumnsBoard: () => <div data-testid="mock-columns-board" />,
}));

const STATUS_LABELS: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'Pendente',
  [BOOKING_STATUS.INFO_REQUESTED]: 'Info solicitada',
  [BOOKING_STATUS.APPROVED]: 'Aprovado',
  [BOOKING_STATUS.REJECTED]: 'Rejeitado',
  [BOOKING_STATUS.CANCELLED]: 'Cancelado',
  [BOOKING_STATUS.COMPLETED]: 'Concluído',
};

const BUSINESS_HOURS: TenantBusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: { open: '09:00', close: '18:00' },
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

function baseProps() {
  return {
    isWeekView: false,
    showResourceColumns: false,
    weekDayInfo: [],
    weekTimelineCards: [],
    selectedDateKey: '2026-08-17',
    todayKey: '2026-08-17',
    onSelectDate: vi.fn(),
    slotGranularityMinutes: 30 as const,
    statusLabels: STATUS_LABELS,
    timezone: 'America/Sao_Paulo',
    scheduleReturnTo: '/dashboard/schedule',
    onOpeningClick: vi.fn(),
    onClosureClick: vi.fn(),
    selectedResourceIdSet: new Set<string>(),
    resourceNameById: new Map<string, string>(),
    bookingsItems: [],
    selectedStatusSet: new Set([BOOKING_STATUS.APPROVED]),
    visibleClosures: [],
    visibleOpenings: [],
    businessHours: BUSINESS_HOURS,
    selectedDayTimeline: {
      selectedOpening: null,
      selectedDayHours: { open: '09:00', close: '18:00' },
      selectedDayClosed: false,
      timelineStartMinutes: 540,
      timelineEndMinutes: 1080,
      slotCount: 2,
      slotHeight: 48,
      events: [],
    },
    slotLabels: ['09:00'],
    timelineTitle: 'Aberto',
  };
}

describe('ScheduleMainView', () => {
  it('renders the week view when isWeekView is true, regardless of showResourceColumns', () => {
    renderWithIntl(<ScheduleMainView {...baseProps()} isWeekView showResourceColumns={true} />);
    expect(screen.getByTestId('mock-week-view')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-columns-board')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schedule-mobile-view')).not.toBeInTheDocument();
  });

  it('renders the resource columns board when checked and not in week view', () => {
    renderWithIntl(<ScheduleMainView {...baseProps()} showResourceColumns={true} />);
    expect(screen.getByTestId('mock-columns-board')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-week-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schedule-mobile-view')).not.toBeInTheDocument();
  });

  it('renders the single-day timeline when neither week view nor resource columns apply', () => {
    renderWithIntl(<ScheduleMainView {...baseProps()} />);
    expect(screen.getByTestId('schedule-mobile-view')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-week-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-columns-board')).not.toBeInTheDocument();
  });
});
