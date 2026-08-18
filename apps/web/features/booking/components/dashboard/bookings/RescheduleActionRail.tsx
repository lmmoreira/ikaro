'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { AvailableSlot } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingOutcomeActionRail } from './BookingOutcomeActionRail';

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
// the from/to summary card) is a self-contained section, unrelated to the form fields beside it.
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
    <BookingOutcomeActionRail
      desktopTop={
        error ? (
          <Card className="border-red-200 bg-red-50/80">
            <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null
      }
    >
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('actionsSection')}
        </p>
        <Card>
          <CardContent className="space-y-3 p-4">
            <Button type="submit" disabled={pendingSubmit} className="w-full">
              {t('submitReschedule')}
            </Button>
            <Button
              asChild
              className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
            >
              <Link href={backHref}>{commonT('cancel')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/70">
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
            {t('summaryLabel')}
          </p>
          <div className="space-y-3 text-sm text-blue-700/90">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
                {t('rescheduledFromLabel')}
              </p>
              <p className="mt-1 font-medium">
                {formatRangeLine(currentStart, currentEnd, formatDateLong, formatTime)}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
                {t('rescheduledToLabel')}
              </p>
              <p className="mt-1 font-medium">
                {selectedSlot
                  ? formatRangeLine(
                      new Date(selectedSlot.startsAt),
                      new Date(selectedSlot.endsAt),
                      formatDateLong,
                      formatTime,
                    )
                  : t('summaryPending')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </BookingOutcomeActionRail>
  );
}
