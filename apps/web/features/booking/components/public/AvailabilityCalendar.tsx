'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  DayPicker,
  type ChevronProps,
  type DayButtonProps,
  type NextMonthButtonProps,
  type PreviousMonthButtonProps,
} from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DaySummary } from '@ikaro/types';
import { fetchAvailabilitySummary } from '@/features/platform/hotsite/api/schedule';
import {
  addDays as addUTCDays,
  toISODate as toUTCISODate,
} from '@/shared/lib/formatting/date-utils';
import { resolveDayPickerLocale } from '@/shared/lib/i18n/day-picker-locale';
import { cn } from '@/shared/utils/cn';
import { ErrorAlert } from './ErrorAlert';

interface AvailabilityCalendarProps {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly maxBookingAdvanceDays: number;
}

// DayPicker's CalendarDay wraps a *local* Date instance for each rendered cell — reading it back
// with UTC getters would shift the cell's own calendar day for any viewer not at UTC+0 (e.g. a
// local midnight in a positive-offset timezone is still "yesterday" in UTC). These two helpers
// stay local-only and are only ever used to read the date a specific rendered/clicked cell
// represents — never to compute "today" or the advance-window boundary (see toUTCISODate/
// addUTCDays below, imported from date-utils.ts, for those).
function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// Inline styles (not Tailwind arbitrary-value classes) — same technique AvailabilityCarousel
// uses for its selected/unselected day styling, and required here so --ba-* values are
// assertable via toHaveStyle() in jsdom, which never resolves Tailwind's JIT classes to computed
// styles.
function getDayButtonStyle(modifiers: DayButtonProps['modifiers']): React.CSSProperties {
  if (modifiers.selected) {
    return {
      backgroundColor: 'var(--ba-primary, #2563eb)',
      color: 'var(--ba-btn-text, #ffffff)',
      boxShadow: 'var(--ba-shadow, 0 1px 3px rgba(0,0,0,0.10))',
    };
  }
  if (modifiers.disabled || modifiers.outOfRange) {
    // Deliberately not a --ba-* token: --ba-secondary is a light *background* tint by design
    // (used as backgroundColor everywhere else below), and using it as *text* color here made
    // disabled days unreadable for tenants with a pale secondary color. A disabled/muted day is
    // an inherently de-emphasized, non-branded state — same reasoning the shared dashboard
    // Calendar already follows for its own disabled modifier (plain gray, no brand token).
    return {
      backgroundColor: 'transparent',
      color: '#9ca3af',
      opacity: 0.6,
      cursor: 'not-allowed',
    };
  }
  if (modifiers.today) {
    return {
      backgroundColor: 'var(--ba-secondary, rgb(239 246 255))',
      color: 'var(--ba-primary, #1d4ed8)',
      boxShadow: 'inset 0 0 0 2px var(--ba-primary, #2563eb)',
    };
  }
  return {
    backgroundColor: 'var(--ba-secondary, rgb(239 246 255))',
    color: 'var(--ba-primary, #1d4ed8)',
  };
}

function CalendarDayButton({ day, modifiers, style, ...rest }: DayButtonProps): React.JSX.Element {
  return (
    <button
      {...rest}
      type="button"
      data-testid="calendar-day"
      data-date={day.isoDate}
      className="flex h-9 w-9 items-center justify-center text-base font-semibold transition-opacity hover:opacity-80"
      style={{ ...style, borderRadius: 'var(--ba-radius)', ...getDayButtonStyle(modifiers) }}
    >
      {day.date.getDate()}
    </button>
  );
}

function CalendarChevron({
  className,
  orientation,
  disabled: _disabled,
  size: _size,
  ...rest
}: Readonly<ChevronProps>): React.JSX.Element {
  const Icon = orientation === 'right' ? ChevronRight : ChevronLeft;
  return <Icon className={cn('h-4 w-4', className)} {...rest} />;
}

function CalendarPreviousMonthButton(props: PreviousMonthButtonProps): React.JSX.Element {
  return <button {...props} data-testid="calendar-previous-month" />;
}

function CalendarNextMonthButton(props: NextMonthButtonProps): React.JSX.Element {
  return <button {...props} data-testid="calendar-next-month" />;
}

const DAY_PICKER_COMPONENTS = {
  DayButton: CalendarDayButton,
  Chevron: CalendarChevron,
  PreviousMonthButton: CalendarPreviousMonthButton,
  NextMonthButton: CalendarNextMonthButton,
};

interface FetchResult {
  // Identifies the from/to range this result was fetched for — compared against the currently
  // displayed month at render time so a month change is detected without a synchronous setState
  // reset inside the effect (react-hooks/set-state-in-effect; same tagging technique as
  // BookingPhotoPicker.tsx's candidate-photos effect).
  readonly rangeKey: string;
  readonly days: DaySummary[] | null; // null means the fetch for this range failed
}

export function AvailabilityCalendar({
  slug,
  serviceIds,
  selectedDate,
  onSelectDate,
  maxBookingAdvanceDays,
}: AvailabilityCalendarProps): React.JSX.Element {
  const t = useTranslations('booking');
  const locale = useLocale();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [result, setResult] = useState<FetchResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // Tagged with the range it was raised for, so navigating to a different month clears it
  // without an effect-driven reset — mirrors the `result`/rangeKey staleness check above.
  const [outOfRangeMessageKey, setOutOfRangeMessageKey] = useState<string | null>(null);

  // GetAvailabilitySummaryUseCase's own "today" is todayUTC() (backend/calendar-date.ts) — the
  // UTC calendar date of "now", same convention AvailabilityCarousel already uses. Deriving these
  // two boundaries from the viewer's *local* calendar date instead would drift from the backend's
  // actual cutoff for any viewer not at UTC+0 (for Brazil's own UTC-3 offset, local calendar date
  // is behind UTC's for roughly the last 3 hours of every local day), letting the client disable
  // or allow a boundary day the backend disagrees with.
  const todayIso = useMemo(() => toUTCISODate(new Date()), []);
  const maxDateIso = useMemo(
    () => toUTCISODate(addUTCDays(new Date(), maxBookingAdvanceDays - 1)),
    [maxBookingAdvanceDays],
  );

  const monthStartIso = toLocalISODate(startOfMonth(month));
  const monthEndIso = toLocalISODate(endOfMonth(month));
  // GetAvailabilitySummaryUseCase caps the *span* of `from`..`to` at maxBookingAdvanceDays,
  // regardless of how far in the future the span starts (UC-011's own A4 flow) — the whole
  // calendar month can't be requested as-is for a tenant with a small limit. Clamping only `to`
  // isn't enough either: `from` must clamp forward to *today* too, since a from/to span that
  // still starts at the 1st of the currently-viewed month (when today is mid-month) is a span
  // just as easily over the limit as one reaching too far into the future. Past-month backward
  // navigation is separately blocked via DayPicker's startMonth below, so from never needs to
  // clamp backward past the month start.
  const fetchFromIso = monthStartIso > todayIso ? monthStartIso : todayIso;
  const fetchToIso = monthEndIso < maxDateIso ? monthEndIso : maxDateIso;
  // Nothing bookable is left in the visible month once the clamped window is inverted — either
  // every day is already past the limit, or (not reachable given startMonth, kept as a guard)
  // the whole month is in the past. Skip the network call entirely rather than ask for a range
  // past the tenant's own configured limit.
  const monthEntirelyOutOfRange = fetchFromIso > fetchToIso;
  const currentRangeKey = `${fetchFromIso}_${fetchToIso}`;

  const isCurrent = result?.rangeKey === currentRangeKey;
  const days = useMemo(() => {
    if (monthEntirelyOutOfRange) return [];
    if (isCurrent) return result?.days;
    return undefined;
  }, [monthEntirelyOutOfRange, isCurrent, result]);
  const error = !monthEntirelyOutOfRange && isCurrent && result?.days === null;

  useEffect(() => {
    if (monthEntirelyOutOfRange) return;
    let cancelled = false;

    fetchAvailabilitySummary(slug, fetchFromIso, fetchToIso, serviceIds)
      .then((fetchedDays) => {
        if (!cancelled) setResult({ rangeKey: currentRangeKey, days: fetchedDays });
      })
      .catch(() => {
        if (!cancelled) setResult({ rangeKey: currentRangeKey, days: null });
      });

    return () => {
      cancelled = true;
    };
  }, [
    slug,
    serviceIds,
    fetchFromIso,
    fetchToIso,
    monthEntirelyOutOfRange,
    currentRangeKey,
    retryCount,
  ]);

  const handleRetry = useCallback(() => {
    setResult(null);
    setRetryCount((c) => c + 1);
  }, []);

  const availabilityByDate = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const day of days ?? []) {
      map.set(day.date, day.available);
    }
    return map;
  }, [days]);

  const isOutOfRange = useCallback((date: Date) => toLocalISODate(date) > maxDateIso, [maxDateIso]);

  // Past dates are never fetched (fetchFromIso clamps forward to today) — availabilityByDate has
  // no entry for them, so they'd otherwise read as available. Disabling them outright (rather
  // than treating them as "out of range") matches business reality: a date that has already
  // passed isn't a forward-looking limit the tenant configured, it's simply not bookable.
  const isPast = useCallback((date: Date) => toLocalISODate(date) < todayIso, [todayIso]);

  const isUnavailable = useCallback(
    (date: Date) => availabilityByDate.get(toLocalISODate(date)) === false,
    [availabilityByDate],
  );

  function handleSelect(date: Date | undefined): void {
    if (!date) return;
    if (isOutOfRange(date)) {
      setOutOfRangeMessageKey(currentRangeKey);
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

  if (error) {
    return (
      <ErrorAlert onRetry={handleRetry} retryLabel={t('errors.tryAgain')}>
        {t('availability.loadError')}
      </ErrorAlert>
    );
  }

  if (!days) {
    return <p>{t('availability.loading')}</p>;
  }

  return (
    <div>
      <DayPicker
        mode="single"
        locale={resolveDayPickerLocale(locale)}
        month={month}
        onMonthChange={handleMonthChange}
        startMonth={startOfMonth(new Date())}
        endMonth={new Date(`${maxDateIso}T00:00:00`)}
        showOutsideDays={false}
        selected={selectedDate ? new Date(`${selectedDate}T00:00:00`) : undefined}
        onSelect={handleSelect}
        disabled={(date) => isPast(date) || (!isOutOfRange(date) && isUnavailable(date))}
        modifiers={{ outOfRange: isOutOfRange }}
        labels={{
          labelPrevious: () => t('availability.previousMonth'),
          labelNext: () => t('availability.nextMonth'),
        }}
        components={DAY_PICKER_COMPONENTS}
        className="w-full p-0"
        classNames={{
          months: 'relative w-full',
          month: 'w-full space-y-2',
          // nav is absolutely positioned across the top of `months`, overlapping the caption
          // row — month_caption's horizontal padding (px-9, matching the 36px button size)
          // reserves the room the two buttons sit in. Mirrors shadcn's calendar registry
          // component's own nav/caption layout (ui.shadcn.com/docs/components/calendar).
          nav: 'absolute inset-x-0 top-0 flex w-full items-center justify-between',
          button_previous: cn(
            'flex h-9 w-9 items-center justify-center rounded-[var(--ba-radius)]',
            'text-[var(--ba-primary,#2563eb)] hover:opacity-70',
            'aria-disabled:opacity-30 aria-disabled:cursor-not-allowed',
          ),
          button_next: cn(
            'flex h-9 w-9 items-center justify-center rounded-[var(--ba-radius)]',
            'text-[var(--ba-primary,#2563eb)] hover:opacity-70',
            'aria-disabled:opacity-30 aria-disabled:cursor-not-allowed',
          ),
          // No `position` here (deliberately) — nav (rendered earlier in the DOM) is the only
          // positioned element in this row. Giving month_caption `relative` too made it a
          // later-DOM-order positioned sibling, which paints on top per CSS stacking rules and
          // silently swallows clicks meant for the nav buttons underneath (confirmed by testing
          // in the browser: "next month" became unclickable).
          // border-b on both rows below gives three visually distinct sections — month header,
          // weekday labels, day grid — instead of one undifferentiated block.
          month_caption:
            'flex h-9 w-full items-center justify-center border-b border-gray-100 px-9 text-sm font-semibold',
          month_grid: 'w-full border-collapse',
          weekdays: 'flex w-full border-b border-gray-100 pb-2',
          weekday: 'flex-1 text-center text-xs font-normal opacity-60',
          weeks: 'flex flex-col gap-1 pt-2',
          week: 'flex w-full',
          day: 'flex flex-1 items-center justify-center p-0',
        }}
      />

      {outOfRangeMessageKey === currentRangeKey && (
        <div className="mt-3" data-testid="calendar-out-of-range-message">
          <ErrorAlert>
            {t('availability.outOfRangeMessage', { days: maxBookingAdvanceDays })}
          </ErrorAlert>
        </div>
      )}
    </div>
  );
}
