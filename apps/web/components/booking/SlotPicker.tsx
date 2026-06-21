'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AvailableSlot } from '@ikaro/types';
import { fetchAvailability } from '@/lib/api/schedule';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { ErrorAlert } from './ErrorAlert';

interface SlotPickerProps {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly date: string;
  readonly selectedSlot: AvailableSlot | null;
  readonly onSelectSlot: (slot: AvailableSlot) => void;
}

export function SlotPicker({
  slug,
  serviceIds,
  date,
  selectedSlot,
  onSelectSlot,
}: SlotPickerProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { formatTime } = useFormatting();
  const [result, setResult] = useState<{ date: string; slots: AvailableSlot[] } | null>(null);
  const [errorDate, setErrorDate] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchAvailability(slug, date, serviceIds)
      .then((response) => {
        if (!cancelled) setResult({ date, slots: response.slots });
      })
      .catch(() => {
        if (!cancelled) setErrorDate(date);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, date, serviceIds, retryCount]);

  const handleRetry = useCallback(() => {
    setErrorDate(null);
    setResult(null);
    setRetryCount((c) => c + 1);
  }, []);

  if (errorDate === date) {
    return (
      <ErrorAlert onRetry={handleRetry} retryLabel={t('errors.tryAgain')}>
        {t('slotPicker.loadError')}
      </ErrorAlert>
    );
  }

  if (result?.date !== date) {
    return <p>{t('slotPicker.loading')}</p>;
  }

  const { slots } = result;

  if (slots.length === 0) {
    return (
      <output
        className="flex items-start gap-2.5 border border-amber-300 bg-amber-50 p-3"
        style={{ borderRadius: 'var(--ba-radius)' }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0 text-amber-600"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="text-sm font-medium text-amber-700">{t('slotPicker.noSlots')}</span>
      </output>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((slot) => {
        const isSelected = selectedSlot?.startsAt === slot.startsAt;
        return (
          <button
            key={slot.startsAt}
            type="button"
            onClick={() => onSelectSlot(slot)}
            aria-pressed={isSelected}
            data-testid="time-slot"
            className="w-full border py-2 text-center text-sm font-medium transition-colors"
            style={{
              borderRadius: 'var(--ba-radius)',
              backgroundColor: isSelected ? 'var(--ba-primary)' : undefined,
              borderColor: isSelected ? 'var(--ba-primary)' : 'var(--ba-secondary)',
              color: isSelected ? 'var(--ba-btn-text)' : 'var(--ba-text)',
            }}
          >
            {formatTime(new Date(slot.startsAt))}–{formatTime(new Date(slot.endsAt))}
          </button>
        );
      })}
    </div>
  );
}
