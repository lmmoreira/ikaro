'use client';

import { PageHeader } from '@/shared/components/ui/page-header';
import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { recurringScheduleListPath } from '../../recurring-schedule-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { useRecurrenceText } from './use-recurrence-text';

// Only what the view shows, so the creation flow can render it from the pattern it just sent and
// the 201 body without a second read.
export type PendingScheduleFacts = Pick<
  RecurringBookingScheduleListItem,
  'serviceName' | 'recurrence' | 'startsOn' | 'endsOn' | 'approvalHoldExpiresAt'
>;

interface RecurringSchedulePendingViewProps {
  readonly schedule: PendingScheduleFacts;
  readonly tenantSlug: string;
}

/**
 * A `PENDING_APPROVAL` schedule: nothing is booked until staff approve, and the slot stays held
 * until `approvalHoldExpiresAt`. Also rendered by the creation flow right after the request (M23-S17).
 */
export function RecurringSchedulePendingView({
  schedule,
  tenantSlug,
}: RecurringSchedulePendingViewProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const { formatDate, formatTime } = useFormatting();
  const { recurrenceLine, formatDateKey } = useRecurrenceText();
  const topbarStatus = useCustomerTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const listHref = recurringScheduleListPath(tenantSlug);

  useEffect(() => {
    setBackHrefOverride?.(listHref);
    setBackLabelOverride?.(t('backToList'));
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [listHref, setBackHrefOverride, setBackLabelOverride, t]);

  const hold =
    schedule.approvalHoldExpiresAt === null ? null : new Date(schedule.approvalHoldExpiresAt);
  const until =
    hold === null ? '' : t('holdUntil', { date: formatDate(hold), time: formatTime(hold) });
  const start = formatDateKey(schedule.startsOn);
  const end = formatDateKey(schedule.endsOn);

  const viewMine = (
    <Button asChild className="w-full">
      <Link href={listHref}>{t('viewMine')}</Link>
    </Button>
  );
  const paneActions = (
    <>
      <p className="text-sm leading-relaxed text-gray-500">{t('pendingAside')}</p>
      {viewMine}
    </>
  );

  return (
    <div className="w-full pb-40 lg:pb-0" data-testid="recurring-schedule-pending">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <Card className="rounded-xl border-gray-100 p-4 shadow-none">
            <PageHeader eyebrow={schedule.serviceName} title={t('pendingTitle')} />
            <p className="mt-1 text-sm text-gray-500">
              {t('pendingLead', {
                recurrence: recurrenceLine(schedule.recurrence),
                start,
                end,
                service: schedule.serviceName,
              })}
            </p>
          </Card>

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-base font-bold text-gray-900">{t('pendingHoldTitle')}</p>
            {hold !== null && (
              <p className="mt-2 text-sm leading-relaxed text-gray-700">
                {t('pendingHoldBody', { service: schedule.serviceName, until })}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900">{t('pendingNextTitle')}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-gray-600">
              <li>{t('pendingNext1')}</li>
              <li>{t('pendingNext2', { start, end })}</li>
              <li>{t('pendingNext3', { until })}</li>
            </ol>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{t('pendingSingleTitle')}</p>
            <p className="mt-1.5">{t('pendingSingleBody', { service: schedule.serviceName })}</p>
          </div>
        </div>

        <ActionPane actions={paneActions} mobileActions={viewMine} />
      </div>
    </div>
  );
}
