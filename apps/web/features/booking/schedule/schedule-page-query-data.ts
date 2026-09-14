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

interface ScopedFetchResult<T> {
  readonly data?: T;
  readonly isError: boolean;
  readonly error: unknown;
}

// Extracted from useScheduleQueryData below — picks whichever scoped fetch actually failed, if
// any. A failed fetch must not read as "nothing to show" — the caller renders an error instead of
// an apparently valid, silently-empty schedule. A plain if/else (not a nested ternary — SonarCloud
// S3358) since there are 2 independent fetches to check in order.
function resolveScheduleFetchError(
  closuresResult: ScopedFetchResult<ScheduleClosureListResponse>,
  openingsResult: ScopedFetchResult<ScheduleOpeningListResponse>,
): unknown {
  if (closuresResult.isError) return closuresResult.error;
  if (openingsResult.isError) return openingsResult.error;
  return null;
}

// Extracted from useScheduleQueryData below — resolving each fetch's own fallback (tenant-wide
// initial data on the initial week, else empty) and surfacing the first real fetch error found is
// a cohesive, self-contained computation.
function resolveScheduleFetchState(
  closuresResult: ScopedFetchResult<ScheduleClosureListResponse>,
  openingsResult: ScopedFetchResult<ScheduleOpeningListResponse>,
  isInitialTenantWideView: boolean,
  initialClosures: ScheduleClosureListResponse,
  initialOpenings: ScheduleOpeningListResponse,
) {
  const closures =
    closuresResult.data ?? (isInitialTenantWideView ? initialClosures : EMPTY_CLOSURES);
  const openings =
    openingsResult.data ?? (isInitialTenantWideView ? initialOpenings : EMPTY_OPENINGS);
  const scheduleFetchError = resolveScheduleFetchError(closuresResult, openingsResult);

  return { closures, openings, scheduleFetchError };
}

interface ScopedFetchesInput {
  readonly weekStartKey: string;
  readonly weekEndKey: string;
  readonly isInitialWeek: boolean;
  readonly isInitialTenantWideView: boolean;
  readonly initialClosures: ScheduleClosureListResponse;
  readonly initialOpenings: ScheduleOpeningListResponse;
  readonly initialBookings: StaffBookingListResponse;
  readonly resourceIds: readonly string[];
}

// Extracted from useScheduleQueryData below — issuing the 3 underlying fetches (with the
// initial-week server-fetched fallback, only ever valid on the tenant-wide scope — see
// isInitialTenantWideView's own comment at the call site) is a self-contained concern.
function useScopedFetches(input: ScopedFetchesInput) {
  const {
    weekStartKey,
    weekEndKey,
    isInitialWeek,
    isInitialTenantWideView,
    initialClosures,
    initialOpenings,
    initialBookings,
    resourceIds,
  } = input;

  const closuresResult = useScheduleClosures(
    weekStartKey,
    weekEndKey,
    isInitialTenantWideView ? initialClosures : undefined,
    resourceIds,
  );
  const openingsResult = useScheduleOpenings(
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

  return { closuresResult, openingsResult, bookings };
}

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
  // data is only a valid fallback for the initial week when no resource is checked either — see
  // resolveScheduleFetchState's identical condition for why a mismatch here would flash the wrong
  // scope's data on screen. Bookings aren't resource-scoped at all (out of this milestone's
  // scope), so they only need the week check.
  const isInitialTenantWideView = isInitialWeek && resourceIds.length === 0;

  const { closuresResult, openingsResult, bookings } = useScopedFetches({
    weekStartKey,
    weekEndKey,
    isInitialWeek,
    isInitialTenantWideView,
    initialClosures,
    initialOpenings,
    initialBookings,
    resourceIds,
  });

  const { closures, openings, scheduleFetchError } = resolveScheduleFetchState(
    closuresResult,
    openingsResult,
    isInitialTenantWideView,
    initialClosures,
    initialOpenings,
  );

  return {
    weekDates,
    visibleClosures: closures.items,
    visibleOpenings: openings.items,
    bookingsItems: bookings.items,
    scheduleFetchError,
  };
}
