'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { bookingNeedsDecision } from '@/features/booking/model/booking-decision';
import { BookingActionPanel } from './BookingActionPanel';
import { BookingDecisionPanel } from './BookingDecisionPanel';
import type { BookingDetailActionState } from '@/features/booking/model/booking-detail-state';

function PaneHeading({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <p className="text-sm font-semibold text-gray-900">{children}</p>;
}

function BackToAgendaButton({ backHref }: { readonly backHref: string }): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <Button asChild className="w-full">
      <Link href={backHref}>{t('backToAgenda')}</Link>
    </Button>
  );
}

// A terminal state has no actions of its own: the way back to the Agenda, with an optional note.
function BackToAgendaPane({
  backHref,
  note,
  feedback,
}: {
  readonly backHref: string;
  readonly note?: string;
  readonly feedback: FeedbackModel | null;
}): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <ActionPane
      feedback={feedback}
      actions={
        <div className="space-y-3">
          <PaneHeading>{t('actionsSection')}</PaneHeading>
          {note && <p className="text-xs leading-5 text-gray-500">{note}</p>}
          <BackToAgendaButton backHref={backHref} />
        </div>
      }
      mobileActions={<BackToAgendaButton backHref={backHref} />}
    />
  );
}

interface BookingDetailAsideCardProps {
  readonly actionState: BookingDetailActionState;
  readonly booking: StaffBookingDetailResponse;
  readonly backHref: string;
  // The failure of the action the user just took, shown under the buttons (TD57-S12).
  readonly feedback: FeedbackModel | null;
  // UC-074: the appointment's end time (tenant timezone) while it has not passed, else null.
  readonly noShowAvailableAt: string | null;
  readonly canCorrectNoShow: boolean;
  // M23-S46: a manager gets the decision panel on a booking with an open "Reservas a resolver" entry.
  readonly canDecide: boolean;
  // The booking as the server has it after a resolve from the decision panel.
  readonly onBookingRefreshed: (fresh: StaffBookingDetailResponse) => void;
  readonly onOpenNoShow: () => void;
  readonly onOpenCorrectNoShow: () => void;
  readonly onBackWithoutApprove: () => void;
  readonly onOpenComplete: () => void;
  readonly onOpenReschedule: () => void;
  readonly onOpenCancel: () => void;
  readonly onApprove: () => void;
  readonly onOpenReject: () => void;
  readonly onOpenRequestInfo: () => void;
}

// Extracted from BookingDetailPage (TD37-S5A) — the aside action card is a self-contained
// switch over actionState/booking.status, unrelated to the main banner or sheets around it.
// Every branch renders through the shared `ActionPane` (sticky on desktop, fixed bar on mobile).
export function BookingDetailAsideCard({
  actionState,
  booking,
  backHref,
  feedback,
  noShowAvailableAt,
  canCorrectNoShow,
  canDecide,
  onBookingRefreshed,
  onOpenNoShow,
  onOpenCorrectNoShow,
  onBackWithoutApprove,
  onOpenComplete,
  onOpenReschedule,
  onOpenCancel,
  onApprove,
  onOpenReject,
  onOpenRequestInfo,
}: BookingDetailAsideCardProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatTime } = useFormatting();
  const isSubmitting = actionState === 'submitting';

  if (actionState === 'approved' || actionState === 'rejected' || actionState === 'corrected') {
    return <BackToAgendaPane backHref={backHref} feedback={feedback} />;
  }

  if (actionState === 'no-show') {
    return (
      <BackToAgendaPane backHref={backHref} note={t('noShowMarkedAsideNote')} feedback={feedback} />
    );
  }

  if (actionState === 'slot-conflict') {
    const backButton = (
      <Button type="button" variant="ghost" className="w-full" onClick={onBackWithoutApprove}>
        {t('backWithoutApprove')}
      </Button>
    );

    return (
      <ActionPane
        feedback={feedback}
        actions={
          <div className="space-y-3">
            <PaneHeading>{t('approvingLabel')}</PaneHeading>
            <p className="text-sm font-semibold text-gray-900">{booking.contactName}</p>
            <p className="text-sm text-gray-500">
              {booking.lines.map((line) => line.serviceName).join(' · ')}
            </p>
            <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {t('requestedSlotLabel', { time: formatTime(new Date(booking.scheduledAt)) })}
            </p>
            {backButton}
          </div>
        }
        mobileActions={backButton}
      />
    );
  }

  // M23-S46: while the booking has an open "Reservas a resolver" entry none of its normal actions
  // show — a manager gets the decision panel (the worklist's own actions, for this booking), STAFF
  // gets nothing (the banner tells them to ask a manager).
  if (bookingNeedsDecision(booking)) {
    if (!canDecide) return null;
    return <BookingDecisionPanel booking={booking} onBookingRefreshed={onBookingRefreshed} />;
  }

  if (booking.status === BOOKING_STATUS.APPROVED) {
    const approvedProps = {
      bookingStatus: BOOKING_STATUS.APPROVED,
      isSubmitting,
      onOpenComplete,
      onOpenReschedule,
      onOpenCancel,
      onOpenNoShow,
      noShowAvailableAt,
    } as const;

    return (
      <ActionPane
        feedback={feedback}
        actions={<BookingActionPanel {...approvedProps} />}
        mobileActions={<BookingActionPanel {...approvedProps} compact />}
      />
    );
  }

  if (booking.status === BOOKING_STATUS.NO_SHOW) {
    const noShowProps = {
      bookingStatus: BOOKING_STATUS.NO_SHOW,
      isSubmitting,
      canCorrect: canCorrectNoShow,
      onOpenCorrect: onOpenCorrectNoShow,
    } as const;

    return (
      <ActionPane
        feedback={feedback}
        actions={<BookingActionPanel {...noShowProps} />}
        mobileActions={<BookingActionPanel {...noShowProps} compact />}
      />
    );
  }

  if (actionState === 'cancelled') {
    return (
      <ActionPane
        feedback={feedback}
        actions={
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('cancelledAsideBody', { name: booking.contactName })}
            </p>
            <BackToAgendaButton backHref={backHref} />
          </div>
        }
        mobileActions={<BackToAgendaButton backHref={backHref} />}
      />
    );
  }

  // A terminal booking has no actions of its own: just the way back to the Agenda.
  if (
    booking.status === BOOKING_STATUS.COMPLETED ||
    booking.status === BOOKING_STATUS.REJECTED ||
    booking.status === BOOKING_STATUS.CANCELLED
  ) {
    return <BackToAgendaPane backHref={backHref} feedback={feedback} />;
  }

  const triageProps = {
    bookingStatus:
      booking.status === BOOKING_STATUS.INFO_REQUESTED
        ? BOOKING_STATUS.INFO_REQUESTED
        : BOOKING_STATUS.PENDING,
    isSubmitting,
    onApprove,
    onOpenReject,
    onOpenRequestInfo,
  } as const;

  return (
    <ActionPane
      feedback={feedback}
      actions={<BookingActionPanel {...triageProps} />}
      mobileActions={<BookingActionPanel {...triageProps} compact />}
    />
  );
}
