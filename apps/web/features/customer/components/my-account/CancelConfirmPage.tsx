'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookingErrorCode, type CustomerBookingDetailResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cancelBooking } from '../../api';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { extractProblemCode, resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

interface CancelConfirmPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
}

export function CancelConfirmPage({
  booking,
  tenantSlug,
}: CancelConfirmPageProps): React.JSX.Element {
  const t = useTranslations('customer.cancelConfirm');
  const locale = useResolvedLocale();
  const router = useRouter();
  const { formatMoney, formatTime, formatDateLong } = useFormatting();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const topbarStatus = useCustomerTopbarStatus();

  const serviceNames = booking.lines.map((line) => line.serviceName).join(', ');
  const scheduledAt = booking.scheduledAt === null ? null : new Date(booking.scheduledAt);

  useEffect(() => {
    topbarStatus?.setBookingStatus(booking.status);
    topbarStatus?.setBackHrefOverride(`/${tenantSlug}/my-account/bookings/${booking.bookingId}`);
    topbarStatus?.setBackLabelOverride(t('backToBooking'));
    return () => {
      topbarStatus?.setBookingStatus(null);
      topbarStatus?.setBackHrefOverride(null);
      topbarStatus?.setBackLabelOverride(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.bookingId, booking.status, tenantSlug]);

  async function handleConfirm(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await cancelBooking(booking.bookingId);
      router.push(`/${tenantSlug}/my-account`);
    } catch (err) {
      const code = extractProblemCode(err);
      // Only a genuine cancellation-window expiry gets the dedicated deadline-explanation
      // screen — any other failure (e.g. the booking already reached a terminal status)
      // previously also redirected there, showing a fabricated deadline for the wrong reason.
      if (code === BookingErrorCode.CANCELLATION_WINDOW_EXPIRED) {
        router.push(`/${tenantSlug}/my-account/bookings/${booking.bookingId}/cancel/error`);
        return;
      }
      setErrorMessage(resolveErrorMessage(code, locale));
      setIsSubmitting(false);
    }
  }

  function renderActionPane(): React.JSX.Element {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
        <p className="mb-1 text-sm leading-relaxed text-gray-500">{t('confirmNote')}</p>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={isSubmitting}
          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {isSubmitting ? t('confirming') : t('confirmButton')}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isSubmitting}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {t('backButton')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('irreversibleNote')}</p>
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {errorMessage}
            </p>
          )}

          <div>
            <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
              {t('bookingSectionLabel')}
            </p>
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="text-sm font-semibold text-gray-900">{serviceNames}</p>
              {scheduledAt !== null && (
                <p className="mt-1 text-sm text-gray-500">
                  {formatDateLong(scheduledAt)} · {formatTime(scheduledAt)}
                </p>
              )}
              <p className="mt-1 text-sm font-medium text-gray-900">
                {formatMoney(booking.totalPrice.amount)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3.5 text-sm leading-relaxed text-orange-800">
            {t('warningNote')}
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
