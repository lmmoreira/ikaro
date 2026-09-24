'use client';

import { useMemo } from 'react';
import type {
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import {
  buildTimelineDayData,
  type TimelineDayData,
} from '@/features/booking/schedule/schedule-timeline';
import {
  buildActiveDates,
  buildDimmedDates,
  buildWeekDayInfo,
  type ScheduleWeekDayInfo,
} from '@/features/booking/schedule/schedule-page-derived';

interface ScheduleTimelineDerivedInput {
  readonly weekDates: readonly string[];
  readonly visibleClosures: readonly ScheduleClosure[];
  readonly visibleOpenings: readonly ScheduleOpening[];
  readonly visibleBookings: readonly StaffBookingCardResponse[];
  readonly businessHours: TenantBusinessHours;
  readonly timezone: string;
  readonly slotGranularityMinutes: number;
  readonly selectedDateKey: string;
  readonly resourceNameById: ReadonlyMap<string, string>;
  // Week view's own booking resource-filtering/badges (TD44 Story 1) — deliberately consumed only
  // by useWeekTimelineCards below, never useSelectedDayTimeline: Day view's merged single-day
  // timeline only ever renders when zero resources are checked (1+ switches to the separate
  // ScheduleResourceColumnsBoard instead, which pre-filters its own bookings list before this
  // layer ever sees it), so threading these into the Day-view path would be dead code.
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly bookingResourceIdsById: ReadonlyMap<string, readonly string[]>;
}

// Translates the query layer's bookingId -> resourceId[] lookup (schedule-page-query-data.ts) into
// bookingId -> resourceName[], sorted per booking for a stable badge order regardless of check
// order — mirrors schedule-resource-columns.ts's own alphabetical-stability choice for the
// analogous Day-view case. Built once per render and reused across all 7 week day-cards below.
function buildBookingResourceNamesById(
  bookingResourceIdsById: ReadonlyMap<string, readonly string[]>,
  resourceNameById: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...bookingResourceIdsById].map(([bookingId, resourceIds]) => [
      bookingId,
      [...resourceIds]
        .map((resourceId) => resourceNameById.get(resourceId) ?? resourceId)
        .sort((a, b) => a.localeCompare(b)),
    ]),
  );
}

function useScheduleWeekDayDerived(input: ScheduleTimelineDerivedInput): {
  readonly weekDayInfo: ScheduleWeekDayInfo[];
  readonly activeDates: Set<string>;
  readonly dimmedDates: Set<string>;
} {
  const { weekDates, visibleOpenings, businessHours, visibleBookings, visibleClosures, timezone } =
    input;

  const weekDayInfo = useMemo(
    () => buildWeekDayInfo(weekDates, visibleOpenings, businessHours),
    [businessHours, visibleOpenings, weekDates],
  );
  const activeDates = useMemo(
    () => buildActiveDates(visibleBookings, visibleOpenings, visibleClosures, timezone),
    [timezone, visibleBookings, visibleClosures, visibleOpenings],
  );
  const dimmedDates = useMemo(() => buildDimmedDates(weekDayInfo), [weekDayInfo]);

  return { weekDayInfo, activeDates, dimmedDates };
}

function useSelectedDayTimeline(input: ScheduleTimelineDerivedInput): TimelineDayData {
  const {
    visibleBookings,
    visibleClosures,
    visibleOpenings,
    businessHours,
    timezone,
    slotGranularityMinutes,
    selectedDateKey,
    resourceNameById,
  } = input;

  return useMemo(
    () =>
      buildTimelineDayData({
        selectedDateKey,
        timezone,
        slotGranularityMinutes,
        businessHours,
        bookings: visibleBookings,
        closures: visibleClosures,
        openings: visibleOpenings,
        resourceNameById,
      }),
    [
      businessHours,
      selectedDateKey,
      slotGranularityMinutes,
      timezone,
      visibleBookings,
      visibleClosures,
      visibleOpenings,
      resourceNameById,
    ],
  );
}

// Extracted from useWeekTimelineCards below purely to stay under the 40-line function cap once
// TD44 Story 1's resource-filter/badge params landed there — same per-day mapping, no behavior
// change. Not itself a hook: plain data transformation, called from inside the useMemo factory.
function buildWeekTimelineCards(
  weekDayInfo: readonly ScheduleWeekDayInfo[],
  visibleBookings: readonly StaffBookingCardResponse[],
  visibleClosures: readonly ScheduleClosure[],
  visibleOpenings: readonly ScheduleOpening[],
  businessHours: TenantBusinessHours,
  timezone: string,
  slotGranularityMinutes: number,
  resourceNameById: ReadonlyMap<string, string>,
  selectedResourceIdSet: ReadonlySet<string>,
  bookingResourceNamesById: ReadonlyMap<string, readonly string[]>,
): TimelineDayData[] {
  return weekDayInfo.map((day) =>
    buildTimelineDayData({
      selectedDateKey: day.dateKey,
      timezone,
      slotGranularityMinutes,
      businessHours,
      bookings: visibleBookings,
      closures: visibleClosures,
      openings: visibleOpenings,
      slotHeightScale: 0.45,
      resourceNameById,
      selectedResourceIdSet,
      bookingResourceNamesById,
    }),
  );
}

// Extracted from useWeekTimelineCards below (same 40-line-cap reason) — its own useMemo, so the
// resolved names map stays referentially stable across renders whenever its own inputs don't
// change; buildBookingResourceNamesById itself always returns a fresh Map.
function useBookingResourceNamesById(
  bookingResourceIdsById: ReadonlyMap<string, readonly string[]>,
  resourceNameById: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> {
  return useMemo(
    () => buildBookingResourceNamesById(bookingResourceIdsById, resourceNameById),
    [bookingResourceIdsById, resourceNameById],
  );
}

// Reads fields directly off `input` (rather than destructuring first) so each field's own member
// expression, not the whole `input` object, is what the dependency arrays below track — `input`
// itself is a fresh object every render (schedule-page-core-data.ts constructs it inline), so
// depending on it directly would defeat both memos entirely.
function useWeekTimelineCards(
  input: ScheduleTimelineDerivedInput,
  weekDayInfo: readonly ScheduleWeekDayInfo[],
): TimelineDayData[] {
  const bookingResourceNamesById = useBookingResourceNamesById(
    input.bookingResourceIdsById,
    input.resourceNameById,
  );

  return useMemo(
    () =>
      buildWeekTimelineCards(
        weekDayInfo,
        input.visibleBookings,
        input.visibleClosures,
        input.visibleOpenings,
        input.businessHours,
        input.timezone,
        input.slotGranularityMinutes,
        input.resourceNameById,
        input.selectedResourceIdSet,
        bookingResourceNamesById,
      ),
    [
      weekDayInfo,
      input.visibleBookings,
      input.visibleClosures,
      input.visibleOpenings,
      input.businessHours,
      input.timezone,
      input.slotGranularityMinutes,
      input.resourceNameById,
      input.selectedResourceIdSet,
      bookingResourceNamesById,
    ],
  );
}

// Extracted from SchedulePage (TD37-S5A) — turning the week's raw closures/openings/bookings into
// per-day timeline layouts (week-day metadata, active/dimmed dates, and the timeline blocks
// themselves) is a cohesive computation, independent of the page's interactive UI state.
export function useScheduleTimelineDerived(input: ScheduleTimelineDerivedInput): {
  readonly weekDayInfo: ScheduleWeekDayInfo[];
  readonly activeDates: Set<string>;
  readonly dimmedDates: Set<string>;
  readonly selectedDayTimeline: TimelineDayData;
  readonly weekTimelineCards: TimelineDayData[];
} {
  const { weekDayInfo, activeDates, dimmedDates } = useScheduleWeekDayDerived(input);
  const selectedDayTimeline = useSelectedDayTimeline(input);
  const weekTimelineCards = useWeekTimelineCards(input, weekDayInfo);
  return { weekDayInfo, activeDates, dimmedDates, selectedDayTimeline, weekTimelineCards };
}
