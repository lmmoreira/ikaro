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

interface CompletedActionPaneProps {
  readonly tenantSlug: string;
}

function CompletedActionPane({ tenantSlug }: CompletedActionPaneProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="mb-4 text-sm leading-relaxed text-gray-500">{t('completedNote')}</p>
      <Link
        href={`/${tenantSlug}/booking`}
        className="block rounded-lg bg-blue-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
      >
        {t('newBookingCta')}
      </Link>
      <Link
        href={`/${tenantSlug}/my-account/loyalty`}
        className="mt-1.5 block rounded-lg px-3 py-2.5 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50"
      >
        {t('viewPointsCta')}
      </Link>
    </div>
  );
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
  const isInfoRequested = status === BOOKING_STATUS.INFO_REQUESTED;
  const showCancel =
    status === BOOKING_STATUS.PENDING ||
    isInfoRequested ||
    (status === BOOKING_STATUS.APPROVED && booking.cancellableUntil !== null);
  const showInfoForm =
    isInfoRequested && booking.infoResponseMessage === null && !infoJustSubmitted;
  // INFO_REQUESTED's cancel button stays inline below the form — the prototype has no
  // sidebar for that state (the form is the primary action). PENDING/APPROVED/COMPLETED
  // get the two-column layout with a sticky action pane on desktop.
  const hasSidebarAction = !isInfoRequested && (showCancel || status === BOOKING_STATUS.COMPLETED);

  function renderActionPane(): React.JSX.Element {
    return status === BOOKING_STATUS.COMPLETED ? (
      <CompletedActionPane tenantSlug={tenantSlug} />
    ) : (
      <CancelAction
        tenantSlug={tenantSlug}
        bookingId={booking.bookingId}
        status={status}
        cancellableUntil={booking.cancellableUntil}
      />
    );
  }

  return (
    <div className="w-full">
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

      <div
        className={
          hasSidebarAction
            ? 'mt-4 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6'
            : 'mt-4'
        }
      >
        <div className="flex flex-col gap-4">
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

          {isInfoRequested && showCancel && (
            <CancelAction
              tenantSlug={tenantSlug}
              bookingId={booking.bookingId}
              status={status}
              cancellableUntil={booking.cancellableUntil}
            />
          )}

          {hasSidebarAction && <div className="lg:hidden">{renderActionPane()}</div>}
        </div>

        {hasSidebarAction && (
          <div className="hidden lg:sticky lg:top-6 lg:block">{renderActionPane()}</div>
        )}
      </div>
    </div>
  );
}
