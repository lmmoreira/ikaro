'use client';

import { PageHeader } from '@/shared/components/ui/page-header';
import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerBookingListItem, RecurringBookingScheduleListItem } from '@ikaro/types';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cn } from '@/shared/utils/cn';
import {
  RECURRING_SCHEDULE_STATUS_CLASSES,
  isTerminalRecurringSchedule,
  offersRenewal,
  recurringScheduleEndPath,
  recurringScheduleListPath,
  recurringScheduleRenewPath,
} from '../../recurring-schedule-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { DetailSection } from './DetailSection';
import { RecurringScheduleOccurrences } from './RecurringScheduleOccurrences';
import { RecurringSchedulePendingView } from './RecurringSchedulePendingView';
import { useRecurrenceText } from './use-recurrence-text';

export interface RecurringScheduleOccurrencePage {
  readonly items: readonly CustomerBookingListItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

interface RecurringScheduleDetailProps {
  readonly schedule: RecurringBookingScheduleListItem;
  readonly tenantSlug: string;
  /** The schedule's occurrence bookings for the requested page; `null` for a pending schedule. */
  readonly occurrences: RecurringScheduleOccurrencePage | null;
  /** Where the customer came from (a booking page), so "back" returns there instead of the list. */
  readonly returnTo?: string | null;
}

const STATUS_LABEL_KEY = {
  PENDING_APPROVAL: 'statusPending',
  ACTIVE: 'statusActive',
  ENDED: 'statusEnded',
  CANCELLED: 'statusCancelled',
} as const;

interface DetailRowProps {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
}

function DetailRow({ label, value, sub }: DetailRowProps): React.JSX.Element {
  return (
    <div className="border-b border-gray-100 py-3 last:border-b-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{value}</p>
      {sub !== undefined && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export function RecurringScheduleDetail({
  schedule,
  tenantSlug,
  occurrences,
  returnTo = null,
}: RecurringScheduleDetailProps): React.JSX.Element {
  if (schedule.status === 'PENDING_APPROVAL') {
    return <RecurringSchedulePendingView schedule={schedule} tenantSlug={tenantSlug} />;
  }
  return (
    <ScheduleDetailBody
      schedule={schedule}
      tenantSlug={tenantSlug}
      occurrences={occurrences}
      returnTo={returnTo}
    />
  );
}

function ScheduleDetailBody({
  schedule,
  tenantSlug,
  occurrences,
  returnTo = null,
}: RecurringScheduleDetailProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const { formatMoney } = useFormatting();
  const { recurrenceLine, formatDateKey } = useRecurrenceText();
  const topbarStatus = useCustomerTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const listHref = recurringScheduleListPath(tenantSlug);
  const terminal = isTerminalRecurringSchedule(schedule.status);

  const backHref = returnTo ?? listHref;
  const backLabel = returnTo === null ? t('backToList') : t('backToBooking');

  useEffect(() => {
    setBackHrefOverride?.(backHref);
    setBackLabelOverride?.(backLabel);
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [backHref, backLabel, setBackHrefOverride, setBackLabelOverride]);

  // The schedule item carries no price or booking count, so both come from the loaded bookings.
  const firstPrice = occurrences?.items[0]?.totalPrice.amount;
  const duration = formatDuration(schedule.recurrence.durationMinutes);
  // A running schedule counts what is still ahead; a finished one counts the whole period.
  const countKey = terminal ? 'reservationCount' : 'upcomingCount';
  const periodSub = occurrences === null ? undefined : t(countKey, { count: occurrences.total });
  const dayTimeSub =
    firstPrice === undefined
      ? t('durationOnly', { duration })
      : t('perReservation', { duration, price: formatMoney(firstPrice) });

  const endLink = (
    <Button asChild variant="destructive" className="w-full">
      <Link
        href={recurringScheduleEndPath(tenantSlug, schedule.id)}
        data-testid="end-schedule-link"
      >
        {t('endButton')}
      </Link>
    </Button>
  );
  const renewLink = offersRenewal(schedule) ? (
    <Button asChild className="w-full">
      <Link
        href={recurringScheduleRenewPath(tenantSlug, schedule.id)}
        data-testid="renew-schedule-button"
      >
        {t('renewAction')}
      </Link>
    </Button>
  ) : null;
  const backLink = (
    <Button asChild variant="outline" className="w-full">
      <Link href={backHref}>{t('backButton')}</Link>
    </Button>
  );
  const paneActions = (
    <>
      {terminal ? (
        <p className="text-sm leading-relaxed text-gray-500">
          {schedule.status === 'ENDED' ? (
            <>
              {t('endedAside')}
              <br />
              <strong className="text-gray-900">{formatDateKey(schedule.endsOn)}</strong>
            </>
          ) : (
            t('cancelledAside')
          )}
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-gray-500">
            {t('activeUntil')}
            <br />
            <strong className="text-gray-900">{formatDateKey(schedule.endsOn)}</strong>
          </p>
          {endLink}
        </>
      )}
      {renewLink}
      {backLink}
    </>
  );
  const paneMobileActions = (
    <div className="grid auto-cols-fr grid-flow-col gap-3">
      {backLink}
      {terminal ? null : endLink}
      {renewLink}
    </div>
  );

  return (
    <div className="w-full pb-40 lg:pb-0" data-testid="recurring-schedule-detail">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <Card className="rounded-xl border-gray-100 p-4 shadow-none">
            <PageHeader
              title={recurrenceLine(schedule.recurrence)}
              description={t('serviceSubtitle', { service: schedule.serviceName })}
              actions={
                <Badge
                  data-testid="recurring-schedule-status-badge"
                  className={cn(
                    'shrink-0 border-0 px-3 py-1.5',
                    RECURRING_SCHEDULE_STATUS_CLASSES[schedule.status],
                  )}
                >
                  {t(STATUS_LABEL_KEY[schedule.status])}
                </Badge>
              }
            />
          </Card>

          {schedule.status === 'ENDED' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm text-blue-900">
              {t('endedBanner', { date: formatDateKey(schedule.endsOn) })}
            </div>
          )}
          {schedule.status === 'CANCELLED' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm text-blue-900">
              {t('cancelledBanner')}
            </div>
          )}

          <DetailSection title={t('sectionRecurrence')}>
            <div>
              <DetailRow
                label={t('labelDayTime')}
                value={recurrenceLine(schedule.recurrence)}
                sub={dayTimeSub}
              />
              <DetailRow
                label={t('labelPeriod')}
                value={t('termRange', {
                  start: formatDateKey(schedule.startsOn),
                  end: formatDateKey(schedule.endsOn),
                })}
                sub={periodSub}
              />
            </div>
          </DetailSection>

          {occurrences !== null && (
            <RecurringScheduleOccurrences
              bookings={occurrences.items}
              mode={terminal ? 'history' : 'upcoming'}
              tenantSlug={tenantSlug}
              scheduleId={schedule.id}
              page={occurrences.page}
              total={occurrences.total}
              limit={occurrences.limit}
            />
          )}

          {!terminal && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm leading-relaxed text-blue-900">
              {t('activeHint')}
            </div>
          )}
        </div>

        <ActionPane actions={paneActions} mobileActions={paneMobileActions} />
      </div>
    </div>
  );
}
