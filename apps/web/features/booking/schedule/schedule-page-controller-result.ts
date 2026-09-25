'use client';

import { useMemo } from 'react';
import type { useTranslations } from 'next-intl';
import type {
  BookingStatus,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { parseDateKey } from '@/features/booking/schedule/date-utils';
import {
  buildScheduleReturnTo,
  type TimelineDayData,
} from '@/features/booking/schedule/schedule-timeline';
import {
  buildSlotLabels,
  type ScheduleWeekDayInfo,
} from '@/features/booking/schedule/schedule-page-derived';
import type { ScheduleUiState } from '@/features/booking/schedule/schedule-page-ui-state';
import type { ScheduleCoreData } from '@/features/booking/schedule/schedule-page-core-data';
import type { ScheduleViewMode } from '@/features/booking/schedule/schedule-preferences';
import type { SchedulePageControllerInput } from '@/features/booking/schedule/schedule-page-controller-types';
import {
  buildResourceFilterHandlers,
  buildStatusFilterHandlers,
  buildWeekNavHandlers,
  type ScheduleWeekNavHandlers,
} from '@/features/booking/schedule/schedule-page-interaction-handlers';
import { buildScheduleMutationHandlers } from '@/features/booking/schedule/schedule-page-mutation-handlers';

export interface UseSchedulePageControllerResult {
  readonly ui: ScheduleUiState;
  readonly businessHours: TenantBusinessHours;
  readonly todayKey: string;
  readonly slotGranularityMinutes: 15 | 30 | 60;
  readonly timezone: string;
  readonly statusLabels: Record<BookingStatus, string>;
  readonly scheduleViewMode: ScheduleViewMode;
  readonly setPersistedViewMode: (viewMode: ScheduleViewMode) => void;
  readonly scheduleFetchError: unknown;
  readonly resourceNameById: ReadonlyMap<string, string>;
  readonly weekDayInfo: ScheduleWeekDayInfo[];
  readonly activeDates: Set<string>;
  readonly dimmedDates: Set<string>;
  readonly selectedDayTimeline: TimelineDayData;
  readonly weekTimelineCards: TimelineDayData[];
  readonly visibleBookings: readonly StaffBookingCardResponse[];
  readonly bookingsItems: readonly StaffBookingCardResponse[];
  readonly visibleClosures: readonly ScheduleClosure[];
  readonly visibleOpenings: readonly ScheduleOpening[];
  readonly selectedDayLabel: string;
  readonly bookingCount: number;
  readonly slotLabels: string[];
  readonly scheduleReturnTo: string;
  readonly weekNav: ScheduleWeekNavHandlers;
  readonly mutationHandlers: ReturnType<typeof buildScheduleMutationHandlers>;
  readonly statusFilter: ReturnType<typeof buildStatusFilterHandlers>;
  readonly resourceFilter: ReturnType<typeof buildResourceFilterHandlers>;
}

// Extracted from SchedulePage (TD37-S5A) — deriving the selected-day label, booking count, and
// per-slot time labels from the core timeline data is a cohesive, self-contained computation.
// bookingCount (TD44 Story 4) feeds ScheduleDayHeader's inline badge.
export function useScheduleLabels(
  core: ScheduleCoreData,
  slotGranularityMinutes: number,
): {
  readonly selectedDayLabel: string;
  readonly bookingCount: number;
  readonly slotLabels: string[];
} {
  const { ui, formatDateLong, selectedDayTimeline } = core;

  const selectedDayLabel = useMemo(
    () => formatDateLong(parseDateKey(ui.selectedDateKey)),
    [formatDateLong, ui.selectedDateKey],
  );
  const bookingCount = selectedDayTimeline.events.filter(
    (event) => event.kind === 'booking',
  ).length;
  const slotLabels = useMemo(
    () =>
      buildSlotLabels(
        selectedDayTimeline.slotCount,
        selectedDayTimeline.timelineStartMinutes,
        slotGranularityMinutes,
      ),
    [
      selectedDayTimeline.slotCount,
      selectedDayTimeline.timelineStartMinutes,
      slotGranularityMinutes,
    ],
  );

  return { selectedDayLabel, bookingCount, slotLabels };
}

export interface ScheduleMutations {
  readonly createClosureMutation: Parameters<
    typeof buildScheduleMutationHandlers
  >[0]['createClosureMutation'];
  readonly createOpeningMutation: Parameters<
    typeof buildScheduleMutationHandlers
  >[0]['createOpeningMutation'];
  readonly removeClosureMutation: Parameters<
    typeof buildScheduleMutationHandlers
  >[0]['removeClosureMutation'];
  readonly removeOpeningMutation: Parameters<
    typeof buildScheduleMutationHandlers
  >[0]['removeOpeningMutation'];
}

function buildControllerHandlers(
  props: SchedulePageControllerInput,
  core: ScheduleCoreData,
  t: ReturnType<typeof useTranslations>,
  mutations: ScheduleMutations,
) {
  const { businessHours, todayKey } = props;
  const { ui, timezone, visibleBookings } = core;

  return {
    weekNav: buildWeekNavHandlers(ui, todayKey),
    mutationHandlers: buildScheduleMutationHandlers({
      ui,
      businessHours,
      timezone,
      visibleBookings,
      t,
      ...mutations,
    }),
    statusFilter: buildStatusFilterHandlers(ui, core.selectedStatusSet, core.setSelectedStatuses),
    resourceFilter: buildResourceFilterHandlers(
      ui,
      core.selectedResourceIdSet,
      core.setSelectedResourceIds,
    ),
  };
}

// Extracted from buildControllerResult below — the plain pass-through/derived fields sourced
// directly from core data are a cohesive, self-contained slice of the final result object.
function buildCoreDerivedFields(
  core: ScheduleCoreData,
): Pick<
  UseSchedulePageControllerResult,
  | 'scheduleViewMode'
  | 'setPersistedViewMode'
  | 'scheduleFetchError'
  | 'resourceNameById'
  | 'weekDayInfo'
  | 'activeDates'
  | 'dimmedDates'
  | 'weekTimelineCards'
> {
  return {
    scheduleViewMode: core.scheduleViewMode,
    setPersistedViewMode: core.setPersistedViewMode,
    scheduleFetchError: core.scheduleFetchError,
    resourceNameById: core.resourceNameById,
    weekDayInfo: core.weekDayInfo,
    activeDates: core.activeDates,
    dimmedDates: core.dimmedDates,
    weekTimelineCards: core.weekTimelineCards,
  };
}

// Extracted from SchedulePage (TD37-S5A) — assembles the final flat object the page component
// renders from, out of the core data, derived labels, and the interaction/mutation handlers.
export function buildControllerResult(
  props: SchedulePageControllerInput,
  core: ScheduleCoreData,
  labels: ReturnType<typeof useScheduleLabels>,
  t: ReturnType<typeof useTranslations>,
  mutations: ScheduleMutations,
  statusLabels: Record<BookingStatus, string>,
): UseSchedulePageControllerResult {
  const { businessHours, todayKey, slotGranularityMinutes } = props;
  const { ui, timezone, selectedDayTimeline } = core;
  const { selectedDayLabel, bookingCount, slotLabels } = labels;
  const handlers = buildControllerHandlers(props, core, t, mutations);
  const coreDerived = buildCoreDerivedFields(core);

  return {
    ui,
    businessHours,
    todayKey,
    slotGranularityMinutes,
    timezone,
    statusLabels,
    selectedDayTimeline,
    selectedDayLabel,
    bookingCount,
    slotLabels,
    scheduleReturnTo: buildScheduleReturnTo(ui.weekStartKey, ui.selectedDateKey),
    visibleBookings: core.visibleBookings,
    bookingsItems: core.bookingsItems,
    visibleClosures: core.visibleClosures,
    visibleOpenings: core.visibleOpenings,
    ...coreDerived,
    ...handlers,
  };
}
