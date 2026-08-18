// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleUiState } from './schedule-page-ui-state';
import {
  resetInteractiveState,
  syncWeekAndDate,
  useScheduleUiState,
} from './schedule-page-ui-state';

describe('useScheduleUiState', () => {
  it('initializes selectedDateKey from initialSelectedDateKey when provided, else todayKey', () => {
    const { result: withInitial } = renderHook(() =>
      useScheduleUiState('2026-08-20', '2026-08-17', '2026-08-18'),
    );
    expect(withInitial.current.selectedDateKey).toBe('2026-08-18');

    const { result: withoutInitial } = renderHook(() =>
      useScheduleUiState('2026-08-20', '2026-08-17'),
    );
    expect(withoutInitial.current.selectedDateKey).toBe('2026-08-20');
  });

  it('updates state through the exposed setters', () => {
    const { result } = renderHook(() => useScheduleUiState('2026-08-20', '2026-08-17'));

    act(() => result.current.setWeekStartKey('2026-08-24'));
    expect(result.current.weekStartKey).toBe('2026-08-24');

    act(() => result.current.setClosureSheetOpen(true));
    expect(result.current.closureSheetOpen).toBe(true);

    act(() => result.current.setClosureWarning('Aviso'));
    expect(result.current.closureWarning).toBe('Aviso');
  });

  it('returns a statusFilterRef for the outside-click-close hook', () => {
    const { result } = renderHook(() => useScheduleUiState('2026-08-20', '2026-08-17'));
    expect(result.current.statusFilterRef).toHaveProperty('current');
  });
});

function makeUi(overrides: Partial<ScheduleUiState> = {}): ScheduleUiState {
  return {
    weekStartKey: '2026-08-17',
    setWeekStartKey: vi.fn(),
    selectedDateKey: '2026-08-17',
    setSelectedDateKey: vi.fn(),
    closureSheetOpen: true,
    setClosureSheetOpen: vi.fn(),
    openingSheetOpen: true,
    setOpeningSheetOpen: vi.fn(),
    closureWarning: 'existing warning',
    setClosureWarning: vi.fn(),
    removeClosureTarget: null,
    setRemoveClosureTarget: vi.fn(),
    removeOpeningTarget: null,
    setRemoveOpeningTarget: vi.fn(),
    statusFilterOpen: true,
    setStatusFilterOpen: vi.fn(),
    statusFilterRef: { current: null },
    ...overrides,
  };
}

describe('resetInteractiveState', () => {
  it('clears the closure warning and closes every sheet/popover', () => {
    const ui = makeUi();
    resetInteractiveState(ui);
    expect(ui.setClosureWarning).toHaveBeenCalledWith(null);
    expect(ui.setClosureSheetOpen).toHaveBeenCalledWith(false);
    expect(ui.setOpeningSheetOpen).toHaveBeenCalledWith(false);
    expect(ui.setStatusFilterOpen).toHaveBeenCalledWith(false);
  });
});

describe('syncWeekAndDate', () => {
  it('sets the week and date, and resets interactive state', () => {
    const ui = makeUi();
    syncWeekAndDate(ui, '2026-08-24', '2026-08-25');
    expect(ui.setWeekStartKey).toHaveBeenCalledWith('2026-08-24');
    expect(ui.setSelectedDateKey).toHaveBeenCalledWith('2026-08-25');
    expect(ui.setClosureWarning).toHaveBeenCalledWith(null);
    expect(ui.setClosureSheetOpen).toHaveBeenCalledWith(false);
  });
});
