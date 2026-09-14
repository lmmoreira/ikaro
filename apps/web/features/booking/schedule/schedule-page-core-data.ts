'use client';

import { useMemo } from 'react';
import type { BookingStatus, StaffBookingCardResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  type ScheduleViewMode,
  useSchedulePreferences,
} from '@/features/booking/schedule/schedule-preferences';
import { useMediaQuery } from '@/features/booking/hooks/useMediaQuery';
import {
  useScheduleUiState,
  type ScheduleUiState,
} from '@/features/booking/schedule/schedule-page-ui-state';
import { useScheduleQueryData } from '@/features/booking/schedule/schedule-page-query-data';
import { useScheduleTimelineDerived } from '@/features/booking/schedule/schedule-page-timeline-derived';
import type { SchedulePageControllerInput } from '@/features/booking/schedule/schedule-page-controller-types';

// Extracted from useScheduleVisibleData below — the status/resource Set derivation and the
// status-filtered booking list are a cohesive, self-contained computation, independent of the
// week's server data fetch and the view-mode resolution around it.
function useScheduleFilterSets(
  selectedStatuses: readonly BookingStatus[],
  selectedResourceIds: readonly string[],
  bookingsItems: readonly StaffBookingCardResponse[],
) {
  const selectedStatusSet = useMemo(() => new Set(selectedStatuses), [selectedStatuses]);
  const selectedResourceIdSet = useMemo(() => new Set(selectedResourceIds), [selectedResourceIds]);
  const visibleBookings = useMemo(
    () => bookingsItems.filter((booking) => selectedStatusSet.has(booking.status)),
    [bookingsItems, selectedStatusSet],
  );

  return { selectedStatusSet, selectedResourceIdSet, visibleBookings };
}

// Extracted from useScheduleVisibleData below — the week's server data fetch (closures/openings/
// bookings) is a self-contained concern, independent of the status/resource filter derivation and
// the view-mode resolution around it.
function useScheduleWeekData(
  props: SchedulePageControllerInput,
  ui: ScheduleUiState,
  selectedResourceIds: readonly string[],
) {
  const {
    initialClosures,
    initialOpenings,
    initialBookings,
    weekStartKey: initialWeekStartKey,
  } = props;

  return useScheduleQueryData(
    ui.weekStartKey,
    initialWeekStartKey,
    initialClosures,
    initialOpenings,
    initialBookings,
    selectedResourceIds,
  );
}

// Extracted from useScheduleVisibleData below — resolving the effective view mode (persisted
// preference, else desktop/mobile default) is a self-contained computation.
function useResolvedScheduleViewMode(viewMode: ScheduleViewMode | null): ScheduleViewMode {
  const isDesktopSchedule = useMediaQuery('(min-width: 1024px)');
  return viewMode ?? (isDesktopSchedule ? 'week' : 'day');
}

function useScheduleVisibleData(props: SchedulePageControllerInput, ui: ScheduleUiState) {
  const {
    selectedStatuses,
    setSelectedStatuses,
    viewMode,
    setViewMode,
    selectedResourceIds,
    setSelectedResourceIds,
  } = useSchedulePreferences();

  const { weekDates, visibleClosures, visibleOpenings, bookingsItems } = useScheduleWeekData(
    props,
    ui,
    selectedResourceIds,
  );
  const { selectedStatusSet, selectedResourceIdSet, visibleBookings } = useScheduleFilterSets(
    selectedStatuses,
    selectedResourceIds,
    bookingsItems,
  );
  const scheduleViewMode = useResolvedScheduleViewMode(viewMode);

  return {
    weekDates,
    visibleClosures,
    visibleOpenings,
    visibleBookings,
    selectedStatusSet,
    setSelectedStatuses,
    selectedResourceIdSet,
    setSelectedResourceIds,
    setPersistedViewMode: setViewMode,
    scheduleViewMode,
  };
}

// Extracted from SchedulePage (TD37-S5A) — composes the page's UI state, the week's server data
// (filtered by the selected status set), and the derived per-day timeline into one object; the
// single seam the top-level controller (useSchedulePageController) builds labels/handlers on top of.
export function useScheduleCoreData(props: SchedulePageControllerInput) {
  const {
    businessHours,
    todayKey,
    weekStartKey: initialWeekStartKey,
    initialSelectedDateKey,
    slotGranularityMinutes,
  } = props;

  const { formatDateLong, timezone } = useFormatting();
  const ui = useScheduleUiState(todayKey, initialWeekStartKey, initialSelectedDateKey);
  const visible = useScheduleVisibleData(props, ui);

  const timelineDerived = useScheduleTimelineDerived({
    weekDates: visible.weekDates,
    visibleClosures: visible.visibleClosures,
    visibleOpenings: visible.visibleOpenings,
    visibleBookings: visible.visibleBookings,
    businessHours,
    timezone,
    slotGranularityMinutes,
    selectedDateKey: ui.selectedDateKey,
  });

  return {
    ui,
    timezone,
    formatDateLong,
    visibleBookings: visible.visibleBookings,
    selectedStatusSet: visible.selectedStatusSet,
    setSelectedStatuses: visible.setSelectedStatuses,
    selectedResourceIdSet: visible.selectedResourceIdSet,
    setSelectedResourceIds: visible.setSelectedResourceIds,
    setPersistedViewMode: visible.setPersistedViewMode,
    scheduleViewMode: visible.scheduleViewMode,
    ...timelineDerived,
  };
}

export type ScheduleCoreData = ReturnType<typeof useScheduleCoreData>;
