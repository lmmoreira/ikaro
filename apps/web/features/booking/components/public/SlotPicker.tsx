'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AvailableSlot, ResourceSelectionItem } from '@ikaro/types';
import { isSlotBookable } from '@/features/booking/model/booking-window';
import { fetchAvailability } from '@/features/platform/hotsite/api/schedule';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cn } from '@/shared/utils/cn';
import { ErrorAlert } from './ErrorAlert';

interface SlotPickerProps {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly date: string;
  readonly selectedSlot: AvailableSlot | null;
  readonly onSelectSlot: (slot: AvailableSlot) => void;
  readonly resourceSelections?: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
  readonly minBookingAdvanceHours?: number;
  readonly variant?: 'hotsite' | 'dashboard';
}

export function SlotPicker({
  slug,
  serviceIds,
  date,
  selectedSlot,
  onSelectSlot,
  resourceSelections,
  durationMinutes,
  minBookingAdvanceHours = 0,
  variant = 'hotsite',
}: SlotPickerProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { formatTime } = useFormatting();
  const [result, setResult] = useState<{ date: string; slots: AvailableSlot[] } | null>(null);
  const [errorDate, setErrorDate] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchAvailability(slug, date, serviceIds, { resourceSelections, durationMinutes })
      .then((response) => {
        // A slot inside the minimum notice is not bookable — the backend would reject it — so it
        // is never offered.
        const now = new Date();
        const slots = response.slots.filter((slot) =>
          isSlotBookable(slot.startsAt, now, minBookingAdvanceHours),
        );
        if (!cancelled) setResult({ date, slots });
      })
      .catch(() => {
        if (!cancelled) setErrorDate(date);
      });

    return () => {
      cancelled = true;
    };
  }, [
    slug,
    date,
    serviceIds,
    resourceSelections,
    durationMinutes,
    minBookingAdvanceHours,
    retryCount,
  ]);

  const handleRetry = useCallback(() => {
    setErrorDate(null);
    setResult(null);
    setRetryCount((c) => c + 1);
  }, []);

  if (errorDate === date) {
    return (
      <ErrorAlert onRetry={handleRetry} retryLabel={t('errors.tryAgain')} variant={variant}>
        {t('slotPicker.loadError')}
      </ErrorAlert>
    );
  }

  if (result?.date !== date) {
    return <p>{t('slotPicker.loading')}</p>;
  }

  const { slots } = result;
  const isDashboardVariant = variant === 'dashboard';

  if (slots.length === 0) {
    return (
      <output
        className="flex items-start gap-2.5 border border-amber-300 bg-amber-50 p-3"
        style={{ borderRadius: isDashboardVariant ? '0.75rem' : 'var(--ba-radius)' }}
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
            className={cn(
              'w-full border py-2 text-center text-sm font-medium transition-colors',
              getSlotButtonClassName(isSelected, isDashboardVariant),
            )}
            style={{
              borderRadius: isDashboardVariant ? '0.75rem' : 'var(--ba-radius)',
            }}
          >
            {formatTime(new Date(slot.startsAt))}–{formatTime(new Date(slot.endsAt))}
          </button>
        );
      })}
    </div>
  );
}

function getSlotButtonClassName(isSelected: boolean, isDashboardVariant: boolean): string {
  if (isSelected) {
    return 'border-blue-600 bg-blue-600 text-white shadow-[0_1px_2px_rgba(37,99,235,0.18)]';
  }

  if (isDashboardVariant) {
    return 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50';
  }

  return 'border-[var(--ba-secondary,rgb(191,219,254))] bg-[var(--ba-secondary,rgb(239,246,255))] text-[var(--ba-primary,#1d4ed8)] hover:bg-blue-50';
}
