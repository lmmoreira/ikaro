import { mapSequentially } from '../../../../shared/utils/sequential';
import { Booking } from '../../domain/booking.aggregate';
import {
  FutureCommitmentException,
  FutureCommitmentExceptionSourceType,
} from '../../domain/future-commitment-exception.aggregate';
import { IBookingRepository } from '../ports/booking-repository.port';
import { IFutureCommitmentExceptionRepository } from '../ports/future-commitment-exception-repository.port';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { ITenantLockPort } from '../ports/tenant-lock.port';
import { releaseBookingOccupancy } from './resource-occupancy-assignment.helpers';

export const BOOKING_NO_LONGER_ACTIVE = 'BOOKING_NO_LONGER_ACTIVE';
export const RESOURCE_NO_LONGER_USED = 'RESOURCE_NO_LONGER_USED';

// M23-S48 — a "Reservas a resolver" entry says "this booking has a problem with this resource".
// It is obsolete the moment the booking no longer occupies that resource, so every change that
// releases or moves a booking's occupancy closes the booking's open entries in the same
// transaction (docs/28-LOCK_CATALOG.md). Lock order, always: resource locks → entry rows →
// booking save → occupancy; the callers below must not take them in another order.
export interface StaleExceptionDeps {
  occupancyRepo: IResourceOccupancyRepository;
  exceptionRepo: IFutureCommitmentExceptionRepository;
}

export interface TerminalBookingDeps extends StaleExceptionDeps {
  bookingRepo: IBookingRepository;
  tenantLock: ITenantLockPort;
}

export interface SaveTerminalBookingsParams {
  tenantId: string;
  bookings: readonly Booking[];
  correlationId: string;
  // Entries the caller closes itself (the worklist's selected entry is RESOLVED by the manager).
  excludeExceptionIds?: readonly string[];
}

export interface DismissStaleExceptionsParams {
  tenantId: string;
  booking: Booking;
  exceptions: readonly FutureCommitmentException[];
  correlationId: string;
  excludeExceptionIds?: readonly string[];
}

const lineIdsOf = (bookings: readonly Booking[]): string[] =>
  bookings.flatMap((booking) => booking.lines.map((line) => line.lineId));

export async function occupiedResourceIds(
  occupancyRepo: IResourceOccupancyRepository,
  tenantId: string,
  bookings: readonly Booking[],
): Promise<Set<string>> {
  const rows = await occupancyRepo.findOccupancyByBookingLines(tenantId, lineIdsOf(bookings));
  return new Set(rows.map((row) => row.resourceId));
}

// The lock set is what the bookings occupy now; a concurrent reassign could change it between the
// read and the lock, so it is read again and the union is locked if it grew (one sorted call each
// time, the adapter orders the ids).
async function lockOccupiedResources(
  deps: TerminalBookingDeps,
  tenantId: string,
  bookings: readonly Booking[],
): Promise<void> {
  const first = await occupiedResourceIds(deps.occupancyRepo, tenantId, bookings);
  if (first.size > 0) await deps.tenantLock.lockResources(tenantId, [...first]);
  const second = await occupiedResourceIds(deps.occupancyRepo, tenantId, bookings);
  if ([...second].some((id) => !first.has(id))) {
    await deps.tenantLock.lockResources(tenantId, [...new Set([...first, ...second])]);
  }
}

async function dismissExceptions(
  exceptionRepo: IFutureCommitmentExceptionRepository,
  exceptions: readonly FutureCommitmentException[],
  reason: string,
  correlationId: string,
): Promise<void> {
  await mapSequentially(exceptions, async (exception) => {
    exception.dismissAutomatically(reason, correlationId);
    await exceptionRepo.save(exception);
  });
}

// The single place a cancel or reject persists and frees a booking's resources. The caller has
// already applied booking.cancel() / booking.reject() in memory. Must run inside the caller's own
// txManager.run().
export async function saveTerminalBookingsInTransaction(
  deps: TerminalBookingDeps,
  params: SaveTerminalBookingsParams,
): Promise<void> {
  const { tenantId, bookings, correlationId, excludeExceptionIds = [] } = params;
  await lockOccupiedResources(deps, tenantId, bookings);
  const open = await deps.exceptionRepo.findOpenByAffectedForUpdate(
    tenantId,
    'BOOKING',
    bookings.map((booking) => booking.id),
  );
  await mapSequentially(bookings, (booking) => deps.bookingRepo.save(booking));
  await releaseBookingOccupancy(deps.occupancyRepo, tenantId, lineIdsOf(bookings));
  await dismissExceptions(
    deps.exceptionRepo,
    open.filter((exception) => !excludeExceptionIds.includes(exception.id)),
    BOOKING_NO_LONGER_ACTIVE,
    correlationId,
  );
}

// Whether an entry of each source stops being relevant once the booking no longer occupies the
// source resource. A new source type has to be added here: the compiler rejects the table until it
// is. A value read from the database that is not a known type has no entry and is left open.
const ENDS_WHEN_SOURCE_RESOURCE_IS_FREE: Record<FutureCommitmentExceptionSourceType, boolean> = {
  RESOURCE_DEACTIVATION: true,
};

// After an approval or a reschedule moved the booking's occupancy: an entry whose source resource
// the booking no longer occupies is obsolete; one it still occupies stays open. `exceptions` are
// the booking's open entries, locked by the caller before the booking was saved.
export async function dismissStaleExceptionsAfterMove(
  deps: StaleExceptionDeps,
  params: DismissStaleExceptionsParams,
): Promise<void> {
  const { tenantId, booking, exceptions, correlationId, excludeExceptionIds = [] } = params;
  if (exceptions.length === 0) return;
  const occupied = await occupiedResourceIds(deps.occupancyRepo, tenantId, [booking]);
  const stale = exceptions.filter(
    (exception) =>
      ENDS_WHEN_SOURCE_RESOURCE_IS_FREE[exception.sourceType] &&
      !occupied.has(exception.sourceId) &&
      !excludeExceptionIds.includes(exception.id),
  );
  await dismissExceptions(deps.exceptionRepo, stale, RESOURCE_NO_LONGER_USED, correlationId);
}
