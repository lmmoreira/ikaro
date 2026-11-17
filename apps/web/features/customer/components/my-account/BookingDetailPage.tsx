'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { FeedbackMessage, type FeedbackModel } from '@/shared/components/ui/feedback-message';
import { returnBackLabelKey } from '../../booking-navigation';
import { resolveBookingDetailActions } from '../../booking-detail-actions';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { BookingDetailMain } from './BookingDetailMain';
import { CancelAction } from './CancelAction';
import { InfoSubmitButton, InfoSubmitForm, useInfoSubmit } from './InfoSubmitForm';
import { RescheduleAction } from './RescheduleAction';

interface BookingDetailPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
  readonly returnTo?: string | null;
  /**
   * `false` while the tenant is suspended (UC-121): the detail stays readable and a future
   * booking can still be cancelled, but the page offers no reschedule, no info response and no
   * new booking, and shows the neutral "Empresa inativa" notice. `true` (the default) is today's page.
   */
  readonly tenantOperational?: boolean;
}

export function BookingDetailPage({
  booking,
  tenantSlug,
  returnTo = null,
  tenantOperational = true,
}: BookingDetailPageProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const tInactive = useTranslations('customer.inactiveTenant');
  const [status, setStatus] = useState(booking.status);
  const [infoJustSubmitted, setInfoJustSubmitted] = useState(false);
  const info = useInfoSubmit({
    bookingId: booking.bookingId,
    onSubmitted: () => {
      setStatus(BOOKING_STATUS.PENDING);
      setInfoJustSubmitted(true);
    },
  });
  const topbarStatus = useCustomerTopbarStatus();
  const setTopbarBookingStatus = topbarStatus?.setBookingStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;

  const {
    showCancel,
    showRescheduleAction,
    showInfoFields,
    closedNote,
    hasSidebarAction,
    hasMobileNotes,
  } = resolveBookingDetailActions({ status, booking, tenantOperational, infoJustSubmitted });
  const sentFeedback: FeedbackModel | null = infoJustSubmitted
    ? {
        variant: 'success',
        title: t('responseSentConfirmation'),
        testId: 'info-sent-confirmation',
      }
    : null;

  useEffect(() => {
    setTopbarBookingStatus?.(status);
    return () => {
      setTopbarBookingStatus?.(null);
    };
  }, [status, setTopbarBookingStatus]);

  useEffect(() => {
    const backHref = returnTo ?? `/${tenantSlug}/my-account/bookings`;
    const backLabel = t(returnBackLabelKey(returnTo));
    setBackHrefOverride?.(backHref);
    setBackLabelOverride?.(backLabel);
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [tenantSlug, returnTo, t, setBackHrefOverride, setBackLabelOverride]);

  const rescheduleAction = (part: 'full' | 'button' | 'note') =>
    showRescheduleAction && booking.reschedule !== null ? (
      <RescheduleAction
        tenantSlug={tenantSlug}
        bookingId={booking.bookingId}
        eligibleUntil={booking.reschedule.eligibleUntil}
        returnTo={returnTo}
        part={part}
      />
    ) : null;
  const cancelAction = (part: 'full' | 'button' | 'note') =>
    showCancel ? (
      <CancelAction
        tenantSlug={tenantSlug}
        bookingId={booking.bookingId}
        status={status}
        cancellableUntil={booking.cancellableUntil}
        part={part}
      />
    ) : null;
  const newBookingLink = (
    <Button asChild className="w-full">
      <Link href={`/${tenantSlug}/booking`}>{t('newBookingCta')}</Link>
    </Button>
  );
  const pointsLink = (
    <Button asChild variant="ghost" className="w-full">
      <Link href={`/${tenantSlug}/my-account/loyalty`}>{t('viewPointsCta')}</Link>
    </Button>
  );
  const submitButton = showInfoFields ? <InfoSubmitButton controller={info} /> : null;

  const paneActions =
    closedNote === undefined ? (
      <>
        {submitButton}
        {rescheduleAction('full')}
        {cancelAction('full')}
      </>
    ) : (
      <>
        <p className="text-sm leading-relaxed text-gray-500">{t(closedNote)}</p>
        {tenantOperational && newBookingLink}
        {pointsLink}
      </>
    );
  const paneMobileActions =
    closedNote === undefined ? (
      <div className="grid auto-cols-fr grid-flow-col gap-3">
        {submitButton}
        {rescheduleAction('button')}
        {cancelAction('button')}
      </div>
    ) : (
      <div className={tenantOperational ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
        {pointsLink}
        {tenantOperational && newBookingLink}
      </div>
    );

  return (
    <div className={hasSidebarAction ? 'w-full pb-40 lg:pb-0' : 'w-full'}>
      <div
        className={
          hasSidebarAction
            ? 'mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6'
            : 'mt-4'
        }
      >
        <div className="flex flex-col gap-4">
          {!tenantOperational && (
            <Card
              data-testid="booking-inactive-notice"
              className="flex flex-col gap-1 rounded-xl border-gray-200 bg-gray-50 p-4 shadow-none"
            >
              <p className="text-sm font-semibold text-gray-800">{tInactive('badge')}</p>
              <p className="text-sm leading-relaxed text-gray-600">{tInactive('detailNotice')}</p>
            </Card>
          )}
          {showInfoFields && booking.infoRequestMessage !== null && (
            <InfoSubmitForm infoRequestMessage={booking.infoRequestMessage} controller={info} />
          )}
          {status === BOOKING_STATUS.NO_SHOW && (
            <div
              data-testid="booking-no-show-notice"
              className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800"
            >
              <p className="font-bold">{t('noShowTitle')}</p>
              <p className="mt-1 leading-6">{t('noShowBody')}</p>
              <p className="mt-1 leading-6">{t('noShowContact')}</p>
            </div>
          )}
          {(status === BOOKING_STATUS.CANCELLED || status === BOOKING_STATUS.REJECTED) && (
            <div
              data-testid="booking-ended-notice"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <p className="font-bold">
                {t(status === BOOKING_STATUS.CANCELLED ? 'cancelledTitle' : 'rejectedTitle')}
              </p>
              <p className="mt-1 leading-6">
                {t(status === BOOKING_STATUS.CANCELLED ? 'cancelledBody' : 'rejectedBody')}
              </p>
            </div>
          )}
          <BookingDetailMain
            booking={{ ...booking, status }}
            tenantSlug={tenantSlug}
            tenantOperational={tenantOperational}
          />

          {sentFeedback !== null && !hasSidebarAction && (
            <FeedbackMessage
              variant="success"
              title={sentFeedback.title}
              testId={sentFeedback.testId}
            />
          )}

          {hasMobileNotes && (
            <Card className="flex flex-col gap-2 rounded-xl border-gray-100 p-4 shadow-none lg:hidden">
              {rescheduleAction('note')}
              {cancelAction('note')}
            </Card>
          )}
        </div>

        {hasSidebarAction && (
          <ActionPane
            actions={paneActions}
            mobileActions={paneMobileActions}
            feedback={sentFeedback ?? info.feedback}
          />
        )}
      </div>
    </div>
  );
}
