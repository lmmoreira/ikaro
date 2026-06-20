'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ErrorAlert } from './ErrorAlert';
import type { DaySummary } from '@ikaro/types';
import { fetchAvailabilitySummary } from '@/lib/api/schedule';
import { addDays, toISODate } from '@/lib/formatting/date-utils';

interface AvailabilityCarouselProps {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly carouselDays: number;
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SCROLL_AMOUNT_PX = 240;

function dayLabel(date: string, index: number): string {
  if (index === 0) return 'Hoje';
  return WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
}

function dayNumber(date: string): string {
  return String(new Date(`${date}T00:00:00`).getDate());
}

export function AvailabilityCarousel({
  slug,
  serviceIds,
  selectedDate,
  onSelectDate,
  carouselDays,
}: AvailabilityCarouselProps) {
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
      <ErrorAlert onRetry={handleRetry}>Não foi possível carregar a disponibilidade.</ErrorAlert>
    );
  }

  if (!days) {
    return <p>Carregando disponibilidade...</p>;
  }

  const fullyBooked = days.every((d) => !d.available);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Dias anteriores"
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
              className="flex shrink-0 flex-col items-center border px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderRadius: 'var(--ba-radius)',
                backgroundColor: day.date === selectedDate ? 'var(--ba-primary)' : undefined,
                color: day.date === selectedDate ? 'var(--ba-btn-text)' : 'var(--ba-text)',
              }}
            >
              <span className="text-xs">{dayLabel(day.date, index)}</span>
              <span className="text-lg font-semibold">{dayNumber(day.date)}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label="Próximos dias"
          onClick={() => scrollBy(SCROLL_AMOUNT_PX)}
          className="hidden shrink-0 sm:block"
        >
          <ChevronRight />
        </button>
      </div>

      {fullyBooked && (
        <div className="mt-3" data-testid="fully-booked-message">
          <ErrorAlert>
            Nenhum horário disponível nos próximos {carouselDays} dias. Entre em contato conosco
            para agendar.
          </ErrorAlert>
        </div>
      )}
    </div>
  );
}
