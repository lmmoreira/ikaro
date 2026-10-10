import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import type { BookingDetailActionState } from '@/features/booking/components/dashboard/bookings/BookingDetailMainBanner';
import type { BookingDetailSheetState } from '@/features/booking/components/dashboard/bookings/BookingDetailSheets';

interface BookingSheetOutcomeDeps {
  readonly setBooking: (
    update: (current: StaffBookingDetailResponse) => StaffBookingDetailResponse,
  ) => void;
  readonly setActionState: (state: BookingDetailActionState) => void;
  readonly setSheetState: (state: BookingDetailSheetState) => void;
}

// What the page does once the reject / request-info / cancel sheets succeed: the booking moves to
// the new status locally and the matching success banner shows (extracted from BookingDetailPage
// for the file-length cap, next to buildApproveHandler and buildNoShowOutcomeHandlers).
export function buildBookingSheetOutcomes({
  setBooking,
  setActionState,
  setSheetState,
}: BookingSheetOutcomeDeps) {
  return {
    onRejected: (reason: string) => {
      setBooking((current) => ({
        ...current,
        status: BOOKING_STATUS.REJECTED,
        rejectionReason: reason,
      }));
      setSheetState(null);
      setActionState('rejected');
    },
    onInfoRequested: (message: string) => {
      setBooking((current) => ({
        ...current,
        status: BOOKING_STATUS.INFO_REQUESTED,
        infoRequestMessage: message,
      }));
      setSheetState(null);
      setActionState('info-requested');
    },
    onCancelled: () => {
      setBooking((current) => ({ ...current, status: BOOKING_STATUS.CANCELLED }));
      setSheetState(null);
      setActionState('cancelled');
    },
  };
}
