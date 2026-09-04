import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import type { ScheduleUiState } from './schedule-page-ui-state';
import {
  buildStatusFilterHandlers,
  buildWeekNavHandlers,
} from './schedule-page-interaction-handlers';

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

describe('buildWeekNavHandlers', () => {
  it('handlePrevWeek shifts the week back 7 days and resets interactive state', () => {
    const ui = makeUi();
    buildWeekNavHandlers(ui, '2026-08-20').handlePrevWeek();
    expect(ui.setWeekStartKey).toHaveBeenCalledWith('2026-08-10');
    expect(ui.setSelectedDateKey).toHaveBeenCalledWith('2026-08-10');
    expect(ui.setClosureWarning).toHaveBeenCalledWith(null);
    expect(ui.setClosureSheetOpen).toHaveBeenCalledWith(false);
    expect(ui.setOpeningSheetOpen).toHaveBeenCalledWith(false);
    expect(ui.setStatusFilterOpen).toHaveBeenCalledWith(false);
  });

  it('handleNextWeek shifts the week forward 7 days', () => {
    const ui = makeUi();
    buildWeekNavHandlers(ui, '2026-08-20').handleNextWeek();
    expect(ui.setWeekStartKey).toHaveBeenCalledWith('2026-08-24');
    expect(ui.setSelectedDateKey).toHaveBeenCalledWith('2026-08-24');
  });

  it("handleGoToToday jumps to today's week and today's date", () => {
    const ui = makeUi();
    buildWeekNavHandlers(ui, '2026-08-20').handleGoToToday(); // 2026-08-20 is a Thursday
    expect(ui.setWeekStartKey).toHaveBeenCalledWith('2026-08-17');
    expect(ui.setSelectedDateKey).toHaveBeenCalledWith('2026-08-20');
  });

  it('handleSelectDate sets the selected date and clears the closure warning only', () => {
    const ui = makeUi();
    buildWeekNavHandlers(ui, '2026-08-20').handleSelectDate('2026-08-18');
    expect(ui.setSelectedDateKey).toHaveBeenCalledWith('2026-08-18');
    expect(ui.setClosureWarning).toHaveBeenCalledWith(null);
    expect(ui.setWeekStartKey).not.toHaveBeenCalled();
  });
});

describe('buildStatusFilterHandlers', () => {
  it('exposes the memoized selectedStatusSet unchanged', () => {
    const ui = makeUi();
    const set = new Set<BookingStatus>([BOOKING_STATUS.APPROVED]);
    const handlers = buildStatusFilterHandlers(ui, set, vi.fn());
    expect(handlers.selectedStatusSet).toBe(set);
  });

  it('handleToggleStatus adds a status not yet selected', () => {
    const ui = makeUi();
    const setSelectedStatuses = vi.fn();
    const handlers = buildStatusFilterHandlers(
      ui,
      new Set([BOOKING_STATUS.APPROVED]),
      setSelectedStatuses,
    );
    handlers.handleToggleStatus(BOOKING_STATUS.PENDING);

    const updater = setSelectedStatuses.mock.calls[0][0] as (
      current: readonly BookingStatus[],
    ) => readonly BookingStatus[];
    expect(updater([BOOKING_STATUS.APPROVED])).toEqual([
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.APPROVED,
    ]);
  });

  it('handleToggleStatus removes a status already selected', () => {
    const ui = makeUi();
    const setSelectedStatuses = vi.fn();
    const handlers = buildStatusFilterHandlers(
      ui,
      new Set([BOOKING_STATUS.APPROVED, BOOKING_STATUS.PENDING]),
      setSelectedStatuses,
    );
    handlers.handleToggleStatus(BOOKING_STATUS.APPROVED);

    const updater = setSelectedStatuses.mock.calls[0][0] as (
      current: readonly BookingStatus[],
    ) => readonly BookingStatus[];
    expect(updater([BOOKING_STATUS.APPROVED, BOOKING_STATUS.PENDING])).toEqual([
      BOOKING_STATUS.PENDING,
    ]);
  });

  it('handleResetStatusFilter resets to the default status set', () => {
    const ui = makeUi();
    const setSelectedStatuses = vi.fn();
    buildStatusFilterHandlers(ui, new Set(), setSelectedStatuses).handleResetStatusFilter();
    expect(setSelectedStatuses).toHaveBeenCalledWith([
      BOOKING_STATUS.INFO_REQUESTED,
      BOOKING_STATUS.APPROVED,
      BOOKING_STATUS.REJECTED,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.COMPLETED,
    ]);
  });

  it('handleToggleStatusFilterOpen flips the open flag', () => {
    const ui = makeUi();
    buildStatusFilterHandlers(ui, new Set(), vi.fn()).handleToggleStatusFilterOpen();
    const updater = (ui.setStatusFilterOpen as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      current: boolean,
    ) => boolean;
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });

  it('handleCloseStatusFilter closes the popover', () => {
    const ui = makeUi();
    buildStatusFilterHandlers(ui, new Set(), vi.fn()).handleCloseStatusFilter();
    expect(ui.setStatusFilterOpen).toHaveBeenCalledWith(false);
  });
});
