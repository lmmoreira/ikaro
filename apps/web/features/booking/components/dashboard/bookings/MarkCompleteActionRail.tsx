'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { BookingOutcomeActionRail } from './BookingOutcomeActionRail';

interface MarkCompleteActionRailProps {
  readonly error: string | null;
  readonly isSubmitting: boolean;
  readonly backHref: string;
}

// Extracted from MarkCompleteBookingPage (TD37-S5A) — the submit/cancel action rail is a
// self-contained section, unrelated to the form fields beside it.
export function MarkCompleteActionRail({
  error,
  isSubmitting,
  backHref,
}: MarkCompleteActionRailProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const commonT = useTranslations('common');

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
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {t('submitComplete')}
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
    </BookingOutcomeActionRail>
  );
}
