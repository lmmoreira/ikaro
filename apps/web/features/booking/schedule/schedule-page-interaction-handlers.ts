import type { SetStateAction } from 'react';
import type { BookingStatus } from '@ikaro/types';
import { SCHEDULE_BOOKING_STATUS_DEFAULT } from '@/features/booking/model/booking-status';
import { getWeekStartKey } from '@/features/booking/schedule/date-utils';
import {
  buildWeekShift,
  normalizeScheduleStatuses,
} from '@/features/booking/schedule/schedule-timeline';
import {
  syncWeekAndDate,
  type ScheduleUiState,
} from '@/features/booking/schedule/schedule-page-ui-state';

export interface ScheduleWeekNavHandlers {
  readonly handlePrevWeek: () => void;
  readonly handleNextWeek: () => void;
  readonly handleGoToToday: () => void;
  readonly handleSelectDate: (dateKey: string) => void;
}

// Extracted from SchedulePage (TD37-S5A) — the week-navigation handlers (prev/next/today/select)
// all funnel through the same syncWeekAndDate reset, a cohesive, self-contained unit.
export function buildWeekNavHandlers(
  ui: ScheduleUiState,
  todayKey: string,
): ScheduleWeekNavHandlers {
  return {
    handlePrevWeek: () => {
      const nextWeekStartKey = buildWeekShift(ui.weekStartKey, -7);
      syncWeekAndDate(ui, nextWeekStartKey, nextWeekStartKey);
    },
    handleNextWeek: () => {
      const nextWeekStartKey = buildWeekShift(ui.weekStartKey, 7);
      syncWeekAndDate(ui, nextWeekStartKey, nextWeekStartKey);
    },
    handleGoToToday: () => {
      const currentWeekStartKey = getWeekStartKey(todayKey);
      syncWeekAndDate(ui, currentWeekStartKey, todayKey);
    },
    handleSelectDate: (dateKey: string) => {
      ui.setSelectedDateKey(dateKey);
      ui.setClosureWarning(null);
    },
  };
}

// Extracted from SchedulePage (TD37-S5A) — the status-filter popover's toggle/select/reset/close
// handlers are a cohesive, self-contained unit.
export function buildStatusFilterHandlers(
  ui: ScheduleUiState,
  selectedStatuses: readonly BookingStatus[],
  setSelectedStatuses: (selectedStatuses: SetStateAction<readonly BookingStatus[]>) => void,
) {
  function handleToggleStatus(status: BookingStatus): void {
    setSelectedStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return normalizeScheduleStatuses([...next]);
    });
  }

  return {
    selectedStatusSet: new Set(selectedStatuses),
    handleToggleStatus,
    handleResetStatusFilter: () => setSelectedStatuses(SCHEDULE_BOOKING_STATUS_DEFAULT),
    handleToggleStatusFilterOpen: () => ui.setStatusFilterOpen((current) => !current),
    handleCloseStatusFilter: () => ui.setStatusFilterOpen(false),
  };
}
