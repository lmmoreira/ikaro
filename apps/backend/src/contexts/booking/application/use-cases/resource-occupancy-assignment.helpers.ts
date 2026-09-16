import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { ResourceOccupancyLockState } from '../../infrastructure/entities/resource-occupancy.entity';
import { ResolvedLineCandidates } from './resource-occupancy.helpers';

// A request-time HOLD for a degenerate (LOCATION-fallback) service downgrades to REQUESTED,
// which the exclusion constraint's WHERE clause excludes — concurrent PENDING requests for the
// same popular degenerate slot stay allowed, matching today's byte-identical car-wash behavior.
// COMMITTED is never downgraded — approval-time exclusivity applies to every service (it's what
// the old tenant-wide EX_booking_bookings_approved_slot constraint already enforced pre-M22).
// REQUESTED carries no hold_expires_at (CHK_booking_resource_occupancy_hold_expiry requires NULL,
// same as COMMITTED) — it's never swept by a HOLD-expiry GC, only replaced on approval/terminal
// transition like any other occupancy row.
interface EffectiveLock {
  lockState: ResourceOccupancyLockState;
  holdExpiresAt: Date | null;
}

function effectiveLock(
  requested: ResourceOccupancyLockState,
  holdExpiresAt: Date | null,
  isDegenerate: boolean,
): EffectiveLock {
  if (requested === 'HOLD' && isDegenerate) {
    return { lockState: 'REQUESTED', holdExpiresAt: null };
  }
  return { lockState: requested, holdExpiresAt };
}

// Inserts booking_line_resource_assignments + resource_occupancy rows for every resolved line.
export async function assignBookingLinesOccupancy(
  occupancyRepo: IResourceOccupancyRepository,
  candidatesByLine: Map<string, ResolvedLineCandidates>,
  tenantId: string,
  lockState: ResourceOccupancyLockState,
  holdExpiresAt: Date | null,
): Promise<void> {
  for (const [bookingLineId, { candidates, isDegenerate }] of candidatesByLine) {
    const effective = effectiveLock(lockState, holdExpiresAt, isDegenerate);
    await occupancyRepo.assign(
      tenantId,
      bookingLineId,
      candidates,
      effective.lockState,
      effective.holdExpiresAt,
    );
  }
}

// Releases every existing occupancy row for the given lines, then re-assigns fresh ones at their
// newly-resolved window — used when an already-committed booking's window changes (reschedule, or
// approval with a scheduledAt override). Never used for the initial HOLD insert (assign directly).
export async function moveBookingLinesOccupancy(
  occupancyRepo: IResourceOccupancyRepository,
  candidatesByLine: Map<string, ResolvedLineCandidates>,
  tenantId: string,
  lockState: ResourceOccupancyLockState,
  holdExpiresAt: Date | null,
): Promise<void> {
  await occupancyRepo.release(tenantId, [...candidatesByLine.keys()]);
  await assignBookingLinesOccupancy(
    occupancyRepo,
    candidatesByLine,
    tenantId,
    lockState,
    holdExpiresAt,
  );
}

// Releases every occupancy row for the given booking's lines outright — no replacement. Used by
// reject/cancel (the booking's terminal transition means the resource is free again immediately,
// not just after the 90-day GC sweep).
export async function releaseBookingOccupancy(
  occupancyRepo: IResourceOccupancyRepository,
  tenantId: string,
  bookingLineIds: string[],
): Promise<void> {
  await occupancyRepo.release(tenantId, bookingLineIds);
}
