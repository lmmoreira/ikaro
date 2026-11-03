'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookingErrorCode, type AvailabilityAlertResponse } from '@ikaro/types';
import { cancelAvailabilityAlertAsCustomer } from '@/features/booking/api/availability-alerts';
import { extractProblemCode } from '@/shared/lib/i18n/resolve-error-message';
import { alertDetailPath, alertListPath } from '../../alert-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { ConfirmPage } from './ConfirmPage';
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

  return (
    <ConfirmPage
      testId="alert-cancel-confirm"
      title={t('cancelTitle')}
      subtitle={t('cancelSubtitle')}
      sectionLabel={t('cancelSectionLabel')}
      summary={
        <>
          <p className="text-sm font-semibold text-gray-900">{text.title(alert)}</p>
          <p className="mt-1 text-sm text-gray-500">{text.criteriaLine(alert)}</p>
          {details !== '' && <p className="mt-1 text-sm text-gray-500">{details}</p>}
          <p className="mt-1 text-sm text-gray-500">{text.statusLine(alert)}</p>
        </>
      }
      notice={t('cancelInfo')}
      noticeTone="info"
      asideNote={t('cancelAside')}
      confirmLabel={confirmLabel}
      confirmTestId="cancel-alert-confirm"
      keepLabel={t('cancelKeep')}
      isSubmitting={isSubmitting}
      onConfirm={() => void handleConfirm()}
      onKeep={() => router.push(detailHref)}
      feedback={
        failed
          ? { variant: 'error', title: t('cancelErrorTitle'), hint: t('cancelErrorBody') }
          : null
      }
      feedbackTestId="cancel-alert-error"
    />
  );
}
