// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import type { TimelineDayData } from './schedule-timeline';
import type { ScheduleCoreData } from './schedule-page-core-data';
import type { ScheduleUiState } from './schedule-page-ui-state';
import type { SchedulePageControllerInput } from './schedule-page-controller-types';
import { buildControllerResult, useScheduleLabels } from './schedule-page-controller-result';

function makeUi(overrides: Partial<ScheduleUiState> = {}): ScheduleUiState {
  return {
    weekStartKey: '2026-08-17',
    setWeekStartKey: vi.fn(),
    selectedDateKey: '2026-08-17',
    setSelectedDateKey: vi.fn(),
    selectedResourceId: null,
    setSelectedResourceId: vi.fn(),
    closureSheetOpen: false,
    setClosureSheetOpen: vi.fn(),
    openingSheetOpen: false,
    setOpeningSheetOpen: vi.fn(),
    closureWarning: null,
    setClosureWarning: vi.fn(),
    removeClosureTarget: null,
    setRemoveClosureTarget: vi.fn(),
    removeOpeningTarget: null,
    setRemoveOpeningTarget: vi.fn(),
    statusFilterOpen: false,
    setStatusFilterOpen: vi.fn(),
    statusFilterRef: { current: null },
    ...overrides,
  };
}

function makeTimeline(overrides: Partial<TimelineDayData> = {}): TimelineDayData {
  return {
    selectedOpening: null,
    selectedDayHours: { open: '09:00', close: '18:00' },
    selectedDayClosed: false,
    timelineStartMinutes: 540,
    timelineEndMinutes: 1080,
    slotCount: 2,
    slotHeight: 48,
    events: [],
    ...overrides,
  };
}

function makeCore(overrides: Partial<ScheduleCoreData> = {}): ScheduleCoreData {
  return {
    ui: makeUi(),
    timezone: 'America/Sao_Paulo',
    formatDateLong: (date: Date) => date.toISOString().slice(0, 10),
    visibleBookings: [],
    selectedStatusSet: new Set<BookingStatus>([BOOKING_STATUS.APPROVED]),
    setSelectedStatuses: vi.fn(),
    setPersistedViewMode: vi.fn(),
    scheduleViewMode: 'week',
    weekDayInfo: [],
    activeDates: new Set(),
    dimmedDates: new Set(),
    selectedDayTimeline: makeTimeline(),
    weekTimelineCards: [],
    ...overrides,
  };
}

describe('useScheduleLabels', () => {
  it('formats the selected day label from the core selectedDateKey', () => {
    const core = makeCore();
    const { result } = renderHook(() => useScheduleLabels(core, 30));
    expect(result.current.selectedDayLabel).toBe('2026-08-17');
  });

  it('counts only booking-kind events for bookingEventCount', () => {
    const core = makeCore({
      selectedDayTimeline: makeTimeline({
        events: [
          { kind: 'booking' } as never,
          { kind: 'booking' } as never,
          { kind: 'closure' } as never,
        ],
      }),
    });
    const { result } = renderHook(() => useScheduleLabels(core, 30));
    expect(result.current.bookingEventCount).toBe(2);
  });

  it('builds slotLabels from the selected timeline slot count/start and the given granularity', () => {
    const core = makeCore({
      selectedDayTimeline: makeTimeline({ slotCount: 2, timelineStartMinutes: 540 }),
    });
    const { result } = renderHook(() => useScheduleLabels(core, 30));
    expect(result.current.slotLabels).toEqual(['09:00', '09:30']);
  });
});

describe('buildControllerResult', () => {
  const props: SchedulePageControllerInput = {
    initialClosures: { items: [] },
    initialOpenings: { items: [] },
    initialBookings: { items: [], total: 0, page: 1, limit: 50 },
    businessHours: {
      timezone: 'America/Sao_Paulo',
      monday: { open: '09:00', close: '18:00' },
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    },
    todayKey: '2026-08-17',
    weekStartKey: '2026-08-17',
    slotGranularityMinutes: 30,
  };
  const t = ((key: string) => key) as never;
  const statusLabels = {
    [BOOKING_STATUS.PENDING]: 'Pendente',
    [BOOKING_STATUS.INFO_REQUESTED]: 'Info',
    [BOOKING_STATUS.APPROVED]: 'Aprovado',
    [BOOKING_STATUS.REJECTED]: 'Rejeitado',
    [BOOKING_STATUS.CANCELLED]: 'Cancelado',
    [BOOKING_STATUS.COMPLETED]: 'Concluído',
  };
  const mutations = {
    createClosureMutation: { mutateAsync: vi.fn() },
    createOpeningMutation: { mutateAsync: vi.fn() },
    removeClosureMutation: { mutateAsync: vi.fn() },
    removeOpeningMutation: { mutateAsync: vi.fn() },
  };

  it('assembles the flat result object from core data, labels, and handlers', () => {
    const core = makeCore();
    const labels = {
      selectedDayLabel: '17 de agosto',
      bookingEventCount: 2,
      slotLabels: ['09:00'],
    };

    const result = buildControllerResult(props, core, labels, t, mutations, statusLabels);

    expect(result.ui).toBe(core.ui);
    expect(result.businessHours).toBe(props.businessHours);
    expect(result.selectedDayLabel).toBe('17 de agosto');
    expect(result.bookingEventCount).toBe(2);
    expect(result.hasBookingInSelectedDay).toBe(true);
    expect(result.slotLabels).toEqual(['09:00']);
    expect(result.scheduleReturnTo).toBe(
      '/dashboard/schedule?weekStart=2026-08-17&date=2026-08-17',
    );
  });

  it('hasBookingInSelectedDay is false when bookingEventCount is 0', () => {
    const core = makeCore();
    const labels = { selectedDayLabel: '17 de agosto', bookingEventCount: 0, slotLabels: [] };
    const result = buildControllerResult(props, core, labels, t, mutations, statusLabels);
    expect(result.hasBookingInSelectedDay).toBe(false);
  });

  it("derives timelineTitle from the selected day's opening/closed state", () => {
    const core = makeCore({
      selectedDayTimeline: makeTimeline({ selectedDayClosed: true }),
    });
    const labels = { selectedDayLabel: '17 de agosto', bookingEventCount: 0, slotLabels: [] };
    const result = buildControllerResult(props, core, labels, t, mutations, statusLabels);
    expect(result.timelineTitle).toBe('statusClosed');
  });

  it('wires the status filter handlers to the core selectedStatusSet', () => {
    const core = makeCore();
    const labels = { selectedDayLabel: '17 de agosto', bookingEventCount: 0, slotLabels: [] };
    const result = buildControllerResult(props, core, labels, t, mutations, statusLabels);
    expect(result.statusFilter.selectedStatusSet).toBe(core.selectedStatusSet);
  });
});
