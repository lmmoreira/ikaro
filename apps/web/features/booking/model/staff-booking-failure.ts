import { BookingErrorCode } from '@ikaro/types';

// The outcomes `10b` draws for a failed submit. A slot conflict never reaches this list: the shared
// error routing (resolveBookingSubmitErrorRoute) sends it back to the date step with everything
// kept. What lands on the confirmation step is classified here, so the staff-only additions to the
// public routing — the window refusals, a customer without a phone, an unknown customer — live
// in one tested place.
export type StaffBookingFailureKind = 'window' | 'phone' | 'customerNotFound' | 'generic';

const WINDOW_CODES: ReadonlySet<string> = new Set([
  BookingErrorCode.SCHEDULED_IN_PAST,
  BookingErrorCode.TOO_SOON,
  BookingErrorCode.TOO_FAR_AHEAD,
]);

export function classifyStaffBookingFailure(code: string | undefined): StaffBookingFailureKind {
  if (code === BookingErrorCode.CUSTOMER_PHONE_NOT_SET) return 'phone';
  if (code === BookingErrorCode.CUSTOMER_NOT_FOUND) return 'customerNotFound';
  if (code !== undefined && WINDOW_CODES.has(code)) return 'window';
  return 'generic';
}
