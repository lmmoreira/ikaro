'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ErrorAlert } from './ErrorAlert';
import type { DaySummary } from '@ikaro/types';
import { fetchAvailabilitySummary } from '@/lib/api/schedule';
import { addDays, dayCarouselLabel, dayNumber, toISODate } from '@/lib/formatting/date-utils';

interface AvailabilityCarouselProps {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly carouselDays: number;
  readonly variant?: 'hotsite' | 'dashboard';
}

const SCROLL_AMOUNT_PX = 240;
const DASHBOARD_DAY_RADIUS = '0.75rem';

export function AvailabilityCarousel({
  slug,
  serviceIds,
  selectedDate,
  onSelectDate,
  carouselDays,
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

    const today = new Date();
    const from = toISODate(today);
    const to = toISODate(addDays(today, carouselDays - 1));

    fetchAvailabilitySummary(slug, from, to, serviceIds)
      .then((result) => {
        if (!cancelled) setDays(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, serviceIds, carouselDays, retryCount]);

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
      <ErrorAlert onRetry={handleRetry} retryLabel={t('errors.tryAgain')}>
        {t('availability.loadError')}
      </ErrorAlert>
    );
  }

  if (!days) {
    return <p>{t('availability.loading')}</p>;
  }

  const fullyBooked = days.every((d) => !d.available);
  const isDashboardVariant = variant === 'dashboard';

  return (
    <div>
      <div className="flex items-center gap-2">
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
            <button
              key={day.date}
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
            </button>
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
          <ErrorAlert>{t('availability.noSlots')}</ErrorAlert>
        </div>
      )}
    </div>
  );
}

function getDayBackgroundColor(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return 'var(--ba-primary, #2563eb)';
  }

  return isDashboardVariant ? '#ffffff' : 'var(--ba-secondary, rgb(239 246 255))';
}

function getDayBorderColor(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return 'var(--ba-primary, #2563eb)';
  }

  return isDashboardVariant ? 'rgb(191 219 254)' : 'var(--ba-secondary, rgb(191 219 254))';
}

function getDayTextColor(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return 'var(--ba-btn-text, #ffffff)';
  }

  return isDashboardVariant ? 'rgb(29 78 216)' : 'var(--ba-primary, #1d4ed8)';
}

function getDayBoxShadow(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return '0 1px 2px rgba(37, 99, 235, 0.18)';
  }

  return isDashboardVariant ? '0 1px 2px rgba(15, 23, 42, 0.04)' : 'none';
}
