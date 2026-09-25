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
  // Week view's own booking *visibility* filter (TD44 Story 1) — deliberately consumed only by
  // useWeekTimelineCards below, never useSelectedDayTimeline: Day view's merged single-day
  // timeline only ever renders when zero resources are checked (1+ switches to the separate
  // ScheduleResourceColumnsBoard instead, which pre-filters its own bookings list before this
  // layer ever sees it), so threading these into the Day-view path would be dead code. Booking
  // *badge naming* is unrelated and no longer threaded through here at all (TD44-S2 round 3) —
  // BookingTimelineEvent.resourceNames now comes straight from booking.assignedResources inside
  // buildBookingTimelineEvent, since every booking carries its own resource assignments directly.
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly bookingResourceIdsById: ReadonlyMap<string, readonly string[]>;
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
// TD44 Story 1's resource-filter params landed there — same per-day mapping, no behavior change.
// Not itself a hook: plain data transformation, called from inside the useMemo factory.
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
  bookingResourceIdsById: ReadonlyMap<string, readonly string[]>,
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
      // Only ever used for a presence check (isBookingVisibleForResourceFilter — "did this
      // booking match any checked resource"), never its values, so the raw resourceId map
      // passes straight through with no name-conversion step (TD44-S2 round 3).
      bookingResourceNamesById: bookingResourceIdsById,
    }),
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
        input.bookingResourceIdsById,
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
      input.bookingResourceIdsById,
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
