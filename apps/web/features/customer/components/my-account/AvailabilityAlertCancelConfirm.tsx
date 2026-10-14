'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookingErrorCode, type AvailabilityAlertResponse } from '@ikaro/types';
import { cancelAvailabilityAlertAsCustomer } from '@/features/booking/api/availability-alerts';
import { extractProblemCode } from '@/shared/lib/i18n/resolve-error-message';
import { alertDetailPath, alertListPath } from '../../alert-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { useAlertText } from './use-alert-text';

interface AvailabilityAlertCancelConfirmProps {
  readonly alert: AvailabilityAlertResponse;
  readonly tenantSlug: string;
}

/**
 * The dedicated confirmation page for cancelling an alert (never an inline panel). A network or
 * server failure keeps the alert active and offers a retry; a `409` means the alert was notified
 * or expired in the meantime, so the customer goes back to the list, where it already sits under
 * "Histórico".
 */
export function AvailabilityAlertCancelConfirm({
  alert,
  tenantSlug,
}: AvailabilityAlertCancelConfirmProps): React.JSX.Element {
  const t = useTranslations('customer.alerts');
  const router = useRouter();
  const text = useAlertText();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const topbarStatus = useCustomerTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const detailHref = alertDetailPath(tenantSlug, alert.id);
  const listHref = alertListPath(tenantSlug);

  useEffect(() => {
    setBackHrefOverride?.(detailHref);
    setBackLabelOverride?.(t('backToAlert'));
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [detailHref, setBackHrefOverride, setBackLabelOverride, t]);

  async function handleConfirm(): Promise<void> {
    setIsSubmitting(true);
    setFailed(false);
    try {
      await cancelAvailabilityAlertAsCustomer(alert.id);
    } catch (err) {
      if (extractProblemCode(err) !== BookingErrorCode.ALERT_NOT_EDITABLE) {
        setFailed(true);
        setIsSubmitting(false);
        return;
      }
    }
    router.push(listHref);
    router.refresh();
  }

  const details = text.durationAndPeople(alert);
  let confirmLabel = t('cancelConfirm');
  if (isSubmitting) confirmLabel = t('cancelConfirming');
  else if (failed) confirmLabel = t('retry');

  function renderActionPane(): React.JSX.Element {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
        <p className="mb-1 text-sm leading-relaxed text-gray-500">{t('cancelAside')}</p>
        <button
          type="button"
          data-testid="cancel-alert-confirm"
          onClick={() => void handleConfirm()}
          disabled={isSubmitting}
          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => router.push(detailHref)}
          disabled={isSubmitting}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {t('cancelKeep')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="alert-cancel-confirm">
      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {failed && (
            <div
              role="alert"
              data-testid="cancel-alert-error"
              className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-900"
            >
              <p className="text-sm font-semibold">{t('cancelErrorTitle')}</p>
              <p className="mt-0.5 text-sm">{t('cancelErrorBody')}</p>
            </div>
          )}

          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('cancelTitle')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('cancelSubtitle')}</p>
          </div>

          <div>
            <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
              {t('cancelSectionLabel')}
            </p>
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="text-sm font-semibold text-gray-900">{text.title(alert)}</p>
              <p className="mt-1 text-sm text-gray-500">{text.criteriaLine(alert)}</p>
              {details !== '' && <p className="mt-1 text-sm text-gray-500">{details}</p>}
              <p className="mt-1 text-sm text-gray-500">{text.statusLine(alert)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm leading-relaxed text-blue-900">
            {t('cancelInfo')}
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
