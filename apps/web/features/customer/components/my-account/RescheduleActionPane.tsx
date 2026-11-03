'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  useDescribeBookingWindow,
  type BookingWindowFacts,
} from '../../hooks/useDescribeBookingWindow';

interface RescheduleActionPaneProps {
  readonly from: BookingWindowFacts;
  readonly to: BookingWindowFacts | null;
  readonly eligibleUntil: Date;
  readonly isSubmitting: boolean;
  readonly backHref: string;
  readonly onConfirm: () => void;
  readonly feedback: FeedbackModel | null;
}

function ChangeSummary({
  from,
  to,
}: Readonly<{ from: BookingWindowFacts; to: BookingWindowFacts }>): React.JSX.Element {
  const t = useTranslations('customer.reschedule');
  const describe = useDescribeBookingWindow();

  return (
    <div
      data-testid="reschedule-change-summary"
      className="rounded-lg bg-blue-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800"
    >
      <p className="mb-1 font-bold">{t('summaryTitle')}</p>
      <p>{t('summaryFrom', { when: describe(from) })}</p>
      <p className="font-semibold">{t('summaryTo', { when: describe(to) })}</p>
    </div>
  );
}

function DeadlineNote({ eligibleUntil }: Readonly<{ eligibleUntil: Date }>): React.JSX.Element {
  const t = useTranslations('customer.reschedule');
  const { formatDateLong, formatTime } = useFormatting();

  return (
    <p className="text-center text-xs text-gray-500">
      {t('deadlineNote', {
        date: formatDateLong(eligibleUntil),
        time: formatTime(eligibleUntil),
      })}
    </p>
  );
}

/**
 * What the fixed mobile bar has no room for: the change summary and the deadline, shown in the
 * page itself below `lg`. On desktop the pane carries both.
 */
export function RescheduleMobileDetails({
  from,
  to,
  eligibleUntil,
}: Readonly<{
  from: BookingWindowFacts;
  to: BookingWindowFacts | null;
  eligibleUntil: Date;
}>): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-3 rounded-xl border-gray-100 p-4 shadow-none lg:hidden">
      {to !== null && <ChangeSummary from={from} to={to} />}
      <DeadlineNote eligibleUntil={eligibleUntil} />
    </Card>
  );
}

export function RescheduleActionPane({
  from,
  to,
  eligibleUntil,
  isSubmitting,
  backHref,
  onConfirm,
  feedback,
}: RescheduleActionPaneProps): React.JSX.Element {
  const t = useTranslations('customer.reschedule');

  const confirm = (
    <Button
      type="button"
      className="w-full"
      onClick={onConfirm}
      disabled={to === null || isSubmitting}
    >
      {isSubmitting ? t('confirming') : t('confirmButton')}
    </Button>
  );
  const back = (
    <Button asChild variant="outline" className="w-full">
      <Link href={backHref}>{t('backButton')}</Link>
    </Button>
  );

  return (
    <ActionPane
      actions={
        <>
          <p className="text-sm leading-relaxed text-gray-500">{t('sidebarNote')}</p>
          {to !== null && <ChangeSummary from={from} to={to} />}
          {confirm}
          {back}
          <DeadlineNote eligibleUntil={eligibleUntil} />
        </>
      }
      mobileActions={
        <div className="grid grid-cols-2 gap-3">
          {back}
          {confirm}
        </div>
      }
      feedback={feedback}
    />
  );
}
