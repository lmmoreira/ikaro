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
  resourceIds: readonly string[],
) {
  const weekEndKey = useMemo(() => getWeekEndKey(weekStartKey), [weekStartKey]);
  const weekDates = useMemo(() => getWeekDates(weekStartKey), [weekStartKey]);
  const isInitialWeek = weekStartKey === initialWeekStartKey;
  // The server always prefetches the tenant-wide (no resources checked) scope, so its initial
  // data is only a valid fallback for the initial week when no resource is checked either. The
  // `data =` destructuring default below must mirror this exact condition — falling back to the
  // (possibly stale, always tenant-wide) `initialClosures`/`initialOpenings` while a *different*
  // week or resource scope's query is still loading would flash the wrong scope's data on screen.
  // Bookings aren't resource-scoped at all (out of this milestone's scope), so they only need the
  // week check.
  const isInitialTenantWideView = isInitialWeek && resourceIds.length === 0;

  const { data: closures = isInitialTenantWideView ? initialClosures : EMPTY_CLOSURES } =
    useScheduleClosures(
      weekStartKey,
      weekEndKey,
      isInitialTenantWideView ? initialClosures : undefined,
      resourceIds,
    );
  const { data: openings = isInitialTenantWideView ? initialOpenings : EMPTY_OPENINGS } =
    useScheduleOpenings(
      weekStartKey,
      weekEndKey,
      isInitialTenantWideView ? initialOpenings : undefined,
      resourceIds,
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
