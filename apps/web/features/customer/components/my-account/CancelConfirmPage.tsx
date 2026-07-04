'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cancelBooking } from '../../api';

interface CancelConfirmPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
}

export function CancelConfirmPage({
  booking,
  tenantSlug,
}: CancelConfirmPageProps): React.JSX.Element {
  const t = useTranslations('customer.cancelConfirm');
  const router = useRouter();
  const { formatMoney, formatTime, formatDateLong } = useFormatting();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const serviceNames = booking.lines.map((line) => line.serviceName).join(', ');
  const scheduledAt = booking.scheduledAt === null ? null : new Date(booking.scheduledAt);

  async function handleConfirm(): Promise<void> {
    setIsSubmitting(true);
    setHasFailed(false);
    try {
      await cancelBooking(booking.bookingId);
      router.push(`/${tenantSlug}/my-account`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        router.push(`/${tenantSlug}/my-account/bookings/${booking.bookingId}/cancel/error`);
        return;
      }
      setHasFailed(true);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
      <p className="text-sm text-gray-500">{t('irreversibleNote')}</p>

      {hasFailed && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {t('genericError')}
        </p>
      )}

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
