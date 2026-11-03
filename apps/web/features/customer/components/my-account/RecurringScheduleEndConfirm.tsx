'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { endRecurringScheduleAsCustomer } from '@/features/booking/api/recurring-booking-schedules';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import {
  recurringScheduleDetailPath,
  recurringScheduleListPath,
} from '../../recurring-schedule-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { ConfirmPage } from './ConfirmPage';
import { useRecurrenceText } from './use-recurrence-text';

interface RecurringScheduleEndConfirmProps {
  readonly schedule: RecurringBookingScheduleListItem;
  readonly tenantSlug: string;
}

/** The dedicated confirmation page for ending a recurrence early (never an inline panel). */
export function RecurringScheduleEndConfirm({
  schedule,
  tenantSlug,
}: RecurringScheduleEndConfirmProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const locale = useResolvedLocale();
  const router = useRouter();
  const { recurrenceLine, termText } = useRecurrenceText();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const feedback = useFormFeedback();
  const topbarStatus = useCustomerTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const detailHref = recurringScheduleDetailPath(tenantSlug, schedule.id);

  useEffect(() => {
    setBackHrefOverride?.(detailHref);
    setBackLabelOverride?.(t('backToSchedule'));
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [detailHref, setBackHrefOverride, setBackLabelOverride, t]);

  async function handleConfirm(): Promise<void> {
    setIsSubmitting(true);
    feedback.clear();
    try {
      await endRecurringScheduleAsCustomer(schedule.id);
      router.push(recurringScheduleListPath(tenantSlug));
      router.refresh();
    } catch (err) {
      feedback.setFromApiError(err, locale);
      setIsSubmitting(false);
    }
  }

  return (
    <ConfirmPage
      title={t('endTitle')}
      subtitle={t('endSubtitle')}
      sectionLabel={t('endSectionLabel')}
      summary={
        <>
          <p className="text-sm font-semibold text-gray-900">{schedule.serviceName}</p>
          <p className="mt-1 text-sm text-gray-500">{recurrenceLine(schedule.recurrence)}</p>
          <p className="mt-1 text-sm text-gray-500">{termText(schedule)}</p>
        </>
      }
      notice={t('endInfo')}
      noticeTone="info"
      asideNote={t('endAside')}
      confirmLabel={isSubmitting ? t('endConfirming') : t('endConfirm')}
      confirmTestId="end-schedule-confirm"
      keepLabel={t('endKeep')}
      isSubmitting={isSubmitting}
      onConfirm={() => void handleConfirm()}
      onKeep={() => router.push(detailHref)}
      feedback={feedback.feedback}
      feedbackTestId="end-schedule-error"
    />
  );
}
