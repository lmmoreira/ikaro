import { BookingErrorCode, type SchedulingExceptionResultItem } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';

// RescheduleBookingPage handles a taken slot by catching an ApiError with status 409, but the
// resolve endpoint answers 200 with a per-entry `STILL_OPEN` and an `errorCode`. This turns that
// answer back into the error the page already understands, so its conflict flow (alternative
// slots, translated messages) keeps working for a "Reservas a resolver" reschedule:
//   RESOLVED                          → returns
//   STILL_OPEN + the slot-unavailable → ApiError 409 (the page shows its alternatives)
//   STILL_OPEN + any other code       → ApiError carrying the code (translated by the page)
export function assertEntryRescheduled(
  response: { readonly results: readonly SchedulingExceptionResultItem[] },
  exceptionId: string,
): void {
  const result = response.results.find((r) => r.exceptionId === exceptionId);
  if (result?.outcome === 'RESOLVED') return;

  const code = result?.errorCode;
  const status = code === BookingErrorCode.SLOT_UNAVAILABLE ? 409 : 422;
  throw new ApiError(status, code ?? 'SCHEDULING_EXCEPTION_NOT_RESOLVED', { code });
}
