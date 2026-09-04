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

const EMPTY_CLOSURES: ScheduleClosureListResponse = { items: [] };
const EMPTY_OPENINGS: ScheduleOpeningListResponse = { items: [] };

// Extracted from SchedulePage (TD37-S5A) — fetching the week's closures/openings/bookings (with
// the initial-week server-fetched fallback) is a self-contained data-loading concern.
export function useScheduleQueryData(
  weekStartKey: string,
  initialWeekStartKey: string,
  initialClosures: ScheduleClosureListResponse,
  initialOpenings: ScheduleOpeningListResponse,
  initialBookings: StaffBookingListResponse,
  resourceId: string | null,
) {
  const weekEndKey = useMemo(() => getWeekEndKey(weekStartKey), [weekStartKey]);
  const weekDates = useMemo(() => getWeekDates(weekStartKey), [weekStartKey]);
  // The server always prefetches the tenant-wide (resourceId = null) scope, so its initial data
  // is only a valid fallback for the initial week when no resource is selected. The `data =`
  // destructuring default below must mirror this exact condition — falling back to the (possibly
  // stale, always tenant-wide) `initialClosures`/`initialOpenings` while a *different* week or
  // resource's query is still loading would flash the wrong scope's data on screen.
  const isInitialWeek = weekStartKey === initialWeekStartKey && resourceId == null;

  const { data: closures = isInitialWeek ? initialClosures : EMPTY_CLOSURES } = useScheduleClosures(
    weekStartKey,
    weekEndKey,
    isInitialWeek ? initialClosures : undefined,
    resourceId ?? undefined,
  );
  const { data: openings = isInitialWeek ? initialOpenings : EMPTY_OPENINGS } = useScheduleOpenings(
    weekStartKey,
    weekEndKey,
    isInitialWeek ? initialOpenings : undefined,
    resourceId ?? undefined,
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
