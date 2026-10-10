import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { getBooking } from '@/features/booking/api/booking';
import type { BookingDetailActionState } from '@/features/booking/components/dashboard/bookings/BookingDetailMainBanner';
import type { BookingDetailSheetState } from '@/features/booking/components/dashboard/bookings/BookingDetailSheets';
import type {
  CorrectNoShowFailureState,
  NoShowFailureState,
} from '@/features/booking/model/booking-no-show';

interface NoShowOutcomeDeps {
  readonly bookingId: string;
  readonly setBooking: (
    update: (current: StaffBookingDetailResponse) => StaffBookingDetailResponse,
  ) => void;
  readonly setActionState: (state: BookingDetailActionState) => void;
  readonly setSheetState: (state: BookingDetailSheetState) => void;
}

export interface NoShowOutcomeHandlers {
  readonly onNoShowMarked: () => void;
  readonly onNoShowFailed: (state: NoShowFailureState) => void;
  readonly onNoShowCorrected: () => void;
  readonly onCorrectFailed: (state: CorrectNoShowFailureState) => void;
  readonly onRefresh: () => void;
}

// The newest re-read per booking. The handlers are rebuilt on every render, so the counter lives at
// module level: an earlier, slower response must never overwrite what a later one already showed.
const latestRefetch = new Map<string, number>();

// Re-reads the detail so the status history (and a status another user changed) is current. A
// failed re-read keeps what the page already shows.
async function refetchBooking(
  bookingId: string,
  setBooking: NoShowOutcomeDeps['setBooking'],
): Promise<void> {
  const sequence = (latestRefetch.get(bookingId) ?? 0) + 1;
  latestRefetch.set(bookingId, sequence);
  try {
    const fresh = await getBooking(bookingId);
    if (latestRefetch.get(bookingId) === sequence) setBooking(() => fresh);
  } catch {
    // keep the local state
  }
}

// Same shape as buildApproveHandler: the page's outcome handling for UC-074 lives here so the
// page component stays a thin composition. Every failure leaves the booking exactly as it was.
export function buildNoShowOutcomeHandlers({
  bookingId,
  setBooking,
  setActionState,
  setSheetState,
}: NoShowOutcomeDeps): NoShowOutcomeHandlers {
  const refetch = () => refetchBooking(bookingId, setBooking);

  return {
    onNoShowMarked: () => {
      setBooking((current) => ({ ...current, status: BOOKING_STATUS.NO_SHOW }));
      setSheetState(null);
      setActionState('no-show');
      void refetch();
    },
    onNoShowFailed: (state) => {
      setSheetState(null);
      setActionState(state);
      // 409: another user already closed it — show what it is now.
      if (state === 'no-show-terminal') void refetch();
    },
    onNoShowCorrected: () => {
      setBooking((current) => ({ ...current, status: BOOKING_STATUS.COMPLETED }));
      setSheetState(null);
      setActionState('corrected');
      void refetch();
    },
    onCorrectFailed: (state) => {
      setSheetState(null);
      setActionState(state);
    },
    onRefresh: () => {
      setActionState('idle');
      void refetch();
    },
  };
}
