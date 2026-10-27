import { BookingErrorCode } from '@ikaro/types';

export type RescheduleFailureKind =
  'windowExpired' | 'slotTaken' | 'slotClosed' | 'bundleUnavailable' | 'bookingWindow' | 'generic';

export interface RescheduleFailure {
  readonly kind: RescheduleFailureKind;
  readonly code: string | undefined;
}

const BOOKING_WINDOW_CODES: ReadonlySet<string> = new Set([
  BookingErrorCode.SCHEDULED_IN_PAST,
  BookingErrorCode.TOO_SOON,
  BookingErrorCode.TOO_FAR_AHEAD,
]);

// A closure or working hours refuse the time: the business is not open then (TD50 Stories 0–1).
const SCHEDULE_CLOSED_CODES: ReadonlySet<string> = new Set([
  BookingErrorCode.SLOT_CLOSED,
  BookingErrorCode.OUTSIDE_BUSINESS_HOURS,
]);

export function isScheduleClosedCode(code: string | undefined): boolean {
  return code !== undefined && SCHEDULE_CLOSED_CODES.has(code);
}

const BUNDLE_CODES: ReadonlySet<string> = new Set([
  BookingErrorCode.BUNDLE_PARTIALLY_UNAVAILABLE,
  BookingErrorCode.LEG_UNAVAILABLE,
]);

function kindOf(code: string | undefined): RescheduleFailureKind {
  if (code === BookingErrorCode.RESCHEDULE_WINDOW_EXPIRED) return 'windowExpired';
  if (code === BookingErrorCode.SLOT_UNAVAILABLE) return 'slotTaken';
  if (isScheduleClosedCode(code)) return 'slotClosed';
  if (code !== undefined && BUNDLE_CODES.has(code)) return 'bundleUnavailable';
  if (code !== undefined && BOOKING_WINDOW_CODES.has(code)) return 'bookingWindow';
  return 'generic';
}

export function classifyRescheduleFailure(code: string | undefined): RescheduleFailure {
  return { kind: kindOf(code), code };
}

/** A conflict, a closed time or a booking-window refusal means the offered list is stale — reload it. */
export function shouldReloadSlots(failure: RescheduleFailure): boolean {
  return (
    failure.kind === 'slotTaken' ||
    failure.kind === 'slotClosed' ||
    failure.kind === 'bundleUnavailable' ||
    failure.kind === 'bookingWindow'
  );
}
