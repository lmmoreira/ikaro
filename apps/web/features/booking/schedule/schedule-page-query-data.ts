'use client';

import { useMemo } from 'react';
import type {
  DayGridResponse,
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import { getWeekDates, getWeekEndKey } from '@/features/booking/schedule/date-utils';
import {
  useScheduleClosures,
  useScheduleOpenings,
  useScheduleWeekDayGrid,
  useWeekBookings,
} from '@/features/booking/schedule/useSchedule';
import { buildWeekBookingResourceIds } from '@/features/booking/schedule/schedule-week-resource-bookings';

const EMPTY_BOOKING_RESOURCE_IDS_BY_ID: ReadonlyMap<string, readonly string[]> = new Map();

const EMPTY_CLOSURES: ScheduleClosureListResponse = { items: [] };
const EMPTY_OPENINGS: ScheduleOpeningListResponse = { items: [] };

interface ScopedFetchResult<T> {
  readonly data?: T;
  readonly isError: boolean;
  readonly error: unknown;
}

interface FetchErrorSource {
  readonly isError: boolean;
  readonly error: unknown;
}

// Extracted from useScheduleQueryData below — picks whichever scoped fetch actually failed, if
// any. A failed fetch must not read as "nothing to show" — the caller renders an error instead of
// an apparently valid, silently-empty schedule. A plain sequence of ifs (not a nested ternary —
// SonarCloud S3358) since there are 3 independent fetches to check in order.
function resolveScheduleFetchError(
  closuresResult: FetchErrorSource,
  openingsResult: FetchErrorSource,
  weekDayGridResult: FetchErrorSource,
): unknown {
  if (closuresResult.isError) return closuresResult.error;
  if (openingsResult.isError) return openingsResult.error;
  if (weekDayGridResult.isError) return weekDayGridResult.error;
  return null;
}

// Extracted from useScheduleQueryData below — resolving each fetch's own fallback (tenant-wide
// initial data on the initial week, else empty) and surfacing the first real fetch error found is
// a cohesive, self-contained computation.
function resolveScheduleFetchState(
  closuresResult: ScopedFetchResult<ScheduleClosureListResponse>,
  openingsResult: ScopedFetchResult<ScheduleOpeningListResponse>,
  weekDayGridResult: FetchErrorSource,
  isInitialTenantWideView: boolean,
  initialClosures: ScheduleClosureListResponse,
  initialOpenings: ScheduleOpeningListResponse,
) {
  const closures =
    closuresResult.data ?? (isInitialTenantWideView ? initialClosures : EMPTY_CLOSURES);
  const openings =
    openingsResult.data ?? (isInitialTenantWideView ? initialOpenings : EMPTY_OPENINGS);
  const scheduleFetchError = resolveScheduleFetchError(
    closuresResult,
    openingsResult,
    weekDayGridResult,
  );

  return { closures, openings, scheduleFetchError };
}

interface ScopedFetchesInput {
  readonly weekStartKey: string;
  readonly weekEndKey: string;
  readonly weekDates: readonly string[];
  readonly isInitialWeek: boolean;
  readonly isInitialTenantWideView: boolean;
  readonly initialClosures: ScheduleClosureListResponse;
  readonly initialOpenings: ScheduleOpeningListResponse;
  readonly initialBookings: StaffBookingListResponse;
  readonly resourceIds: readonly string[];
}

// Extracted from useScheduleQueryData below — issuing the 4 underlying fetches (with the
// initial-week server-fetched fallback, only ever valid on the tenant-wide scope — see
// isInitialTenantWideView's own comment at the call site) is a self-contained concern. The
// week-range day-grid fetch (TD44 Story 1) reuses useScheduleWeekDayGrid's own gate — it never
// fires when zero resources are checked, same as the columns board's single-date equivalent.
function useScopedFetches(input: ScopedFetchesInput) {
  const {
    weekStartKey,
    weekEndKey,
    weekDates,
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
  const weekDayGridResult = useScheduleWeekDayGrid(weekDates, resourceIds);

  return { closuresResult, openingsResult, bookings, weekDayGridResult };
}

// A resolved week-range day-grid fetch (TD44 Story 1) plus the checked-resource set it was fetched
// for, folded into a single bookingId -> resourceId[] lookup — empty (not undefined) whenever
// filtering isn't active (zero checked) or the fetch hasn't resolved yet, so callers never need a
// separate "is this ready" check on top of the map itself.
function resolveBookingResourceIdsById(
  weekDayGridResult: { readonly data?: readonly DayGridResponse[] },
  resourceIds: readonly string[],
): ReadonlyMap<string, readonly string[]> {
  if (resourceIds.length === 0 || !weekDayGridResult.data) {
    return EMPTY_BOOKING_RESOURCE_IDS_BY_ID;
  }
  return buildWeekBookingResourceIds(weekDayGridResult.data, new Set(resourceIds));
}

// The server always prefetches the tenant-wide (no resources checked) scope, so its initial data
// is only a valid fallback for the initial week when no resource is checked either — a mismatch
// here would flash the wrong scope's data on screen. Bookings aren't resource-scoped at all, so
// they only need the week check.
function resolveIsInitialTenantWideView(
  isInitialWeek: boolean,
  resourceIds: readonly string[],
): boolean {
  return isInitialWeek && resourceIds.length === 0;
}

// Extracted from useScheduleQueryData below (40-line function cap) — resolving the fetch-error
// state and folding in the TD44 Story 1 bookingId -> resourceId[] lookup is a self-contained tail
// step once every underlying fetch has been issued.
function useScheduleQueryDataResult(
  weekDates: readonly string[],
  closuresResult: ScopedFetchResult<ScheduleClosureListResponse>,
  openingsResult: ScopedFetchResult<ScheduleOpeningListResponse>,
  weekDayGridResult: FetchErrorSource & { readonly data?: readonly DayGridResponse[] },
  bookings: StaffBookingListResponse,
  isInitialTenantWideView: boolean,
  initialClosures: ScheduleClosureListResponse,
  initialOpenings: ScheduleOpeningListResponse,
  resourceIds: readonly string[],
) {
  const { closures, openings, scheduleFetchError } = resolveScheduleFetchState(
    closuresResult,
    openingsResult,
    weekDayGridResult,
    isInitialTenantWideView,
    initialClosures,
    initialOpenings,
  );
  const bookingResourceIdsById = useMemo(
    () => resolveBookingResourceIdsById(weekDayGridResult, resourceIds),
    [weekDayGridResult, resourceIds],
  );

  return {
    weekDates,
    visibleClosures: closures.items,
    visibleOpenings: openings.items,
    bookingsItems: bookings.items,
    scheduleFetchError,
    bookingResourceIdsById,
  };
}

// Extracted from SchedulePage (TD37-S5A) — fetching the week's closures/openings/bookings (with
// the initial-week server-fetched fallback) is a self-contained data-loading concern. TD44 Story 1
// adds the week-range day-grid fetch, reused purely as a bookingId -> resourceId[] lookup for
// Week view's own resource filtering/badges (schedule-page-timeline-derived.ts).
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
  const isInitialTenantWideView = resolveIsInitialTenantWideView(isInitialWeek, resourceIds);

  const { closuresResult, openingsResult, bookings, weekDayGridResult } = useScopedFetches({
    weekStartKey,
    weekEndKey,
    weekDates,
    isInitialWeek,
    isInitialTenantWideView,
    initialClosures,
    initialOpenings,
    initialBookings,
    resourceIds,
  });

  return useScheduleQueryDataResult(
    weekDates,
    closuresResult,
    openingsResult,
    weekDayGridResult,
    bookings,
    isInitialTenantWideView,
    initialClosures,
    initialOpenings,
    resourceIds,
  );
}
