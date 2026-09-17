import { ResourceType } from '../../domain/resource.types';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';

export const RESOURCE_OCCUPANCY_REPOSITORY = Symbol('IResourceOccupancyRepository');

export interface ResourceOccupancyWindow {
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ResourceOccupancyCandidate extends ResourceOccupancyWindow {
  resourceType: ResourceType;
  resourceName: string;
  legIndex: number | null;
  quantityPosition: number | null;
}

// Internal, booking-context-local write-path port for the resource_occupancy/
// booking_line_resource_assignments pair (docs/13-DATABASE_SCHEMA.md). Distinct from the public,
// cross-context IBookingAvailabilityPort (read-only, availability computation) — this port is
// consumed only by booking's own creation/approval/reschedule/reject/cancel use cases and
// BookingSlotConflictService.
export interface IResourceOccupancyRepository {
  // Resource ids among `candidates` that already have a conflicting HOLD/COMMITTED row for their
  // own window. Empty result = every candidate is free. `excludeBookingLineIds`, when set, ignores
  // occupancy rows belonging to those exact lines (a booking's own existing HOLD, at an
  // approval-recheck or reschedule re-check) — must be called from inside an active transaction,
  // same contract as ITenantLockPort.
  findConflictingResourceIds(
    tenantId: string,
    candidates: ResourceOccupancyWindow[],
    excludeBookingLineIds?: string[],
  ): Promise<string[]>;

  // Inserts one resource_occupancy row per candidate, inside the caller's active transaction —
  // each row's booking_line_resource_assignments row is upserted (reused when the same
  // (line, resource, leg, quantity) tuple already exists, e.g. a reschedule that re-resolves to
  // the same resource), never inserted a second time, since that table is the immutable
  // business/audit record (docs/13-DATABASE_SCHEMA.md) and is never deleted by release() below.
  // The GIST exclusion constraint is the authoritative backstop (docs/ENGINEERING_RULES.md §
  // Cross-row invariants) — a genuine race surfaces as a BookingSlotUnavailableError from this
  // call, not a silent double-booking.
  assign(
    tenantId: string,
    bookingLineId: string,
    candidates: ResourceOccupancyCandidate[],
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void>;

  // Deletes every resource_occupancy row belonging to the given booking lines (reject/cancel
  // release, or the "delete" half of a reschedule's move) — never touches
  // booking_line_resource_assignments, the immutable audit record.
  release(tenantId: string, bookingLineIds: string[]): Promise<void>;
}
