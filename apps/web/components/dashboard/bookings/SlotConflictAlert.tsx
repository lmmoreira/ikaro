'use client';

import type { SlotConflictSuggestion } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDuration } from '@/lib/formatting/format-duration';
import { useFormatting } from '@/lib/formatting/use-formatting';

interface SlotConflictAlertProps {
  readonly requestedAt: string;
  readonly totalDurationMins: number;
  readonly suggestions: readonly SlotConflictSuggestion[];
  readonly isLoading?: boolean;
  readonly onChooseSlot: (startsAt: string) => void;
  readonly onBack: () => void;
  readonly chooseSlotLabel?: string;
  readonly backLabel?: string;
}

export function SlotConflictAlert({
  requestedAt,
  totalDurationMins,
  suggestions,
  isLoading = false,
  onChooseSlot,
  onBack,
  chooseSlotLabel,
  backLabel,
}: SlotConflictAlertProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatTime, formatDateLong } = useFormatting();
  const requested = new Date(requestedAt);
  const retryLabel = chooseSlotLabel ?? t('approveHere');
  const returnLabel = backLabel ?? t('backWithoutApprove');

  return (
    <Card className="border-red-200 bg-red-50/70">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold text-red-700">{t('slotConflictTitle')}</p>
            <p className="mt-1 text-sm leading-6 text-red-700/90">
              {t('slotConflictBody', { time: formatTime(requested) })}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-red-700/60">
            {t('nearbySlots', { duration: formatDuration(totalDurationMins) })}
          </p>

          {isLoading ? (
            <p className="text-sm text-red-700/80">{t('loadingAlternatives')}</p>
          ) : suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((slot) => {
                const start = new Date(slot.startsAt);
                const end = new Date(slot.endsAt);
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => onChooseSlot(slot.startsAt)}
                    className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-gray-900 shadow-sm ring-1 ring-red-100 transition-colors hover:bg-red-50"
                  >
                    <div>
                      <p className="font-semibold">
                        {formatTime(start)} — {formatTime(end)}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-500">{formatDateLong(start)}</p>
                    </div>
                    <span className="text-sm font-semibold text-red-700">{retryLabel}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-red-700/80">{t('noAlternatives')}</p>
          )}
        </div>

        <Button type="button" variant="ghost" className="px-0" onClick={onBack}>
          {returnLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
