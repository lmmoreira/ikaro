import { QueryFailedError } from 'typeorm';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';

// Split out of typeorm-booking.repository.ts to keep it under the file-length cap — pure
// error-mapping, no persistence I/O of its own.
export const APPROVED_SLOT_EXCLUSION = 'EX_booking_bookings_approved_slot';

export function rethrowSaveError(err: unknown): never {
  const driverError =
    err instanceof QueryFailedError
      ? (err as QueryFailedError & {
          code?: string;
          constraint?: string;
          driverError?: { code?: string; constraint?: string };
        })
      : null;
  const code = driverError?.driverError?.code ?? driverError?.code;
  const constraint = driverError?.driverError?.constraint ?? driverError?.constraint;
  if (
    err instanceof QueryFailedError &&
    code === '23P01' &&
    constraint === APPROVED_SLOT_EXCLUSION
  ) {
    throw new BookingSlotUnavailableError();
  }
  throw err;
}
