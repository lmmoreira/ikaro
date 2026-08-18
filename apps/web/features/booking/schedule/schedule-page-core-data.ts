'use client';

import { useMemo } from 'react';
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

function useScheduleVisibleData(props: SchedulePageControllerInput, ui: ScheduleUiState) {
  const {
    initialClosures,
    initialOpenings,
    initialBookings,
    weekStartKey: initialWeekStartKey,
  } = props;

  const { weekDates, visibleClosures, visibleOpenings, bookingsItems } = useScheduleQueryData(
    ui.weekStartKey,
    initialWeekStartKey,
    initialClosures,
    initialOpenings,
    initialBookings,
  );
  const { selectedStatuses, setSelectedStatuses, viewMode, setViewMode } = useSchedulePreferences();
  const selectedStatusSet = useMemo(() => new Set(selectedStatuses), [selectedStatuses]);
  const visibleBookings = useMemo(
    () => bookingsItems.filter((booking) => selectedStatusSet.has(booking.status)),
    [bookingsItems, selectedStatusSet],
  );

  const isDesktopSchedule = useMediaQuery('(min-width: 1024px)');
  const scheduleViewMode: ScheduleViewMode = viewMode ?? (isDesktopSchedule ? 'week' : 'day');

  return {
    weekDates,
    visibleClosures,
    visibleOpenings,
    visibleBookings,
    selectedStatusSet,
    setSelectedStatuses,
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
    setPersistedViewMode: visible.setPersistedViewMode,
    scheduleViewMode: visible.scheduleViewMode,
    ...timelineDerived,
  };
}

export type ScheduleCoreData = ReturnType<typeof useScheduleCoreData>;
