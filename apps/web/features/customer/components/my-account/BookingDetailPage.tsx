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
import { canCancelBooking, canRescheduleBooking } from '../../booking-sections';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { BookingDetailMain } from './BookingDetailMain';
import { CancelAction } from './CancelAction';
import { InfoSubmitButton, InfoSubmitForm, useInfoSubmit } from './InfoSubmitForm';
import { RescheduleAction } from './RescheduleAction';

interface BookingDetailPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
  readonly returnTo?: string | null;
}

type ClosedNoteKey = 'completedNote' | 'noShowNote' | 'cancelledNote' | 'rejectedNote';

// COMPLETED and NO_SHOW share one pane (02c / 02f) with CANCELLED and REJECTED: a note, a way to
// book again, and the points.
const CLOSED_NOTE: Partial<Record<CustomerBookingDetailResponse['status'], ClosedNoteKey>> = {
  [BOOKING_STATUS.COMPLETED]: 'completedNote',
  [BOOKING_STATUS.NO_SHOW]: 'noShowNote',
  [BOOKING_STATUS.CANCELLED]: 'cancelledNote',
  [BOOKING_STATUS.REJECTED]: 'rejectedNote',
};

export function BookingDetailPage({
  booking,
  tenantSlug,
  returnTo = null,
}: BookingDetailPageProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
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

  const isInfoRequested = status === BOOKING_STATUS.INFO_REQUESTED;
  const showCancel = canCancelBooking({ status, cancellableUntil: booking.cancellableUntil });
  const showReschedule = canRescheduleBooking({ status, reschedule: booking.reschedule });
  const showInfoForm =
    isInfoRequested && booking.infoResponseMessage === null && !infoJustSubmitted;
  const closedNote = CLOSED_NOTE[status];
  const showInfoFields = showInfoForm && booking.infoRequestMessage !== null;
  // Every non-terminal state gets the same two-column layout, with the shared action pane: the
  // sticky card on desktop, the fixed bottom bar on mobile.
  const hasSidebarAction = showCancel || showReschedule || closedNote !== undefined;
  const showRescheduleAction = showReschedule && booking.reschedule !== null;
  const hasMobileNotes =
    showRescheduleAction ||
    (showCancel && status === BOOKING_STATUS.APPROVED && booking.cancellableUntil !== null);
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
        {newBookingLink}
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
      <div className="grid grid-cols-2 gap-3">
        {pointsLink}
        {newBookingLink}
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
          <BookingDetailMain booking={{ ...booking, status }} tenantSlug={tenantSlug} />

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
