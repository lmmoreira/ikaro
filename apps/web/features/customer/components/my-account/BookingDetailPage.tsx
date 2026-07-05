'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { canCancelBooking } from '../../booking-sections';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { BookingDetailMain } from './BookingDetailMain';
import { CancelAction } from './CancelAction';
import { InfoSubmitForm } from './InfoSubmitForm';

interface BookingDetailPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
  readonly returnTo?: string | null;
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
  returnTo = null,
}: BookingDetailPageProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const [status, setStatus] = useState(booking.status);
  const [infoJustSubmitted, setInfoJustSubmitted] = useState(false);
  const topbarStatus = useCustomerTopbarStatus();
  const setTopbarBookingStatus = topbarStatus?.setBookingStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;

  const isInfoRequested = status === BOOKING_STATUS.INFO_REQUESTED;
  const showCancel = canCancelBooking({ status, cancellableUntil: booking.cancellableUntil });
  const showInfoForm =
    isInfoRequested && booking.infoResponseMessage === null && !infoJustSubmitted;
  // Every non-terminal state gets the same two-column layout, with a sticky action pane on
  // desktop — INFO_REQUESTED stacks the response form above the cancel option in that pane.
  const hasSidebarAction = showCancel || status === BOOKING_STATUS.COMPLETED;

  useEffect(() => {
    setTopbarBookingStatus?.(status);
    return () => {
      setTopbarBookingStatus?.(null);
    };
  }, [status, setTopbarBookingStatus]);

  useEffect(() => {
    const backHref = returnTo ?? `/${tenantSlug}/my-account/bookings`;
    const backLabel = returnTo?.endsWith('/loyalty') ? t('backToLoyalty') : t('backToBookings');
    setBackHrefOverride?.(backHref);
    setBackLabelOverride?.(backLabel);
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [tenantSlug, returnTo, t, setBackHrefOverride, setBackLabelOverride]);

  function renderActionPane(): React.JSX.Element {
    if (status === BOOKING_STATUS.COMPLETED) {
      return <CompletedActionPane tenantSlug={tenantSlug} />;
    }
    return (
      <div className="flex flex-col gap-3">
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
      </div>
    );
  }

  return (
    <div className="w-full">
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

          {hasSidebarAction && (
            <div data-testid="action-pane-mobile" className="lg:hidden">
              {renderActionPane()}
            </div>
          )}
        </div>

        {hasSidebarAction && (
          <div data-testid="action-pane-desktop" className="hidden lg:sticky lg:top-6 lg:block">
            {renderActionPane()}
          </div>
        )}
      </div>
    </div>
  );
}
