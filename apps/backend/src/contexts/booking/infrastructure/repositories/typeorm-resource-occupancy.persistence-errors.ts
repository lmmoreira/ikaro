import { QueryFailedError } from 'typeorm';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';

// Mirrors typeorm-booking.persistence-errors.ts's APPROVED_SLOT_EXCLUSION mapping, for the new
// shared resource_occupancy GIST exclusion constraint (docs/13-DATABASE_SCHEMA.md).
export const RESOURCE_OCCUPANCY_EXCLUSION = 'EX_booking_resource_occupancy_locked_window';

export function rethrowOccupancyInsertError(err: unknown): never {
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
    constraint === RESOURCE_OCCUPANCY_EXCLUSION
  ) {
    throw new BookingSlotUnavailableError();
  }
  throw err;
}
