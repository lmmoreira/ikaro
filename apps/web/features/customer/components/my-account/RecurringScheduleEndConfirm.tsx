'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { endRecurringScheduleAsCustomer } from '@/features/booking/api/recurring-booking-schedules';
import { extractProblemCode, resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import {
  recurringScheduleDetailPath,
  recurringScheduleListPath,
} from '../../recurring-schedule-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    setErrorMessage(null);
    try {
      await endRecurringScheduleAsCustomer(schedule.id);
      router.push(recurringScheduleListPath(tenantSlug));
      router.refresh();
    } catch (err) {
      setErrorMessage(resolveErrorMessage(extractProblemCode(err), locale));
      setIsSubmitting(false);
    }
  }

  function renderActionPane(): React.JSX.Element {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
        <p className="mb-1 text-sm leading-relaxed text-gray-500">{t('endAside')}</p>
        <button
          type="button"
          data-testid="end-schedule-confirm"
          onClick={() => void handleConfirm()}
          disabled={isSubmitting}
          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {isSubmitting ? t('endConfirming') : t('endConfirm')}
        </button>
        <button
          type="button"
          onClick={() => router.push(detailHref)}
          disabled={isSubmitting}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {t('endKeep')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('endTitle')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('endSubtitle')}</p>
          </div>

          {errorMessage !== null && (
            <p
              role="alert"
              data-testid="end-schedule-error"
              className="text-sm font-medium text-red-600"
            >
              {errorMessage}
            </p>
          )}

          <div>
            <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
              {t('endSectionLabel')}
            </p>
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="text-sm font-semibold text-gray-900">{schedule.serviceName}</p>
              <p className="mt-1 text-sm text-gray-500">{recurrenceLine(schedule.recurrence)}</p>
              <p className="mt-1 text-sm text-gray-500">{termText(schedule)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm leading-relaxed text-blue-900">
            {t('endInfo')}
          </div>

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
