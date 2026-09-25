'use client';

import { useMemo } from 'react';
import type {
  ResourceType,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import {
  buildTimelineDayData,
  COMPACT_MIN_BLOCK_HEIGHT_PX,
  DESKTOP_MIN_BLOCK_HEIGHT_PX,
  type TimelineDayData,
} from '@/features/booking/schedule/schedule-timeline';
import {
  buildActiveDates,
  buildDimmedDates,
  buildWeekDayInfo,
  type ScheduleWeekDayInfo,
} from '@/features/booking/schedule/schedule-page-derived';
import { compareResourceIdsByTypePriority } from '@/features/booking/schedule/schedule-resource-priority';

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
  // Sibling to resourceNameById (TD44 Story 2) — feeds compareResourceIdsByTypePriority below.
  readonly resourceTypeById: ReadonlyMap<string, ResourceType>;
  // Week view's own booking resource-filtering/badges (TD44 Story 1) — deliberately consumed only
  // by useWeekTimelineCards below, never useSelectedDayTimeline: Day view's merged single-day
  // timeline only ever renders when zero resources are checked (1+ switches to the separate
  // ScheduleResourceColumnsBoard instead, which pre-filters its own bookings list before this
  // layer ever sees it), so threading these into the Day-view path would be dead code.
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly bookingResourceIdsById: ReadonlyMap<string, readonly string[]>;
}

// Translates the query layer's bookingId -> resourceId[] lookup (schedule-page-query-data.ts) into
// bookingId -> resourceName[], sorted per booking for a stable order regardless of check order —
// type-prioritized (STAFF > ROOM > EQUIPMENT) first, alphabetical tiebreak within the same type
// (TD44 Story 2; was a plain alphabetical sort before). The renderer only ever reads index 0 +
// length, so the priority resource is always resourceNames[0]. Built once per render and reused
// across all 7 week day-cards below.
function buildBookingResourceNamesById(
  bookingResourceIdsById: ReadonlyMap<string, readonly string[]>,
  resourceNameById: ReadonlyMap<string, string>,
  resourceTypeById: ReadonlyMap<string, ResourceType>,
): ReadonlyMap<string, readonly string[]> {
  const compare = compareResourceIdsByTypePriority(resourceNameById, resourceTypeById);
  return new Map(
    [...bookingResourceIdsById].map(([bookingId, resourceIds]) => [
      bookingId,
      [...resourceIds]
        .sort(compare)
        .map((resourceId) => resourceNameById.get(resourceId) ?? resourceId),
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
        minSlotHeightPx: DESKTOP_MIN_BLOCK_HEIGHT_PX,
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
interface WeekTimelineCardsSharedInput {
  readonly visibleBookings: readonly StaffBookingCardResponse[];
  readonly visibleClosures: readonly ScheduleClosure[];
  readonly visibleOpenings: readonly ScheduleOpening[];
  readonly businessHours: TenantBusinessHours;
  readonly timezone: string;
  readonly slotGranularityMinutes: number;
  readonly resourceNameById: ReadonlyMap<string, string>;
  readonly selectedResourceIdSet: ReadonlySet<string>;
}

// Bundles the shared fields into one object (SonarCloud S107 — max 7 positional params) rather
// than 10 individual arguments.
function buildWeekTimelineCards(
  weekDayInfo: readonly ScheduleWeekDayInfo[],
  shared: WeekTimelineCardsSharedInput,
  bookingResourceNamesById: ReadonlyMap<string, readonly string[]>,
): TimelineDayData[] {
  const {
    visibleBookings,
    visibleClosures,
    visibleOpenings,
    businessHours,
    timezone,
    slotGranularityMinutes,
    resourceNameById,
    selectedResourceIdSet,
  } = shared;

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
      minSlotHeightPx: COMPACT_MIN_BLOCK_HEIGHT_PX,
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
  resourceTypeById: ReadonlyMap<string, ResourceType>,
): ReadonlyMap<string, readonly string[]> {
  return useMemo(
    () => buildBookingResourceNamesById(bookingResourceIdsById, resourceNameById, resourceTypeById),
    [bookingResourceIdsById, resourceNameById, resourceTypeById],
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
    input.resourceTypeById,
  );

  return useMemo(
    () =>
      buildWeekTimelineCards(
        weekDayInfo,
        {
          visibleBookings: input.visibleBookings,
          visibleClosures: input.visibleClosures,
          visibleOpenings: input.visibleOpenings,
          businessHours: input.businessHours,
          timezone: input.timezone,
          slotGranularityMinutes: input.slotGranularityMinutes,
          resourceNameById: input.resourceNameById,
          selectedResourceIdSet: input.selectedResourceIdSet,
        },
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
