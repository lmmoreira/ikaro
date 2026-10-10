import {
  BookingErrorCode,
  type BookingStatusHistoryEntry,
  type StaffBookingDetailResponse,
} from '@ikaro/types';
import { ApiError, ForbiddenError } from '@/shared/lib/api/errors';
import { extractProblemCode } from '@/shared/lib/i18n/resolve-error-message';

export const NO_SHOW_REASON_MAX = 500;
export const NO_SHOW_CORRECTION_REASON_MIN = 10;

export type NoShowFailureState = 'no-show-terminal' | 'no-show-not-ended' | 'no-show-error';
export type CorrectNoShowFailureState = 'correct-forbidden' | 'correct-error';

// The appointment's scheduled end (UC-074 precondition): `scheduledAt + totalDurationMins`.
export function resolveBookingEnd(
  booking: Pick<StaffBookingDetailResponse, 'scheduledAt' | 'totalDurationMins'>,
): Date {
  return new Date(new Date(booking.scheduledAt).getTime() + booking.totalDurationMins * 60_000);
}

export function hasBookingEnded(
  booking: Pick<StaffBookingDetailResponse, 'scheduledAt' | 'totalDurationMins'>,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= resolveBookingEnd(booking).getTime();
}

// Which prototype banner a failed `POST /bookings/:id/no-show` maps to (03c #rejeitado, 03e
// #terminal, 03e #falha). Anything that is not one of the two named domain errors — a network
// failure, a 5xx — is the retry banner.
export function resolveNoShowFailureState(err: unknown): NoShowFailureState {
  if (err instanceof ApiError) {
    const code = extractProblemCode(err);
    if (err.status === 409 && code === BookingErrorCode.ALREADY_TERMINAL) return 'no-show-terminal';
    if (err.status === 422 && code === BookingErrorCode.NOT_YET_ENDED) return 'no-show-not-ended';
  }
  return 'no-show-error';
}

// 03g #permissao for a 403, #falha for everything else.
export function resolveCorrectFailureState(err: unknown): CorrectNoShowFailureState {
  return err instanceof ForbiddenError ? 'correct-forbidden' : 'correct-error';
}

// Loyalty points a correction awards (the resulting `BookingCompleted` grants each line's
// `pointsValueAtBooking`); null for a guest booking, which has no loyalty account.
export function resolveCorrectionPoints(
  booking: Pick<StaffBookingDetailResponse, 'customerId' | 'lines'>,
): number | null {
  if (booking.customerId === null) return null;
  return booking.lines.reduce((sum, line) => sum + line.pointsValueAtBooking, 0);
}

export function isCorrectionReasonValid(reason: string): boolean {
  const length = reason.trim().length;
  return length >= NO_SHOW_CORRECTION_REASON_MIN && length <= NO_SHOW_REASON_MAX;
}

// The history card shows for a booking that is, or ever was, a no-show.
export function hasNoShowHistory(entries: readonly BookingStatusHistoryEntry[]): boolean {
  return entries.some((entry) => entry.fromStatus === 'NO_SHOW' || entry.toStatus === 'NO_SHOW');
}
