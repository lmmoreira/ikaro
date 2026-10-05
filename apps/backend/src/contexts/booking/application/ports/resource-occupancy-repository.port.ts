import { ResourceGapSource } from '../../domain/resource-gap-source';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';
import { ResourceRequirementSelectionMode } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';

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
  // Why endsAt extends past the line's own end (M18-S10) — persisted so the manager's schedule
  // can say who is held and why. Both null = no gap. Required (never optional) so a builder that
  // forgets them fails to compile instead of silently dropping the origin.
  gapMinutes: number | null;
  gapSource: ResourceGapSource | null;
  // Carried through from the originating ResourceRequirement — response-shaping only (M23-S01):
  // toBookingResult() reveals a flat AUTO_ANY candidate's name (UC-063) but never an
  // AUTO_FUNGIBLE_POOL one (UC-062); a legged candidate's itinerary entry is always revealed
  // regardless of this field (UC-065's schedule disclosure isn't selectionMode-conditional).
  // Ignored by persistence — resource_occupancy/booking_line_resource_assignments don't store it,
  // it's derivable from the service config at any time.
  selectionMode: ResourceRequirementSelectionMode;
  // True only for a flat (non-legged) candidate whose own service has >= 2 resourceRequirements —
  // a genuine bundle (UC-064), matching the story's own definition. Never true for a legged
  // candidate (legs use legIndex for their own conflict classification) or for a flat single-
  // requirement service. Drives BookingSlotConflictService's error classification: the flattened
  // candidate list alone can't distinguish a true bundle from an ordinary multi-service basket, so
  // each candidate carries the verdict from its own line's requirement count instead of the
  // classifier re-deriving it from candidate count across the whole booking.
  isBundleMember: boolean;
}

// One booking line and the occupancy candidates it resolved to — the unit assignMany() takes.
export interface BookingLineOccupancyAssignment {
  bookingLineId: string;
  candidates: ResourceOccupancyCandidate[];
}

// Internal, booking-context-local write-path port for the resource_occupancy/
// booking_line_resource_assignments pair (docs/13-DATABASE_SCHEMA.md). Distinct from the public,
// cross-context IBookingAvailabilityPort (read-only, availability computation) — this port is
// consumed by booking's own creation/approval/reschedule/reject/cancel use cases,
// BookingSlotConflictService, and ResourceOccupancyRetentionPurgeJob (TD40 Story 2).
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

  // Same overlap check as findConflictingResourceIds, but reports which of the given windows
  // conflict instead of collapsing to distinct resource ids — for a caller checking many windows
  // of the same resource(s) in one query (a recurring pattern's occurrences) that must tell which
  // occurrence collided. Returns a subset of `windows`, in input order. Same active-transaction
  // and excludeBookingLineIds contract.
  findConflictingWindows(
    tenantId: string,
    windows: ResourceOccupancyWindow[],
    excludeBookingLineIds?: string[],
  ): Promise<ResourceOccupancyWindow[]>;

  // Inserts one resource_occupancy row per candidate, inside the caller's active transaction —
  // each row's booking_line_resource_assignments row is upserted (reused when the same
  // (line, resource, leg, quantity) tuple already exists, e.g. a reschedule that re-resolves to
  // the same resource), never inserted a second time, since that table is the immutable
  // business/audit record (docs/13-DATABASE_SCHEMA.md) and is never deleted by release() below.
  // The GIST exclusion constraint is the authoritative backstop (docs/ENGINEERING_RULES_BACKEND.md §
  // Cross-row invariants) — a genuine race surfaces as a BookingSlotUnavailableError from this
  // call, not a silent double-booking.
  assign(
    tenantId: string,
    bookingLineId: string,
    candidates: ResourceOccupancyCandidate[],
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void>;

  // assign() for many brand-new booking lines at once (a recurring schedule's whole term, M23-S05)
  // — two statements in total (the assignment rows, then the occupancy rows), however many lines.
  // Only for lines that have no assignment rows yet, so nothing is upserted: the null-safe unique
  // index cannot already hold one of these tuples. Same active-transaction contract, and the
  // same exclusion-constraint backstop as assign(). Each statement unnests one array per column, so
  // it binds a fixed number of parameters whatever the batch size.
  assignMany(
    tenantId: string,
    assignments: BookingLineOccupancyAssignment[],
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void>;

  // Every HOLD/COMMITTED occupancy window of the given resources overlapping [from, to), in one
  // query — the batch counterpart of countActiveByResource for a caller that needs the per-day
  // workload of many days at once (M23-S05 planning a recurring term's AUTO_ANY picks).
  findActiveWindows(
    tenantId: string,
    resourceIds: string[],
    from: Date,
    to: Date,
  ): Promise<ResourceOccupancyWindow[]>;

  // Deletes every resource_occupancy row belonging to the given booking lines (reject/cancel
  // release, or the "delete" half of a reschedule's move) — never touches
  // booking_line_resource_assignments, the immutable audit record.
  release(tenantId: string, bookingLineIds: string[]): Promise<void>;

  // TD40 Story 2 retention purge — deletes every resource_occupancy row (any lock_state) whose
  // ends_at is before cutoff, across every tenant in one pass. Deliberately no tenantId param,
  // unlike every other method on this port: the table is documented as "safely
  // garbage-collectable after its window elapses" regardless of tenant, matching
  // IChatbotMessageRepository.deleteOlderThan()'s identical cross-tenant shape. Never touches
  // booking_line_resource_assignments, same invariant as release() above.
  deleteOlderThan(cutoff: Date): Promise<number>;

  // AUTO_ANY's least-loaded tie-break (UC-063 A1, M23-S01) — counts each candidate resource's own
  // HOLD/COMMITTED occupancy rows overlapping [from, to) (the tenant-local calendar day of the
  // booking being resolved). REQUESTED rows are excluded, same lock-state filter
  // findConflictingResourceIds uses — a degenerate-service REQUESTED row was never a real
  // commitment. Resources with zero occupancy in the window are simply absent from the returned
  // map (callers treat a missing key as 0), not an error. `excludeBookingLineIds`, when set,
  // ignores occupancy rows belonging to those exact lines — same self-exclusion shape as
  // findConflictingResourceIds, needed so approve-booking/reschedule-booking's fresh AUTO_ANY
  // re-resolution never counts the booking's own existing HOLD/COMMITTED row as workload against
  // itself.
  countActiveByResource(
    tenantId: string,
    resourceIds: string[],
    from: Date,
    to: Date,
    excludeBookingLineIds?: string[],
  ): Promise<Map<string, number>>;

  // Replays a booking's already-persisted, CURRENTLY-occupying resource choice(s) for a fresh
  // re-resolution (approve-booking / reschedule-booking's "resolve fresh every time" design,
  // M23-S01 story-discovery) — a CUSTOMER_CHOICE requirement has no HTTP request to re-derive a
  // selection from at approval/reschedule time. Reads via the live resource_occupancy projection
  // (joined to booking_line_resource_assignments for resourceType/legIndex), not the
  // booking_line_resource_assignments audit table directly — that table is append-only and never
  // deletes a superseded row, so a booking rescheduled to a different resource more than once
  // would otherwise return stale, no-longer-occupying resource ids alongside the current one.
  // Ordered by quantity_position so a multi-unit requirement's
  // resourceSelections array preserves its original positional assignment. AUTO_ANY/
  // AUTO_FUNGIBLE_POOL requirements ignore these entries (they always re-derive fresh) — returning
  // them anyway is harmless, not incorrect.
  findAssignmentsByBookingLines(
    tenantId: string,
    bookingLineIds: string[],
  ): Promise<ResourceLineAssignment[]>;

  // M23-S08 (UC-073) — every live occupancy row (BOOKING_LINE source, HOLD or COMMITTED — a
  // REQUESTED row was never a real commitment) on this resource whose window ends after `after`,
  // with the owning booking and line resolved. Which bookings still count (a terminal booking's
  // rows are normally released already) is the caller's decision, made against the bookings it
  // loads anyway. Same active-transaction contract as the other methods on this port.
  findFutureBookingImpactsByResource(
    tenantId: string,
    resourceId: string,
    after: Date,
  ): Promise<ResourceBookingImpact[]>;

  // M23-S08 (UC-077) — the live occupancy rows of the given booking lines with everything needed
  // to re-create them elsewhere at the exact same window (a targeted REASSIGN moves a row to
  // another resource without touching its time). Same live-projection source as
  // findAssignmentsByBookingLines, never the append-only audit table.
  findOccupancyByBookingLines(
    tenantId: string,
    bookingLineIds: string[],
  ): Promise<BookingLineOccupancyRow[]>;
}

export interface BookingLineOccupancyRow {
  bookingLineId: string;
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  legIndex: number | null;
  quantityPosition: number | null;
  startsAt: Date;
  endsAt: Date;
  lockState: ResourceOccupancyLockState;
  holdExpiresAt: Date | null;
  gapMinutes: number | null;
  gapSource: ResourceGapSource | null;
}

export interface ResourceBookingImpact {
  bookingId: string;
  bookingLineId: string;
  resourceType: ResourceType;
  legIndex: number | null;
  startsAt: Date;
  endsAt: Date;
}

export interface ResourceLineAssignment {
  bookingLineId: string;
  resourceId: string;
  resourceType: ResourceType;
  legIndex: number | null;
}
