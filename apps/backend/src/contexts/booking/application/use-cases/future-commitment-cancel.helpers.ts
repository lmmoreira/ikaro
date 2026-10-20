import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { FutureCommitmentExceptionAlreadyResolvedError } from '../../domain/errors/future-commitment-exception.error';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import { FutureCommitmentExceptionResolutionType } from '../../domain/future-commitment-exception.types';
import {
  occupiedResourceIds,
  saveTerminalBookingsInTransaction,
  TerminalBookingDeps,
} from '../helpers/booking-exception-closing.helpers';

export interface WorklistCancelInput {
  tenantId: string;
  staffId: string;
  actorRole: 'STAFF' | 'MANAGER';
  correlationId: string;
  reason?: string;
}

// The worklist's CANCEL (UC-077). The resource locks come before the entry row lock, the same
// order a cancel from the booking detail takes, so the two cannot deadlock on one booking
// (docs/28-LOCK_CATALOG.md § 2). The entry id is read unlocked only to find its booking; the row
// lock that follows rechecks that it is still OPEN.
export async function lockResourcesBeforeEntry(
  deps: TerminalBookingDeps,
  exceptionId: string,
  tenantId: string,
): Promise<void> {
  const entry = await deps.exceptionRepo.findById(exceptionId, tenantId);
  if (!entry) return;
  const booking = await deps.bookingRepo.findById(entry.affectedId, tenantId);
  if (!booking) return;
  const occupied = await occupiedResourceIds(deps.occupancyRepo, tenantId, [booking]);
  if (occupied.size > 0) await deps.tenantLock.lockResources(tenantId, [...occupied]);
}

// The selected entry is resolved by the manager afterwards; only its siblings are closed by the
// system.
export async function cancelThroughWorklist(
  deps: TerminalBookingDeps,
  input: WorklistCancelInput,
  exception: FutureCommitmentException,
  booking: Booking,
): Promise<void> {
  const { tenantId, staffId, actorRole, correlationId, reason } = input;
  booking.cancel({ type: actorRole, id: staffId }, correlationId, reason);
  await saveTerminalBookingsInTransaction(deps, {
    tenantId,
    bookings: [booking],
    correlationId,
    excludeExceptionIds: [exception.id],
  });
}

// A bulk cancel ticking both entries of one booking: the first id cancels the booking and closes
// its sibling, so the second id finds its entry closed on a cancelled booking. Nothing is left to
// do, which is a success and not a "still open".
export async function isRepeatedCancelOfCancelledBooking(
  deps: TerminalBookingDeps,
  failure: { err: unknown; resolutionType: FutureCommitmentExceptionResolutionType },
  exceptionId: string,
  tenantId: string,
): Promise<boolean> {
  if (failure.resolutionType !== 'CANCEL') return false;
  if (!(failure.err instanceof FutureCommitmentExceptionAlreadyResolvedError)) return false;
  const entry = await deps.exceptionRepo.findById(exceptionId, tenantId);
  if (!entry) return false;
  const booking = await deps.bookingRepo.findById(entry.affectedId, tenantId);
  return booking?.status === BookingStatus.CANCELLED;
}
