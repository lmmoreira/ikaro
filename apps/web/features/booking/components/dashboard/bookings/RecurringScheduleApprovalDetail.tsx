'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { ApiError } from '@/shared/lib/api/errors';
import { useStaffCustomer } from '@/features/customer/hooks/useStaffCustomer';
import { RECURRING_SCHEDULE_STATUS_CLASSES } from '@/features/booking/model/recurring-schedule-display';
import { useRecurrenceDescription } from '@/features/booking/hooks/useRecurrenceDescription';
import {
  useAllResourceNames,
  useApproveRecurringSchedule,
  useInvalidateAfterDecision,
  useRecurringScheduleForStaff,
  useRecurringScheduleService,
  useRejectRecurringSchedule,
} from '@/features/booking/hooks/useRecurringSchedules';
import {
  buildResourceRows,
  isApprovalHoldExpired,
  maxOccurrenceCount,
  type RecurringResourceRow,
} from '@/features/booking/model/recurring-approval';
import {
  canRetryApproval,
  classifyDecisionError,
  isSettledOutcome,
  type DecisionAction,
  type DecisionOutcome,
} from '@/features/booking/model/recurring-approval-outcome';
import { RecurringApprovalActions } from './RecurringApprovalActions';
import { RecurringApprovalBanner } from './RecurringApprovalBanner';
import { RecurringDecisionSheet } from './RecurringDecisionSheet';
import { RecurringScheduleRequestSummary } from './RecurringScheduleRequestSummary';

const AGENDA_HREF = '/dashboard/bookings';

// The approve button reads "Tentar aprovar de novo" only after an approval was refused; a failed
// rejection leaves it as the plain "Aprovar recorrência".
function isApprovalRetry(outcome: DecisionOutcome | null): boolean {
  if (outcome === null) return false;
  if (outcome.kind === 'failure') return outcome.action === 'approve';
  return outcome.kind === 'conflict' || outcome.kind === 'phone';
}

interface RecurringScheduleApprovalDetailProps {
  readonly scheduleId: string;
}

// The staff screen for one recurring-schedule request (UC-071, M23-S13, prototypes 08 and 08b): who
// asked, what exactly, and the one decision — approve creates every reservation of the term, reject
// creates none. The same route also shows a request that is no longer pending, read-only, because a
// booking's "Origem" card links here.
export function RecurringScheduleApprovalDetail({
  scheduleId,
}: RecurringScheduleApprovalDetailProps): React.JSX.Element {
  const t = useTranslations('dashboard.recurringApproval');
  const { patternLine, formatDateKey } = useRecurrenceDescription();
  const scheduleQuery = useRecurringScheduleForStaff(scheduleId);
  const schedule = scheduleQuery.data;
  const customerQuery = useStaffCustomer(schedule?.customerId);
  const serviceQuery = useRecurringScheduleService(schedule?.serviceId);
  const resourceNames = useAllResourceNames();
  const approve = useApproveRecurringSchedule();
  const reject = useRejectRecurringSchedule();
  const refreshAfterDecision = useInvalidateAfterDecision();
  const [outcome, setOutcome] = useState<DecisionOutcome | null>(null);
  const [sheet, setSheet] = useState<DecisionAction | null>(null);
  const isSubmitting = approve.isPending || reject.isPending;

  // One row per requirement of the service; if the service could not be read, the picks the schedule
  // stores are still shown, just without the automatic requirements.
  const resourceRows = useMemo<RecurringResourceRow[]>(() => {
    if (!schedule) return [];
    const assignments = schedule.resourceAssignments ?? [];
    return serviceQuery.data
      ? buildResourceRows(serviceQuery.data.resourceRequirements, assignments)
      : assignments.map((a) => ({
          kind: 'picked' as const,
          type: a.resourceType,
          resourceId: a.resourceId,
        }));
  }, [schedule, serviceQuery.data]);

  if (scheduleQuery.isLoading) {
    return (
      <p className="p-4 text-sm text-gray-500" data-testid="recurring-approval-loading">
        {t('loading')}
      </p>
    );
  }

  if (scheduleQuery.isError || !schedule) {
    const notFound = scheduleQuery.error instanceof ApiError && scheduleQuery.error.status === 404;
    return (
      <div className="space-y-3 p-4" data-testid="recurring-approval-error">
        <p className="text-sm text-red-700">{notFound ? t('notFound') : t('loadError')}</p>
        <div className="flex gap-2">
          {notFound ? null : (
            <Button type="button" variant="outline" onClick={() => void scheduleQuery.refetch()}>
              {t('retry')}
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href={AGENDA_HREF}>{t('backToAgenda')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const customer = customerQuery.data;
  const customerName = customer?.name ?? t('customerFallbackName');
  const isPending = schedule.status === 'PENDING_APPROVAL';
  const holdExpired = isApprovalHoldExpired(schedule);
  // A "not pending" refusal on a request that the re-read shows is STILL pending with a passed hold
  // is not someone else's decision: the expiry job simply has not cancelled it yet. It stays on
  // screen as an expired request that can be rejected, instead of a dead end.
  const shownOutcome = holdExpired && outcome?.kind === 'notPending' ? null : outcome;
  const settled = isSettledOutcome(shownOutcome);
  // Decidable only while the schedule is still pending and no decision settled it in this session.
  const canDecide = isPending && !settled;
  const maxCount = maxOccurrenceCount(schedule);

  async function decide(action: DecisionAction): Promise<void> {
    try {
      if (action === 'approve') {
        const result = await approve.mutateAsync(scheduleId);
        setOutcome({ kind: 'approved', created: result.occurrenceCount });
      } else {
        await reject.mutateAsync(scheduleId);
        setOutcome({ kind: 'rejected' });
      }
    } catch (error) {
      const next = classifyDecisionError(error, action);
      setOutcome(next);
      // Someone else decided (or the hold ran out): refresh so the queue and this page agree.
      if (next.kind === 'notPending') void refreshAfterDecision();
    } finally {
      setSheet(null);
    }
  }

  const sheetSummary =
    sheet === 'approve'
      ? t('approveSheetBody', {
          name: customerName,
          period: t('periodRange', {
            start: formatDateKey(schedule.startsOn),
            end: formatDateKey(schedule.endsOn),
          }),
          pattern: patternLine(schedule.recurrence),
          count: maxCount,
        })
      : t('rejectSheetBody', { name: customerName });

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0" data-testid="recurring-approval-page">
      <div className="flex justify-end">
        <Badge
          data-testid="recurring-status-badge"
          className={`shrink-0 rounded-full border-0 px-4 py-2 text-sm font-semibold ${RECURRING_SCHEDULE_STATUS_CLASSES[schedule.status]}`}
        >
          {isPending ? t('statusPending') : t(`status${schedule.status}`)}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <RecurringApprovalBanner
            outcome={shownOutcome}
            schedule={schedule}
            customerName={customerName}
            isPending={isPending}
            holdExpired={holdExpired}
          />

          <RecurringScheduleRequestSummary
            schedule={schedule}
            customer={customer}
            customerFailed={customerQuery.isError}
            resourceRows={resourceRows}
            resourceNames={resourceNames.data ?? new Map()}
          />

          {canDecide ? (
            <div className="space-y-2" data-testid="recurring-what-happens">
              <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
                {t('whatHappens')}
              </p>
              <Card>
                <CardContent className="space-y-3 p-4 text-sm leading-6 text-gray-600">
                  <p>{t('noneCreatedYet')}</p>
                  <p>{t('decisionCoversAll')}</p>
                  {holdExpired ? null : (
                    <p>
                      <strong className="text-gray-900">{t('approveLabel')}</strong>{' '}
                      {t('approveExplain', { count: maxCount })}
                    </p>
                  )}
                  <p>
                    <strong className="text-gray-900">{t('rejectLabel')}</strong>{' '}
                    {t('rejectExplain', { name: customerName })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('emailNotice', { name: customerName })}
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>

        <aside className="lg:block">
          <div className="space-y-4 lg:sticky lg:top-6">
            <RecurringApprovalActions
              backHref={AGENDA_HREF}
              canDecide={canDecide}
              canApprove={canRetryApproval(shownOutcome) && !holdExpired}
              isRetry={isApprovalRetry(shownOutcome)}
              isSubmitting={isSubmitting}
              settledNote={isPending || settled ? t('noMoreActions') : t('readOnlyNote')}
              onApprove={() => setSheet('approve')}
              onReject={() => setSheet('reject')}
            />
          </div>
        </aside>
      </div>

      <RecurringDecisionSheet
        kind={sheet ?? 'approve'}
        open={sheet !== null}
        summary={sheetSummary}
        isSubmitting={isSubmitting}
        onClose={() => setSheet(null)}
        onConfirm={() => decide(sheet ?? 'approve')}
      />
    </div>
  );
}
