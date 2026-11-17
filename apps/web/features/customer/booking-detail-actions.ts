import { BOOKING_STATUS, type CustomerBookingDetailResponse } from '@ikaro/types';
import { canCancelBooking, canRescheduleBooking } from './booking-sections';

export type ClosedNoteKey = 'completedNote' | 'noShowNote' | 'cancelledNote' | 'rejectedNote';

// COMPLETED and NO_SHOW share one pane (02c / 02f) with CANCELLED and REJECTED: a note, a way to
// book again, and the points.
export const CLOSED_NOTE: Partial<Record<CustomerBookingDetailResponse['status'], ClosedNoteKey>> =
  {
    [BOOKING_STATUS.COMPLETED]: 'completedNote',
    [BOOKING_STATUS.NO_SHOW]: 'noShowNote',
    [BOOKING_STATUS.CANCELLED]: 'cancelledNote',
    [BOOKING_STATUS.REJECTED]: 'rejectedNote',
  };

interface BookingDetailActionsInput {
  readonly status: CustomerBookingDetailResponse['status'];
  readonly booking: Pick<
    CustomerBookingDetailResponse,
    'cancellableUntil' | 'reschedule' | 'infoRequestMessage' | 'infoResponseMessage'
  >;
  /** `false` while the tenant is suspended (UC-121): no reschedule and no information response. */
  readonly tenantOperational: boolean;
  readonly infoJustSubmitted: boolean;
}

export interface BookingDetailActions {
  readonly showCancel: boolean;
  readonly showRescheduleAction: boolean;
  readonly showInfoFields: boolean;
  readonly closedNote: ClosedNoteKey | undefined;
  /** Every non-terminal state gets the two-column layout with the shared action pane. */
  readonly hasSidebarAction: boolean;
  readonly hasMobileNotes: boolean;
}

// What the customer's booking detail offers for a booking in `status`: a pure decision, so the
// page only renders it. While the tenant is suspended the detail stays readable and a future
// booking can still be cancelled, but reschedule and the information response are not offered.
export function resolveBookingDetailActions({
  status,
  booking,
  tenantOperational,
  infoJustSubmitted,
}: BookingDetailActionsInput): BookingDetailActions {
  const showCancel = canCancelBooking({ status, cancellableUntil: booking.cancellableUntil });
  const showReschedule =
    tenantOperational && canRescheduleBooking({ status, reschedule: booking.reschedule });
  const showInfoForm =
    tenantOperational &&
    status === BOOKING_STATUS.INFO_REQUESTED &&
    booking.infoResponseMessage === null &&
    !infoJustSubmitted;
  const closedNote = CLOSED_NOTE[status];
  const showRescheduleAction = showReschedule && booking.reschedule !== null;
  const hasCancelWindowNote =
    showCancel && status === BOOKING_STATUS.APPROVED && booking.cancellableUntil !== null;

  return {
    showCancel,
    showRescheduleAction,
    showInfoFields: showInfoForm && booking.infoRequestMessage !== null,
    closedNote,
    hasSidebarAction: showCancel || showReschedule || closedNote !== undefined,
    hasMobileNotes: showRescheduleAction || hasCancelWindowNote,
  };
}
