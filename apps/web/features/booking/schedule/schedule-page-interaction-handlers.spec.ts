import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import type { ScheduleUiState } from './schedule-page-ui-state';
import {
  buildResourceFilterHandlers,
  buildStatusFilterHandlers,
  buildWeekNavHandlers,
  RESOURCE_FILTER_MAX_SELECTED,
} from './schedule-page-interaction-handlers';

function makeUi(overrides: Partial<ScheduleUiState> = {}): ScheduleUiState {
  return {
    weekStartKey: '2026-08-17',
    setWeekStartKey: vi.fn(),
    selectedDateKey: '2026-08-17',
    setSelectedDateKey: vi.fn(),
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
    resourceFilterOpen: false,
    setResourceFilterOpen: vi.fn(),
    resourceFilterRef: { current: null },
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
    expect(ui.setResourceFilterOpen).toHaveBeenCalledWith(false);
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

describe('buildResourceFilterHandlers', () => {
  it('exposes the memoized selectedResourceIdSet unchanged', () => {
    const ui = makeUi();
    const set = new Set<string>(['res-1']);
    const handlers = buildResourceFilterHandlers(ui, set, vi.fn());
    expect(handlers.selectedResourceIdSet).toBe(set);
  });

  it('handleToggleResource adds a resource not yet selected', () => {
    const ui = makeUi();
    const setSelectedResourceIds = vi.fn();
    const handlers = buildResourceFilterHandlers(ui, new Set(['res-1']), setSelectedResourceIds);
    handlers.handleToggleResource('res-2');

    const updater = setSelectedResourceIds.mock.calls[0][0] as (
      current: readonly string[],
    ) => readonly string[];
    expect(updater(['res-1'])).toEqual(['res-1', 'res-2']);
  });

  it('handleToggleResource removes a resource already selected', () => {
    const ui = makeUi();
    const setSelectedResourceIds = vi.fn();
    const handlers = buildResourceFilterHandlers(
      ui,
      new Set(['res-1', 'res-2']),
      setSelectedResourceIds,
    );
    handlers.handleToggleResource('res-1');

    const updater = setSelectedResourceIds.mock.calls[0][0] as (
      current: readonly string[],
    ) => readonly string[];
    expect(updater(['res-1', 'res-2'])).toEqual(['res-2']);
  });

  it('handleToggleResource is a no-op when adding a resource once the cap is reached (TD44)', () => {
    const ui = makeUi();
    const setSelectedResourceIds = vi.fn();
    const atCap = Array.from({ length: RESOURCE_FILTER_MAX_SELECTED }, (_, i) => `res-${i}`);
    const handlers = buildResourceFilterHandlers(ui, new Set(atCap), setSelectedResourceIds);
    handlers.handleToggleResource('res-overflow');

    const updater = setSelectedResourceIds.mock.calls[0][0] as (
      current: readonly string[],
    ) => readonly string[];
    expect(updater(atCap)).toEqual(atCap);
  });

  it('handleToggleResource still allows removing a resource while at the cap (TD44)', () => {
    const ui = makeUi();
    const setSelectedResourceIds = vi.fn();
    const atCap = Array.from({ length: RESOURCE_FILTER_MAX_SELECTED }, (_, i) => `res-${i}`);
    const handlers = buildResourceFilterHandlers(ui, new Set(atCap), setSelectedResourceIds);
    handlers.handleToggleResource('res-0');

    const updater = setSelectedResourceIds.mock.calls[0][0] as (
      current: readonly string[],
    ) => readonly string[];
    expect(updater(atCap)).toEqual(atCap.slice(1));
  });

  it('handleToggleResource adds normally below the cap, non-regression (TD44)', () => {
    const ui = makeUi();
    const setSelectedResourceIds = vi.fn();
    const belowCap = Array.from({ length: RESOURCE_FILTER_MAX_SELECTED - 1 }, (_, i) => `res-${i}`);
    const handlers = buildResourceFilterHandlers(ui, new Set(belowCap), setSelectedResourceIds);
    handlers.handleToggleResource('res-new');

    const updater = setSelectedResourceIds.mock.calls[0][0] as (
      current: readonly string[],
    ) => readonly string[];
    expect(updater(belowCap)).toEqual([...belowCap, 'res-new']);
  });

  it('handleResetResourceFilter clears the selection', () => {
    const ui = makeUi();
    const setSelectedResourceIds = vi.fn();
    buildResourceFilterHandlers(
      ui,
      new Set(['res-1']),
      setSelectedResourceIds,
    ).handleResetResourceFilter();
    expect(setSelectedResourceIds).toHaveBeenCalledWith([]);
  });

  it('handleToggleResourceFilterOpen flips the open flag', () => {
    const ui = makeUi();
    buildResourceFilterHandlers(ui, new Set(), vi.fn()).handleToggleResourceFilterOpen();
    const updater = (ui.setResourceFilterOpen as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      current: boolean,
    ) => boolean;
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });

  it('handleCloseResourceFilter closes the popover', () => {
    const ui = makeUi();
    buildResourceFilterHandlers(ui, new Set(), vi.fn()).handleCloseResourceFilter();
    expect(ui.setResourceFilterOpen).toHaveBeenCalledWith(false);
  });
});
