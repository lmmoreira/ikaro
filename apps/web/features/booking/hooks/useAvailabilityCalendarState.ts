import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { DaySummary, ResourceSelectionItem } from '@ikaro/types';
import {
  earliestBookableDate,
  lastBookableDate,
  tenantToday,
} from '@/features/booking/model/booking-window';
import { fetchAvailabilitySummary } from '@/features/platform/hotsite/api/schedule';
import { localDateFromISO, toLocalISODate } from '@/shared/lib/formatting/calendar-day';

// DayPicker's cells are *local* Dates, so these two stay local-only and are only ever used to read
// the month a rendered/clicked cell belongs to — never to compute "today" or the advance-window
// boundary (see the tenant-timezone helpers in booking-window.ts, used below, for those).
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

interface FetchResult {
  // Identifies the from/to range this result was fetched for — compared against the currently
  // displayed month at render time so a month change is detected without a synchronous setState
  // reset inside the effect (react-hooks/set-state-in-effect; same tagging technique as
  // BookingPhotoPicker.tsx's candidate-photos effect).
  readonly rangeKey: string;
  readonly days: DaySummary[] | null; // null means the fetch for this range failed
}

interface FetchRange {
  readonly fromIso: string;
  readonly toIso: string;
  readonly entirelyOutOfRange: boolean;
  readonly rangeKey: string;
}

// "Today", the first day the minimum notice still leaves and the last bookable day are all the
// *tenant's* calendar days — the backend's booking-window rule uses the same day boundary, so
// the client never offers or hides a boundary day the backend disagrees with (for a UTC−3
// tenant the UTC date runs ahead of the local one for the last 3 hours of every local day).
function useBookingBounds({
  timezone,
  minBookingAdvanceHours = 0,
  maxBookingAdvanceDays,
}: Pick<
  UseAvailabilityCalendarStateParams,
  'timezone' | 'minBookingAdvanceHours' | 'maxBookingAdvanceDays'
>) {
  return useMemo(() => {
    const now = new Date();
    return {
      todayIso: tenantToday(now, timezone),
      earliestIso: earliestBookableDate(now, minBookingAdvanceHours, timezone),
      maxDateIso: lastBookableDate(now, maxBookingAdvanceDays, timezone),
    };
  }, [timezone, minBookingAdvanceHours, maxBookingAdvanceDays]);
}

// The span to ask the backend for. GetAvailabilitySummaryUseCase caps the *span* of `from`..`to`
// at maxBookingAdvanceDays, regardless of how far in the future the span starts (UC-011's own A4
// flow) — the whole calendar month can't be requested as-is for a tenant with a small limit.
// Clamping only `to` isn't enough either: `from` must clamp forward to the first bookable day too,
// since a from/to span that still starts at the 1st of the currently-viewed month (when today is
// mid-month) is a span just as easily over the limit as one reaching too far into the future.
// Past-month backward navigation is separately blocked via DayPicker's startMonth, so from never
// needs to clamp backward past the month start.
function clampFetchRange(month: Date, earliestIso: string, maxDateIso: string): FetchRange {
  const monthStartIso = toLocalISODate(startOfMonth(month));
  const monthEndIso = toLocalISODate(endOfMonth(month));
  const fromIso = monthStartIso > earliestIso ? monthStartIso : earliestIso;
  const toIso = monthEndIso < maxDateIso ? monthEndIso : maxDateIso;
  // Nothing bookable is left in the visible month once the clamped window is inverted — either
  // every day is already past the limit, or (not reachable given startMonth, kept as a guard)
  // the whole month is in the past. The fetch is skipped entirely rather than asking for a range
  // past the tenant's own configured limit.
  return { fromIso, toIso, entirelyOutOfRange: fromIso > toIso, rangeKey: `${fromIso}_${toIso}` };
}

interface RangeFetchParams {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly resourceSelections?: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
  readonly range: FetchRange;
  readonly retryCount: number;
  readonly setResult: Dispatch<SetStateAction<FetchResult | null>>;
}

// Fetches the range's availability and stores the result tagged with the range it belongs to.
function useRangeFetch(params: RangeFetchParams): void {
  const { slug, serviceIds, resourceSelections, durationMinutes, range, retryCount, setResult } =
    params;
  const { fromIso, toIso, entirelyOutOfRange, rangeKey } = range;

  useEffect(() => {
    if (entirelyOutOfRange) return;
    let cancelled = false;

    fetchAvailabilitySummary(slug, fromIso, toIso, serviceIds, {
      resourceSelections,
      durationMinutes,
    })
      .then((fetchedDays) => {
        if (!cancelled) setResult({ rangeKey, days: fetchedDays });
      })
      .catch(() => {
        if (!cancelled) setResult({ rangeKey, days: null });
      });

    return () => {
      cancelled = true;
    };
  }, [
    slug,
    serviceIds,
    resourceSelections,
    durationMinutes,
    fromIso,
    toIso,
    entirelyOutOfRange,
    rangeKey,
    retryCount,
    setResult,
  ]);
}

// The days of the visible range: `undefined` while loading, `null` (with `error`) once the load
// failed, `[]` when nothing in the month is bookable.
function useAvailabilityDays(params: Omit<RangeFetchParams, 'retryCount' | 'setResult'>) {
  const { range } = params;
  const [result, setResult] = useState<FetchResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const isCurrent = result?.rangeKey === range.rangeKey;
  const days = useMemo(() => {
    if (range.entirelyOutOfRange) return [];
    if (isCurrent) return result?.days;
    return undefined;
  }, [range.entirelyOutOfRange, isCurrent, result]);
  const error = !range.entirelyOutOfRange && isCurrent && result?.days === null;

  useRangeFetch({ ...params, retryCount, setResult });

  const retry = useCallback(() => {
    setResult(null);
    setRetryCount((c) => c + 1);
  }, []);

  return { days, error, retry };
}

// Which days the picker must disable or treat as beyond the tenant's booking window.
function useDayPredicates(
  days: DaySummary[] | null | undefined,
  earliestIso: string,
  maxDateIso: string,
) {
  const availabilityByDate = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const day of days ?? []) {
      map.set(day.date, day.available);
    }
    return map;
  }, [days]);

  const isOutOfRange = useCallback((date: Date) => toLocalISODate(date) > maxDateIso, [maxDateIso]);

  // Dates before the first bookable day (already past, or inside the minimum notice) are never
  // fetched (the range clamps forward) — availabilityByDate has no entry for them, so they'd
  // otherwise read as available. Disabling them outright (rather than treating them as "out of
  // range") matches business reality: such a date isn't a forward-looking limit the tenant
  // configured, it's simply not bookable.
  const isPast = useCallback((date: Date) => toLocalISODate(date) < earliestIso, [earliestIso]);

  const isUnavailable = useCallback(
    (date: Date) => availabilityByDate.get(toLocalISODate(date)) === false,
    [availabilityByDate],
  );

  const isDisabled = (date: Date): boolean =>
    isPast(date) || (!isOutOfRange(date) && isUnavailable(date));

  return { isDisabled, isOutOfRange };
}

interface CalendarInteractionParams {
  readonly rangeKey: string;
  readonly isOutOfRange: (date: Date) => boolean;
  readonly onSelectDate: (date: string) => void;
  readonly setMonth: Dispatch<SetStateAction<Date>>;
}

// Clicking a day and navigating between months, including the "beyond the booking window" notice.
function useCalendarInteraction(params: CalendarInteractionParams) {
  const { rangeKey, isOutOfRange, onSelectDate, setMonth } = params;
  // Tagged with the range it was raised for, so navigating to a different month clears it
  // without an effect-driven reset — mirrors the result/rangeKey staleness check above.
  const [outOfRangeMessageKey, setOutOfRangeMessageKey] = useState<string | null>(null);

  function handleSelect(date: Date | undefined): void {
    if (!date) return;
    if (isOutOfRange(date)) {
      setOutOfRangeMessageKey(rangeKey);
      return;
    }
    setOutOfRangeMessageKey(null);
    onSelectDate(toLocalISODate(date));
  }

  function handleMonthChange(newMonth: Date): void {
    setMonth(newMonth);
    // Otherwise a stale out-of-range message from a previous visit to this same month
    // reappears immediately on navigating back to it, with no new click causing it.
    setOutOfRangeMessageKey(null);
  }

  return {
    showOutOfRangeMessage: outOfRangeMessageKey === rangeKey,
    handleSelect,
    handleMonthChange,
  };
}

interface UseAvailabilityCalendarStateParams {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly maxBookingAdvanceDays: number;
  readonly minBookingAdvanceHours?: number;
  readonly timezone: string;
  readonly resourceSelections?: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
}

// What the availability calendar shows and does: the month in view, the days the backend reports
// for it, which days are disabled, and what a click or a month change leads to.
export function useAvailabilityCalendarState(params: UseAvailabilityCalendarStateParams) {
  const { selectedDate, onSelectDate } = params;
  const { todayIso, earliestIso, maxDateIso } = useBookingBounds(params);
  const [month, setMonth] = useState(() => startOfMonth(localDateFromISO(todayIso)));
  const range = clampFetchRange(month, earliestIso, maxDateIso);
  const { days, error, retry } = useAvailabilityDays({ ...params, range });
  const { isDisabled, isOutOfRange } = useDayPredicates(days, earliestIso, maxDateIso);
  const interaction = useCalendarInteraction({
    rangeKey: range.rangeKey,
    isOutOfRange,
    onSelectDate,
    setMonth,
  });

  return {
    month,
    startMonth: startOfMonth(localDateFromISO(todayIso)),
    endMonth: localDateFromISO(maxDateIso),
    selected: selectedDate ? localDateFromISO(selectedDate) : undefined,
    days,
    error,
    isDisabled,
    isOutOfRange,
    handleRetry: retry,
    ...interaction,
  };
}
