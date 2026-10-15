'use client';

import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useRecurrenceText } from '@/features/customer/components/my-account/use-recurrence-text';
import { NewRecurringScheduleConflictList } from '@/features/customer/components/my-account/NewRecurringScheduleConflictList';
import { maxOccurrenceCount } from '@/features/booking/model/recurring-approval';
import type { DecisionOutcome } from '@/features/booking/model/recurring-approval-outcome';
import { BookingStatusBannerIcon, type BannerVariant } from './BookingStatusBannerIcon';

interface RecurringApprovalBannerProps {
  readonly outcome: DecisionOutcome | null;
  readonly schedule: RecurringBookingScheduleListItem;
  // How the sentences refer to the customer ("Ana Costa", or "O cliente" when the read failed).
  readonly customerName: string;
  // Whether the request is still waiting for a decision (shows the deadline banner).
  readonly isPending: boolean;
}

const TONE_CLASSES: Record<BannerVariant, { card: string; title: string; body: string }> = {
  success: {
    card: 'border-green-200 bg-green-50/80',
    title: 'text-green-700',
    body: 'text-green-700/90',
  },
  danger: {
    card: 'border-red-200 bg-red-50/80',
    title: 'text-red-700',
    body: 'text-red-700/90',
  },
  info: {
    card: 'border-blue-200 bg-blue-50/80',
    title: 'text-blue-700',
    body: 'text-blue-700/90',
  },
};

function BannerCard({
  variant,
  title,
  body,
  testId,
  children,
}: {
  readonly variant: BannerVariant;
  readonly title: string;
  readonly body: string;
  readonly testId: string;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const tone = TONE_CLASSES[variant];
  return (
    <div className="space-y-3" data-testid={testId}>
      <Card className={tone.card}>
        <CardContent className="flex items-start gap-3 p-4">
          <BookingStatusBannerIcon variant={variant} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-bold uppercase tracking-[0.07em] ${tone.title}`}>{title}</p>
            <p className={`mt-2 text-sm leading-6 ${tone.body}`}>{body}</p>
          </div>
        </CardContent>
      </Card>
      {children}
    </div>
  );
}

// The banner on top of the approval screen (UC-071, prototypes 08 and 08b): the decision deadline
// while the request is pending, and what the last decision ended in. The data below it stays on
// screen either way, as on the booking detail.
export function RecurringApprovalBanner({
  outcome,
  schedule,
  customerName,
  isPending,
}: RecurringApprovalBannerProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.recurringApproval');
  const { formatTime } = useFormatting();
  const { formatDateKey } = useRecurrenceText();
  const holdTime = schedule.approvalHoldExpiresAt
    ? formatTime(new Date(schedule.approvalHoldExpiresAt))
    : null;
  const maxCount = maxOccurrenceCount(schedule);

  if (outcome === null) {
    if (!isPending || holdTime === null) return null;
    return (
      <div
        data-testid="recurring-hold-banner"
        className="rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-900"
      >
        <strong>{t('holdBannerTitle', { time: holdTime })}</strong> {t('holdBannerBody')}
      </div>
    );
  }

  switch (outcome.kind) {
    case 'approved':
      return outcome.created < maxCount ? (
        <BannerCard
          variant="success"
          testId="recurring-outcome-approved-partial"
          title={t('approvedPartialTitle', { created: outcome.created, max: maxCount })}
          body={t('approvedPartialBody', { created: outcome.created, name: customerName })}
        />
      ) : (
        <BannerCard
          variant="success"
          testId="recurring-outcome-approved"
          title={t('approvedTitle')}
          body={t('approvedBody', {
            count: outcome.created,
            start: formatDateKey(schedule.startsOn),
            end: formatDateKey(schedule.endsOn),
            name: customerName,
          })}
        />
      );
    case 'rejected':
      return (
        <BannerCard
          variant="danger"
          testId="recurring-outcome-rejected"
          title={t('rejectedTitle')}
          body={t('rejectedBody', { name: customerName })}
        />
      );
    case 'conflict':
      return (
        <BannerCard
          variant="danger"
          testId="recurring-outcome-conflict"
          title={t('conflictTitle')}
          body={t('conflictBody')}
        >
          {outcome.conflicts.length > 0 ? (
            <NewRecurringScheduleConflictList
              conflicts={outcome.conflicts}
              durationMinutes={schedule.recurrence.durationMinutes}
              title={t('conflictListTitle')}
            />
          ) : null}
        </BannerCard>
      );
    case 'phone':
      return (
        <BannerCard
          variant="danger"
          testId="recurring-outcome-phone"
          title={t('phoneTitle', { name: customerName })}
          body={t('phoneBody', { time: holdTime ?? '' })}
        />
      );
    case 'past':
      return (
        <BannerCard
          variant="danger"
          testId="recurring-outcome-past"
          title={t('pastTitle')}
          body={t('pastBody')}
        />
      );
    case 'ineligible':
      return (
        <BannerCard
          variant="danger"
          testId="recurring-outcome-ineligible"
          title={t('ineligibleTitle')}
          body={t('ineligibleBody', { time: holdTime ?? '' })}
        />
      );
    case 'notPending':
      return (
        <BannerCard
          variant="info"
          testId="recurring-outcome-not-pending"
          title={t('notPendingTitle')}
          body={t('notPendingBody')}
        />
      );
    case 'failure':
      return (
        <BannerCard
          variant="danger"
          testId="recurring-outcome-failure"
          title={t('failureTitle')}
          body={t('failureBody')}
        />
      );
  }
}
