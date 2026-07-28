'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { DayPicker, type DayButtonProps } from 'react-day-picker';
import { enUS, ptBR } from 'date-fns/locale';
import type { DaySummary } from '@ikaro/types';
import { fetchAvailabilitySummary } from '@/features/platform/hotsite/api/schedule';
import { resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { ErrorAlert } from './ErrorAlert';

interface AvailabilityCalendarProps {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly maxBookingAdvanceDays: number;
}

// DayPicker's CalendarDay represents local calendar days, not UTC instants — these helpers
// mirror that. shared/lib/formatting/date-utils.ts's addDays/toISODate are UTC-based and stay
// that way for the carousel's own from/to range math; mixing the two conventions here would
// reintroduce the exact off-by-one risk this local-only approach avoids.
function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function resolveDayPickerLocale(locale: string) {
  return resolveSupportedLocale(locale) === 'en' ? enUS : ptBR;
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
    return {
      color: 'var(--ba-secondary, rgb(191 219 254))',
      opacity: 0.5,
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
      data-testid="calendar-day"
      data-date={day.isoDate}
      className="flex h-9 w-9 items-center justify-center text-sm font-medium transition-opacity hover:opacity-80"
      style={{ ...style, borderRadius: 'var(--ba-radius)', ...getDayButtonStyle(modifiers) }}
    >
      {day.date.getDate()}
    </button>
  );
}

const DAY_PICKER_COMPONENTS = { DayButton: CalendarDayButton };

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

  const todayIso = useMemo(() => toLocalISODate(new Date()), []);
  const maxDateIso = useMemo(
    () => toLocalISODate(addLocalDays(new Date(), maxBookingAdvanceDays - 1)),
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
  const days = useMemo(
    () => (monthEntirelyOutOfRange ? [] : isCurrent ? result?.days : undefined),
    [monthEntirelyOutOfRange, isCurrent, result],
  );
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
    onSelectDate(toLocalISODate(date));
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
        onMonthChange={setMonth}
        startMonth={startOfMonth(new Date())}
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
        className="p-0"
        classNames={{
          month_caption: 'flex h-10 items-center justify-center text-sm font-semibold',
          weekday: 'text-xs font-normal opacity-60',
          nav: 'flex items-center justify-between',
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
