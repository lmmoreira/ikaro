'use client';

import { useMemo } from 'react';
import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import { getWeekDates, getWeekEndKey } from '@/features/booking/schedule/date-utils';
import {
  useScheduleClosures,
  useScheduleOpenings,
  useWeekBookings,
} from '@/features/booking/schedule/useSchedule';

// Extracted from SchedulePage (TD37-S5A) — fetching the week's closures/openings/bookings (with
// the initial-week server-fetched fallback) is a self-contained data-loading concern.
export function useScheduleQueryData(
  weekStartKey: string,
  initialWeekStartKey: string,
  initialClosures: ScheduleClosureListResponse,
  initialOpenings: ScheduleOpeningListResponse,
  initialBookings: StaffBookingListResponse,
) {
  const weekEndKey = useMemo(() => getWeekEndKey(weekStartKey), [weekStartKey]);
  const weekDates = useMemo(() => getWeekDates(weekStartKey), [weekStartKey]);
  const isInitialWeek = weekStartKey === initialWeekStartKey;

  const { data: closures = initialClosures } = useScheduleClosures(
    weekStartKey,
    weekEndKey,
    isInitialWeek ? initialClosures : undefined,
  );
  const { data: openings = initialOpenings } = useScheduleOpenings(
    weekStartKey,
    weekEndKey,
    isInitialWeek ? initialOpenings : undefined,
  );
  const { data: bookings = initialBookings } = useWeekBookings(
    weekStartKey,
    weekEndKey,
    isInitialWeek ? initialBookings : undefined,
  );

  return {
    weekDates,
    visibleClosures: closures.items,
    visibleOpenings: openings.items,
    bookingsItems: bookings.items,
  };
}
