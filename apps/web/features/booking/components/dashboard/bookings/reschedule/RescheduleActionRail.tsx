'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { AvailableSlot } from '@ikaro/types';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { SectionLabel } from '@/shared/components/ui/section-label';

function formatRangeLine(
  start: Date,
  end: Date,
  formatDateLong: (date: Date) => string,
  formatTime: (date: Date) => string,
): string {
  return `${formatDateLong(start)} · ${formatTime(start)}–${formatTime(end)}`;
}

interface RescheduleActionRailProps {
  readonly error: string | null;
  readonly pendingSubmit: boolean;
  readonly backHref: string;
  readonly currentStart: Date;
  readonly currentEnd: Date;
  readonly selectedSlot: AvailableSlot | null;
}

// Extracted from RescheduleBookingPage (TD37-S5A) — the action rail (submit/cancel actions plus
// the from/to summary) is a self-contained section, unrelated to the form fields beside it. A failed
// submit reports under the buttons in the shared action pane (TD57-S12); the chosen slot stays
// selected and the submit stays enabled (the page owns that state, the rail never clears it).
export function RescheduleActionRail({
  error,
  pendingSubmit,
  backHref,
  currentStart,
  currentEnd,
  selectedSlot,
}: RescheduleActionRailProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const commonT = useTranslations('common');
  const { formatDateLong, formatTime } = useFormatting();

  return (
    <ActionPane
      feedback={error ? { variant: 'error', title: error, testId: 'reschedule-error' } : null}
      actions={
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">{t('actionsSection')}</p>
          <Button type="submit" disabled={pendingSubmit} className="w-full">
            {t('submitReschedule')}
          </Button>
          <Button asChild variant="surface" className="w-full">
            <Link href={backHref}>{commonT('cancel')}</Link>
          </Button>

          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-sm text-blue-700/90">
            <SectionLabel tone="info">{t('summaryLabel')}</SectionLabel>
            <div>
              <SectionLabel tone="info">{t('rescheduledFromLabel')}</SectionLabel>
              <p className="mt-1 font-medium">
                {formatRangeLine(currentStart, currentEnd, formatDateLong, formatTime)}
              </p>
            </div>
            <div>
              <SectionLabel tone="info">{t('rescheduledToLabel')}</SectionLabel>
              <p className="mt-1 font-medium">
                {selectedSlot
                  ? formatRangeLine(
                      new Date(selectedSlot.startsAt),
                      new Date(selectedSlot.appointmentEndsAt),
                      formatDateLong,
                      formatTime,
                    )
                  : t('summaryPending')}
              </p>
            </div>
          </div>
        </div>
      }
    />
  );
}
