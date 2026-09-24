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
// handlers are a cohesive, self-contained unit. Takes the already-memoized `selectedStatusSet`
// (computed once in useScheduleCoreData for filtering visibleBookings) rather than rebuilding a
// fresh Set from the raw array on every render.
export function buildStatusFilterHandlers(
  ui: ScheduleUiState,
  selectedStatusSet: ReadonlySet<BookingStatus>,
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
    selectedStatusSet,
    handleToggleStatus,
    handleResetStatusFilter: () => setSelectedStatuses(SCHEDULE_BOOKING_STATUS_DEFAULT),
    handleToggleStatusFilterOpen: () => ui.setStatusFilterOpen((current) => !current),
    handleCloseStatusFilter: () => ui.setStatusFilterOpen(false),
  };
}

// TD44 Story 0 — bounds how many full ScheduleTimelineBoard columns ScheduleResourceColumnsBoard
// ever has to render at once. Enforced here, at the toggle source, rather than by slicing/warning
// downstream in the columns board: the checked set can then never exceed the cap, so there's no
// second "rendered vs. checked" state to keep in sync. ResourceFilterMenu imports this same
// constant to disable further checkboxes once the cap is reached.
export const RESOURCE_FILTER_MAX_SELECTED = 6;

// Mirrors buildStatusFilterHandlers above — the resource-filter popover's toggle/reset/open/close
// handlers are the identical shape, just over resource ids instead of booking statuses. No
// "normalize against a known set" step here (unlike statuses): resources are a dynamic,
// tenant-fetched list, not a fixed enum.
export function buildResourceFilterHandlers(
  ui: ScheduleUiState,
  selectedResourceIdSet: ReadonlySet<string>,
  setSelectedResourceIds: (selectedResourceIds: SetStateAction<readonly string[]>) => void,
) {
  function handleToggleResource(resourceId: string): void {
    setSelectedResourceIds((current) => {
      const next = new Set(current);
      if (next.has(resourceId)) {
        next.delete(resourceId);
      } else if (next.size >= RESOURCE_FILTER_MAX_SELECTED) {
        return current;
      } else {
        next.add(resourceId);
      }
      return [...next];
    });
  }

  return {
    selectedResourceIdSet,
    handleToggleResource,
    handleResetResourceFilter: () => setSelectedResourceIds([]),
    handleToggleResourceFilterOpen: () => ui.setResourceFilterOpen((current) => !current),
    handleCloseResourceFilter: () => ui.setResourceFilterOpen(false),
  };
}
