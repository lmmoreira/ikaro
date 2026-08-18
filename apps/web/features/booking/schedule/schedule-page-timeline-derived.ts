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
      }),
    [
      businessHours,
      selectedDateKey,
      slotGranularityMinutes,
      timezone,
      visibleBookings,
      visibleClosures,
      visibleOpenings,
    ],
  );
}

function useWeekTimelineCards(
  input: ScheduleTimelineDerivedInput,
  weekDayInfo: readonly ScheduleWeekDayInfo[],
): TimelineDayData[] {
  const {
    visibleBookings,
    visibleClosures,
    visibleOpenings,
    businessHours,
    timezone,
    slotGranularityMinutes,
  } = input;

  return useMemo(
    () =>
      weekDayInfo.map((day) =>
        buildTimelineDayData({
          selectedDateKey: day.dateKey,
          timezone,
          slotGranularityMinutes,
          businessHours,
          bookings: visibleBookings,
          closures: visibleClosures,
          openings: visibleOpenings,
          slotHeightScale: 0.45,
        }),
      ),
    [
      businessHours,
      slotGranularityMinutes,
      timezone,
      visibleBookings,
      visibleClosures,
      visibleOpenings,
      weekDayInfo,
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
