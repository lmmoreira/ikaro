'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import {
  buildBookingStatusLabels,
  BOOKING_STATUS_CLASSES,
} from '@/features/booking/model/booking-status';
import { BookingDetailMain } from './BookingDetailMain';
import { CancelAction } from './CancelAction';
import { InfoSubmitForm } from './InfoSubmitForm';

interface BookingDetailPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
}

export function BookingDetailPage({
  booking,
  tenantSlug,
}: BookingDetailPageProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const statusLabelsT = useTranslations('customer.bookingItem');
  const [status, setStatus] = useState(booking.status);
  const [infoJustSubmitted, setInfoJustSubmitted] = useState(false);

  const statusLabels = buildBookingStatusLabels(statusLabelsT);
  const showCancel =
    status === BOOKING_STATUS.PENDING ||
    status === BOOKING_STATUS.INFO_REQUESTED ||
    (status === BOOKING_STATUS.APPROVED && booking.cancellableUntil !== null);
  const showInfoForm =
    status === BOOKING_STATUS.INFO_REQUESTED &&
    booking.infoResponseMessage === null &&
    !infoJustSubmitted;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <Link
          href={`/${tenantSlug}/my-account/bookings`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          ← {t('backToBookings')}
        </Link>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BOOKING_STATUS_CLASSES[status]}`}
        >
          {statusLabels[status]}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <BookingDetailMain booking={{ ...booking, status }} />

        {infoJustSubmitted && (
          <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            {t('responseSentConfirmation')}
          </div>
        )}

        {showInfoForm && booking.infoRequestMessage !== null && (
          <InfoSubmitForm
            bookingId={booking.bookingId}
            infoRequestMessage={booking.infoRequestMessage}
            onSubmitted={() => {
              setStatus(BOOKING_STATUS.PENDING);
              setInfoJustSubmitted(true);
            }}
          />
        )}

        {showCancel && (
          <CancelAction
            tenantSlug={tenantSlug}
            bookingId={booking.bookingId}
            status={status}
            cancellableUntil={booking.cancellableUntil}
          />
        )}

        {status === BOOKING_STATUS.COMPLETED && (
          <Link
            href={`/${tenantSlug}/booking`}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('newBookingCta')}
          </Link>
        )}
      </div>
    </div>
  );
}
