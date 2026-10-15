import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';

// The statuses a "Reservas a resolver" entry is raised for (a future commitment still waiting).
const DECIDABLE_STATUSES: readonly string[] = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.INFO_REQUESTED,
  BOOKING_STATUS.APPROVED,
];

interface RefreshedHandlerSetters {
  readonly setBooking: (booking: StaffBookingDetailResponse) => void;
  readonly setActionState: (state: 'cancelled') => void;
}

// M23-S46 — after a resolve from the decision panel the page shows the booking as the server now
// has it; a cancelled one also gets the cancelled aside (the way back to the agenda).
export function buildBookingRefreshedHandler({
  setBooking,
  setActionState,
}: RefreshedHandlerSetters): (fresh: StaffBookingDetailResponse) => void {
  return (fresh) => {
    setBooking(fresh);
    if (fresh.status === BOOKING_STATUS.CANCELLED) setActionState('cancelled');
  };
}

// M23-S46 — the booking detail shows the banner and the decision panel only while the booking is
// still a live commitment. A booking that was just cancelled can still carry an open entry for a
// moment (a sibling entry is closed by the server afterwards); it needs no decision any more.
export function bookingNeedsDecision(
  booking: Pick<StaffBookingDetailResponse, 'hasOpenException' | 'status'>,
): boolean {
  return booking.hasOpenException && DECIDABLE_STATUSES.includes(booking.status);
}
