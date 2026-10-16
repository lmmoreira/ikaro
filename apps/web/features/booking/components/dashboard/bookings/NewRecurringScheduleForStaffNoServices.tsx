'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { NoRecurrenceServicesReason } from '@/features/booking/model/recurring-service-eligibility';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';

interface NewRecurringScheduleForStaffNoServicesProps {
  readonly reason: NoRecurrenceServicesReason;
  readonly customerId: string;
  readonly customerName: string;
}

/**
 * The staff form's empty state (`09b #sem-servicos` / `#sem-elegivel`): no service can recur. Staff
 * are told which of the two it is and where to go; the reason itself lives in the service editor's
 * hint, so it is not repeated here.
 */
export function NewRecurringScheduleForStaffNoServices({
  reason,
  customerId,
  customerName,
}: NewRecurringScheduleForStaffNoServicesProps): React.JSX.Element {
  const t = useTranslations('dashboard.newRecurring');
  const enabledButUnavailable = reason === 'NONE_QUALIFY';

  return (
    <Card data-testid="new-schedule-no-services">
      <CardContent className="space-y-3 p-5">
        <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm font-semibold text-gray-700">
          {t(enabledButUnavailable ? 'noServices.unavailable' : 'noServices.none')}
        </p>
        <p className="text-sm text-gray-500">
          {t(enabledButUnavailable ? 'noServices.unavailableHint' : 'noServices.noneHint', {
            name: customerName,
          })}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link href="/dashboard/services">{t('noServices.services')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              href={`/dashboard/bookings/new/booking?customerId=${encodeURIComponent(customerId)}`}
            >
              {t('noServices.oneOff')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
