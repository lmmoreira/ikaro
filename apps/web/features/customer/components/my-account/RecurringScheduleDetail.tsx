'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerBookingListItem, RecurringBookingScheduleListItem } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cn } from '@/shared/utils/cn';
import {
  RECURRING_SCHEDULE_STATUS_CLASSES,
  isTerminalRecurringSchedule,
  recurringScheduleEndPath,
  recurringScheduleListPath,
} from '../../recurring-schedule-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
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
}

const STATUS_LABEL_KEY = {
  PENDING_APPROVAL: 'statusPending',
  ACTIVE: 'statusActive',
  ENDED: 'statusEnded',
  CANCELLED: 'statusCancelled',
} as const;

function DetailRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
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
}: RecurringScheduleDetailProps): React.JSX.Element {
  if (schedule.status === 'PENDING_APPROVAL') {
    return <RecurringSchedulePendingView schedule={schedule} tenantSlug={tenantSlug} />;
  }
  return (
    <ScheduleDetailBody schedule={schedule} tenantSlug={tenantSlug} occurrences={occurrences} />
  );
}

function ScheduleDetailBody({
  schedule,
  tenantSlug,
  occurrences,
}: RecurringScheduleDetailProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const { formatMoney } = useFormatting();
  const { recurrenceLine, formatDateKey } = useRecurrenceText();
  const topbarStatus = useCustomerTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const listHref = recurringScheduleListPath(tenantSlug);
  const terminal = isTerminalRecurringSchedule(schedule.status);

  useEffect(() => {
    setBackHrefOverride?.(listHref);
    setBackLabelOverride?.(t('backToList'));
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [listHref, setBackHrefOverride, setBackLabelOverride, t]);

  // The schedule item carries no price or booking count, so both come from the loaded bookings.
  const firstPrice = occurrences?.items[0]?.totalPrice.amount;
  const duration = formatDuration(schedule.recurrence.durationMinutes);
  const dayTimeSub =
    firstPrice === undefined
      ? t('durationOnly', { duration })
      : t('perReservation', { duration, price: formatMoney(firstPrice) });

  function renderActionPane(): React.JSX.Element {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
        {terminal ? (
          <p className="mb-1 text-sm leading-relaxed text-gray-500">
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
            <p className="mb-1 text-sm leading-relaxed text-gray-500">
              {t('activeUntil')}
              <br />
              <strong className="text-gray-900">{formatDateKey(schedule.endsOn)}</strong>
            </p>
            <Link
              href={recurringScheduleEndPath(tenantSlug, schedule.id)}
              data-testid="end-schedule-link"
              className="rounded-lg border-2 border-red-600 bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
            >
              {t('endButton')}
            </Link>
          </>
        )}
        <Link
          href={listHref}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {t('backButton')}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="recurring-schedule-detail">
      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900">
                {recurrenceLine(schedule.recurrence)}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                {t('serviceSubtitle', { service: schedule.serviceName })}
              </p>
            </div>
            <Badge
              data-testid="recurring-schedule-status-badge"
              className={cn(
                'shrink-0 border-0 px-3 py-1.5',
                RECURRING_SCHEDULE_STATUS_CLASSES[schedule.status],
              )}
            >
              {t(STATUS_LABEL_KEY[schedule.status])}
            </Badge>
          </div>

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

          <div>
            <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
              {t('sectionRecurrence')}
            </p>
            <div className="rounded-xl border border-gray-100 bg-white px-4">
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
                sub={
                  occurrences === null
                    ? undefined
                    : t(terminal ? 'reservationCount' : 'upcomingCount', {
                        count: occurrences.total,
                      })
                }
              />
            </div>
          </div>

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

          <div data-testid="action-pane-mobile" className="lg:hidden">
            {renderActionPane()}
          </div>
        </div>

        <div data-testid="action-pane-desktop" className="hidden lg:sticky lg:top-6 lg:block">
          {renderActionPane()}
        </div>
      </div>
    </div>
  );
}
