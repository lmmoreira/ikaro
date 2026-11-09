'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { PickerLoadError } from './PickerLoadError';
import type { DaySummary, ResourceSelectionItem } from '@ikaro/types';
import { fetchAvailabilitySummary } from '@/features/platform/hotsite/api/schedule';
import {
  addIsoDays,
  earliestBookableDate,
  tenantToday,
} from '@/features/booking/model/booking-window';
import { dayCarouselLabel, dayNumber, monthMarkerLabel } from '@/shared/lib/formatting/date-utils';

interface AvailabilityCarouselProps {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly carouselDays: number;
  readonly maxBookingAdvanceDays: number;
  readonly minBookingAdvanceHours?: number;
  readonly timezone: string;
  readonly resourceSelections?: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
  readonly variant?: 'hotsite' | 'dashboard';
}

const SCROLL_AMOUNT_PX = 240;
const DASHBOARD_DAY_RADIUS = '0.75rem';
const DASHBOARD_SELECTED_BLUE = '#2563eb';

export function AvailabilityCarousel({
  slug,
  serviceIds,
  selectedDate,
  onSelectDate,
  carouselDays,
  maxBookingAdvanceDays,
  minBookingAdvanceHours = 0,
  timezone,
  resourceSelections,
  durationMinutes,
  variant = 'hotsite',
}: AvailabilityCarouselProps): React.JSX.Element {
  const t = useTranslations('booking');
  const locale = useLocale();
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    // The tenant's calendar day, the same boundary the backend's booking-window rule uses. A day
    // that falls before the first one the minimum notice leaves stays in the strip (the labels
    // are positional, "today" first) but is shown unavailable.
    const now = new Date();
    const from = tenantToday(now, timezone);
    const to = addIsoDays(from, Math.min(carouselDays, maxBookingAdvanceDays) - 1);
    const earliest = earliestBookableDate(now, minBookingAdvanceHours, timezone);

    fetchAvailabilitySummary(slug, from, to, serviceIds, { resourceSelections, durationMinutes })
      .then((result) => {
        if (!cancelled) {
          setDays(result.map((day) => (day.date < earliest ? { ...day, available: false } : day)));
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    slug,
    serviceIds,
    resourceSelections,
    durationMinutes,
    carouselDays,
    maxBookingAdvanceDays,
    minBookingAdvanceHours,
    timezone,
    retryCount,
  ]);

  const handleRetry = useCallback(() => {
    setError(false);
    setDays(null);
    setRetryCount((c) => c + 1);
  }, []);

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  }

  if (error) {
    return (
      <PickerLoadError
        message={t('availability.loadError')}
        onRetry={handleRetry}
        retryLabel={t('errors.tryAgain')}
        variant={variant}
      />
    );
  }

  if (!days) {
    return <p>{t('availability.loading')}</p>;
  }

  const fullyBooked = days.every((d) => !d.available);
  const isDashboardVariant = variant === 'dashboard';

  return (
    <div>
      <div
        data-testid="day-strip"
        className={
          isDashboardVariant ? 'flex items-center justify-center gap-2' : 'flex items-center gap-2'
        }
      >
        <button
          type="button"
          aria-label={t('availability.previousDays')}
          onClick={() => scrollBy(-SCROLL_AMOUNT_PX)}
          className="hidden shrink-0 sm:block"
        >
          <ChevronLeft />
        </button>

        <div ref={scrollRef} className="flex gap-2 overflow-x-auto scroll-smooth py-1">
          {days.map((day, index) => (
            <Fragment key={day.date}>
              {isMonthStart(days, index) && (
                <MonthMarker
                  label={monthMarkerLabel(
                    day.date,
                    locale,
                    day.date.slice(0, 4) !== days[0].date.slice(0, 4),
                  )}
                  isFirst={index === 0}
                  isDashboardVariant={isDashboardVariant}
                />
              )}
              <button
                type="button"
                disabled={!day.available}
                onClick={() => onSelectDate(day.date)}
                data-testid="day-option"
                data-date={day.date}
                aria-pressed={day.date === selectedDate}
                className="flex shrink-0 flex-col items-center border px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderRadius: isDashboardVariant ? DASHBOARD_DAY_RADIUS : 'var(--ba-radius)',
                  backgroundColor: getDayBackgroundColor(
                    day.date === selectedDate,
                    isDashboardVariant,
                  ),
                  borderColor: getDayBorderColor(day.date === selectedDate, isDashboardVariant),
                  color: getDayTextColor(day.date === selectedDate, isDashboardVariant),
                  boxShadow: getDayBoxShadow(day.date === selectedDate, isDashboardVariant),
                }}
              >
                <span className="text-xs">
                  {dayCarouselLabel(day.date, index, locale, t('availability.today'))}
                </span>
                <span className="text-lg font-semibold">{dayNumber(day.date)}</span>
                {/* The marker above is aria-hidden; this keeps the month in the pill's accessible
                    name without replacing its visible text (WCAG label-in-name). */}
                <span className="sr-only">{monthMarkerLabel(day.date, locale, false)}</span>
              </button>
            </Fragment>
          ))}
        </div>

        <button
          type="button"
          aria-label={t('availability.nextDays')}
          onClick={() => scrollBy(SCROLL_AMOUNT_PX)}
          className="hidden shrink-0 sm:block"
        >
          <ChevronRight />
        </button>
      </div>

      {fullyBooked && (
        <div className="mt-3" data-testid="fully-booked-message">
          {variant === 'dashboard' ? (
            <FeedbackMessage title={t('availability.noSlots')} />
          ) : (
            <BrandedFeedbackMessage title={t('availability.noSlots')} />
          )}
        </div>
      )}
    </div>
  );
}

// A marker opens the strip and every month boundary; the comparison is on the ISO string, never a
// Date round-trip, so it cannot shift with the runtime's offset.
function isMonthStart(days: readonly DaySummary[], index: number): boolean {
  return index === 0 || days[index].date.slice(0, 7) !== days[index - 1].date.slice(0, 7);
}

// Month context for a long strip. Hotsite: only existing tenant tokens (no opacity, so its
// contrast is the tenant's own text contrast). Dashboard: Tailwind, never --ba-*.
function MonthMarker({
  label,
  isFirst,
  isDashboardVariant,
}: {
  readonly label: string;
  readonly isFirst: boolean;
  readonly isDashboardVariant: boolean;
}): React.JSX.Element {
  const dividerClass = isFirst
    ? ''
    : `border-l pl-2 ${isDashboardVariant ? 'border-gray-200' : 'border-[var(--ba-secondary)]'}`;
  return (
    <span
      data-testid="month-marker"
      aria-hidden="true"
      className={`flex shrink-0 flex-col justify-end pb-1 text-[0.7rem] font-bold uppercase tracking-wide ${
        isDashboardVariant ? 'text-gray-500' : 'text-[var(--ba-text)]'
      } ${dividerClass}`}
    >
      {label}
    </span>
  );
}

function getDayBackgroundColor(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return isDashboardVariant ? DASHBOARD_SELECTED_BLUE : 'var(--ba-primary, #2563eb)';
  }

  return isDashboardVariant ? '#ffffff' : 'var(--ba-secondary, rgb(239 246 255))';
}

function getDayBorderColor(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return isDashboardVariant ? DASHBOARD_SELECTED_BLUE : 'var(--ba-primary, #2563eb)';
  }

  return isDashboardVariant ? 'rgb(191 219 254)' : 'var(--ba-secondary, rgb(191 219 254))';
}

function getDayTextColor(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return isDashboardVariant ? '#ffffff' : 'var(--ba-btn-text, #ffffff)';
  }

  return isDashboardVariant ? 'rgb(29 78 216)' : 'var(--ba-primary, #1d4ed8)';
}

function getDayBoxShadow(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return '0 1px 2px rgba(37, 99, 235, 0.18)';
  }

  return isDashboardVariant ? '0 1px 2px rgba(15, 23, 42, 0.04)' : 'none';
}
