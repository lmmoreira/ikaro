'use client';

import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { useRecurrenceText } from './use-recurrence-text';

interface NewRecurringScheduleRenewalNoticeProps {
  /** The schedule being renewed; null when the renewal link could not be honored. */
  readonly renewing: RecurringBookingScheduleListItem | null;
}

/** `13f`: the banner over a pre-filled renewal (state A), or the notice over the blank form (state B). */
export function NewRecurringScheduleRenewalNotice({
  renewing,
}: NewRecurringScheduleRenewalNoticeProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');
  const { recurrenceLine, formatDateKey } = useRecurrenceText();

  if (renewing === null) {
    return (
      <div
        role="status"
        data-testid="new-schedule-renewal-not-found"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <strong>{tn('renewNotFound')}</strong> {tn('renewNotFoundHint')}
      </div>
    );
  }

  return (
    <div
      data-testid="new-schedule-renewal-banner"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <strong>{tn('renewBannerTitle', { service: renewing.serviceName })}</strong>
      <p className="mt-1">
        {tn('renewBannerBody', {
          recurrence: recurrenceLine(renewing.recurrence),
          start: formatDateKey(renewing.startsOn),
          end: formatDateKey(renewing.endsOn),
        })}
      </p>
    </div>
  );
}
