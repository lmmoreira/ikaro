'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { BookingStatusBannerIcon } from './BookingStatusBannerIcon';

interface BookingDecisionBannerProps {
  // true when the booking has an open "Reservas a resolver" entry (M23-S46).
  readonly needsDecision: boolean;
  // A manager has the decision panel; STAFF is told to ask one (the worklist is manager-only).
  readonly canDecide: boolean;
}

// The orange "Esta reserva precisa de uma decisão" banner above the booking detail. It carries no
// link: a manager resolves from the decision panel on the same page.
export function BookingDecisionBanner({
  needsDecision,
  canDecide,
}: BookingDecisionBannerProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  if (!needsDecision) return null;

  return (
    <Card className="border-orange-200 bg-orange-50/80" data-testid="booking-decision-banner">
      <CardContent className="flex items-start gap-3 p-4">
        <BookingStatusBannerIcon variant="warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-orange-700">{t('needsDecisionTitle')}</p>
          <p className="mt-2 text-sm leading-6 text-orange-700/90">
            {canDecide ? t('needsDecisionBody') : t('needsDecisionStaffHint')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
