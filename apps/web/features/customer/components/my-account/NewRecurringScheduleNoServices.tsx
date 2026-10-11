'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { NoRecurrenceServicesReason } from '@/features/booking/model/recurring-service-eligibility';

interface NewRecurringScheduleNoServicesProps {
  readonly tenantSlug: string;
  readonly reason: NoRecurrenceServicesReason;
  /** Shown under the heading: the renewal's not-found notice. */
  readonly header?: React.ReactNode;
}

/**
 * The creation form's empty state (TD49-S03, prototype `13g`): no service is offered. The customer
 * is never told a technical reason, only whether recurrence is off everywhere or merely unavailable
 * for the services that have it on; the reasons live in the manager's service editor.
 */
export function NewRecurringScheduleNoServices({
  tenantSlug,
  reason,
  header,
}: NewRecurringScheduleNoServicesProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');
  const enabledButUnavailable = reason === 'NONE_QUALIFY';

  return (
    <div className="w-full" data-testid="new-schedule-no-services">
      <h1 className="text-lg font-bold text-gray-900">{tn('title')}</h1>
      {header}
      <p className="mt-3 text-sm font-semibold text-gray-700">
        {tn(enabledButUnavailable ? 'noServicesEnabled' : 'noServices')}
      </p>
      <p className="mt-1 text-sm text-gray-500">
        {tn(enabledButUnavailable ? 'noServicesEnabledHint' : 'noServicesHint')}
      </p>
      <Link
        href={`/${tenantSlug}/booking`}
        className="mt-4 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
      >
        {tn('noServicesCta')}
      </Link>
    </div>
  );
}
