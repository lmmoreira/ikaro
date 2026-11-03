'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookingErrorCode, type CustomerBookingDetailResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cancelBookingAsCustomer } from '@/features/booking/api/customer';
import { appendReturnTo } from '../../booking-navigation';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { extractProblemCode } from '@/shared/lib/i18n/resolve-error-message';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { ConfirmPage } from './ConfirmPage';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

interface CancelConfirmPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
  /** Where the customer came from (e.g. a recurring schedule's page) — success and back return there. */
  readonly returnTo?: string | null;
}

export function CancelConfirmPage({
  booking,
  tenantSlug,
  returnTo = null,
}: CancelConfirmPageProps): React.JSX.Element {
  const t = useTranslations('customer.cancelConfirm');
  const locale = useResolvedLocale();
  const router = useRouter();
  const { formatMoney, formatTime, formatDateLong } = useFormatting();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const feedback = useFormFeedback();
  const topbarStatus = useCustomerTopbarStatus();
  const setBookingStatus = topbarStatus?.setBookingStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;

  const serviceNames = booking.lines.map((line) => line.serviceName).join(', ');
  const scheduledAt = booking.scheduledAt === null ? null : new Date(booking.scheduledAt);

  useEffect(() => {
    setBookingStatus?.(booking.status);
    setBackHrefOverride?.(returnTo ?? `/${tenantSlug}/my-account/bookings/${booking.bookingId}`);
    setBackLabelOverride?.(returnTo === null ? t('backToBooking') : t('backToSchedule'));
    return () => {
      setBookingStatus?.(null);
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [
    booking.bookingId,
    booking.status,
    returnTo,
    setBackHrefOverride,
    setBackLabelOverride,
    setBookingStatus,
    t,
    tenantSlug,
  ]);

  async function handleConfirm(): Promise<void> {
    setIsSubmitting(true);
    feedback.clear();
    try {
      await cancelBookingAsCustomer(booking.bookingId);
      router.push(returnTo ?? `/${tenantSlug}/my-account`);
    } catch (err) {
      const code = extractProblemCode(err);
      // Only a genuine cancellation-window expiry gets the dedicated deadline-explanation
      // screen — any other failure (e.g. the booking already reached a terminal status)
      // previously also redirected there, showing a fabricated deadline for the wrong reason.
      if (code === BookingErrorCode.CANCELLATION_WINDOW_EXPIRED) {
        router.push(
          appendReturnTo(
            `/${tenantSlug}/my-account/bookings/${booking.bookingId}/cancel/error`,
            returnTo,
          ),
        );
        return;
      }
      feedback.setFromApiError(err, locale);
      setIsSubmitting(false);
    }
  }

  return (
    <ConfirmPage
      title={t('title')}
      subtitle={t('irreversibleNote')}
      sectionLabel={t('bookingSectionLabel')}
      summary={
        <>
          <p className="text-sm font-semibold text-gray-900">{serviceNames}</p>
          {scheduledAt !== null && (
            <p className="mt-1 text-sm text-gray-500">
              {formatDateLong(scheduledAt)} · {formatTime(scheduledAt)}
            </p>
          )}
          <p className="mt-1 text-sm font-medium text-gray-900">
            {formatMoney(booking.totalPrice.amount)}
          </p>
        </>
      }
      notice={t('warningNote')}
      noticeTone="warning"
      asideNote={t('confirmNote')}
      confirmLabel={isSubmitting ? t('confirming') : t('confirmButton')}
      keepLabel={t('backButton')}
      isSubmitting={isSubmitting}
      onConfirm={() => void handleConfirm()}
      onKeep={() => router.back()}
      feedback={feedback.feedback}
      feedbackTestId="cancel-confirm-error"
    />
  );
}
