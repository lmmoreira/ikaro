'use client';

import { useTranslations } from 'next-intl';
import type { CustomerProfileResponse, RecurringBookingScheduleListItem } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useRecurrenceDescription } from '@/features/booking/hooks/useRecurrenceDescription';
import {
  maxOccurrenceCount,
  type RecurringResourceRow,
} from '@/features/booking/model/recurring-approval';

interface RecurringScheduleRequestSummaryProps {
  readonly schedule: RecurringBookingScheduleListItem;
  // Undefined while the customer is loading or when the read failed (the card then says so).
  readonly customer: CustomerProfileResponse | undefined;
  readonly customerFailed: boolean;
  // One row per resource requirement, already resolved by the caller from the service's shape.
  readonly resourceRows: readonly RecurringResourceRow[];
  readonly resourceNames: ReadonlyMap<string, string>;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function SummaryRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2.5 text-sm last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}

// The "Cliente" and "Recorrência pedida" cards of the approval screen (UC-071, prototype 08): who
// asked and what exactly. Every value comes from the schedule read, except the customer (the
// schedule carries only its id) and the resource names (it stores only ids).
export function RecurringScheduleRequestSummary({
  schedule,
  customer,
  customerFailed,
  resourceRows,
  resourceNames,
}: RecurringScheduleRequestSummaryProps): React.JSX.Element {
  const t = useTranslations('dashboard.recurringApproval');
  const { formatDate, formatTime } = useFormatting();
  const { patternLine, formatDateKey } = useRecurrenceDescription();
  const createdAt = schedule.createdAt ? new Date(schedule.createdAt) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('customerSection')}
        </p>
        <Card>
          <CardContent className="flex items-center gap-3 p-4" data-testid="recurring-customer">
            <div
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white"
            >
              {customer ? getInitials(customer.name) : ''}
            </div>
            <div className="min-w-0 flex-1">
              {customer ? (
                <>
                  <p className="truncate text-sm font-semibold text-gray-900">{customer.name}</p>
                  <p className="truncate text-sm text-gray-500">
                    {t('customerAuthenticated', { email: customer.email })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  {customerFailed ? t('customerUnavailable') : t('customerLoading')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('requestSection')}
        </p>
        <Card>
          <CardContent className="px-4 py-1" data-testid="recurring-request-rows">
            <SummaryRow label={t('rowService')} value={schedule.serviceName} />
            {resourceRows.map((row, index) => (
              <SummaryRow
                // A bundle can list two requirements of one type, so the position is part of the key.
                key={`${row.type}-${index}`}
                label={t(`resourceType${row.type}`)}
                value={
                  row.kind === 'picked'
                    ? (resourceNames.get(row.resourceId) ?? t('resourceNameUnknown'))
                    : t('resolvedPerOccurrence')
                }
              />
            ))}
            <SummaryRow label={t('rowPattern')} value={patternLine(schedule.recurrence)} />
            <SummaryRow
              label={t('rowPeriod')}
              value={t('periodRange', {
                start: formatDateKey(schedule.startsOn),
                end: formatDateKey(schedule.endsOn),
              })}
            />
            <SummaryRow
              label={t('rowReservations')}
              value={t('reservationsUpTo', { count: maxOccurrenceCount(schedule) })}
            />
            {createdAt ? (
              <SummaryRow
                label={t('rowRequestedAt')}
                value={t('requestedAtValue', {
                  date: formatDate(createdAt),
                  time: formatTime(createdAt),
                })}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
