import { EntityManager } from 'typeorm';
import {
  BookingLineOccupancyRow,
  ResourceBookingImpact,
  ResourceLineAssignment,
  ResourceOccupancyWindow,
} from '../../application/ports/resource-occupancy-repository.port';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';

// Split out of typeorm-resource-occupancy.repository.ts (docs/CODE_STANDARDS.md's file-length
// limit) — the live-projection reads over resource_occupancy joined to its assignments, used by
// booking approval/reschedule (M23-S01) and the future-commitment worklist (M23-S08). Free
// functions over the caller-supplied active EntityManager, called by that class's own methods.

interface AssignmentByLineRow {
  booking_line_id: string;
  resource_id: string;
  resource_type: ResourceLineAssignment['resourceType'];
  leg_index: number | null;
}

interface BookingImpactRow {
  booking_id: string;
  booking_line_id: string;
  resource_type: ResourceBookingImpact['resourceType'];
  leg_index: number | null;
  starts_at: Date;
  ends_at: Date;
}

interface OccupancyByLineRow {
  booking_line_id: string;
  resource_id: string;
  resource_type: BookingLineOccupancyRow['resourceType'];
  resource_name_at_assignment: string;
  leg_index: number | null;
  quantity_position: number | null;
  starts_at: Date;
  ends_at: Date;
  lock_state: ResourceOccupancyLockState;
  hold_expires_at: Date | null;
}

// UC-073 — one row per live occupancy of the resource, joined up to the owning booking through the
// assignment and line tables (tenant-scoped on every hop).
export async function queryFutureBookingImpactsByResource(
  manager: EntityManager,
  tenantId: string,
  resourceId: string,
  after: Date,
): Promise<ResourceBookingImpact[]> {
  const rows: BookingImpactRow[] = await manager.query(
    `
    SELECT bl.booking_id, bla.booking_line_id, ro.resource_type, ro.leg_index,
           ro.starts_at, ro.ends_at
    FROM booking.resource_occupancy ro
    JOIN booking.booking_line_resource_assignments bla
      ON bla.tenant_id = ro.tenant_id AND bla.id = ro.booking_line_resource_assignment_id
    JOIN booking.booking_lines bl
      ON bl.tenant_id = bla.tenant_id AND bl.line_id = bla.booking_line_id
    WHERE ro.tenant_id = $1
      AND ro.resource_id = $2
      AND ro.source_type = 'BOOKING_LINE'
      AND ro.lock_state IN ('HOLD', 'COMMITTED')
      AND ro.ends_at > $3
    ORDER BY ro.starts_at, bl.booking_id, bla.booking_line_id, ro.leg_index NULLS FIRST
    `,
    [tenantId, resourceId, after],
  );
  return rows.map((row) => ({
    bookingId: row.booking_id,
    bookingLineId: row.booking_line_id,
    resourceType: row.resource_type,
    legIndex: row.leg_index,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}

// UC-077 — the live rows of the given lines (never the append-only audit table) with everything
// needed to recreate them elsewhere at the exact same window.
export async function queryOccupancyByBookingLines(
  manager: EntityManager,
  tenantId: string,
  bookingLineIds: string[],
): Promise<BookingLineOccupancyRow[]> {
  const rows: OccupancyByLineRow[] = await manager.query(
    `
    SELECT bla.booking_line_id, ro.resource_id, ro.resource_type,
           ro.resource_name_at_assignment, ro.leg_index, bla.quantity_position,
           ro.starts_at, ro.ends_at, ro.lock_state, ro.hold_expires_at
    FROM booking.resource_occupancy ro
    JOIN booking.booking_line_resource_assignments bla
      ON bla.tenant_id = ro.tenant_id AND bla.id = ro.booking_line_resource_assignment_id
    WHERE ro.tenant_id = $1 AND bla.booking_line_id = ANY($2::uuid[])
    ORDER BY array_position($2::uuid[], bla.booking_line_id), ro.starts_at,
             bla.quantity_position ASC NULLS FIRST
    `,
    [tenantId, bookingLineIds],
  );
  return rows.map((row) => ({
    bookingLineId: row.booking_line_id,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    resourceName: row.resource_name_at_assignment,
    legIndex: row.leg_index,
    quantityPosition: row.quantity_position,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    lockState: row.lock_state,
    holdExpiresAt: row.hold_expires_at,
  }));
}

// Approval/reschedule re-resolution replay (M23-S01 story-discovery) — reads the LIVE
// resource_occupancy projection (joined to booking_line_resource_assignments for
// resourceType/legIndex), not the booking_line_resource_assignments audit table directly. That
// table is append-only and never deletes a superseded row on reassignment, so a booking
// rescheduled to a different resource more than once would otherwise return stale,
// no-longer-occupying resource ids alongside the current one. Ordered primarily by each row's
// own booking_line_id's position within the caller-supplied bookingLineIds array — the same
// order resolveBookingLinesResourceCandidates() re-iterates lines in — so two lines booking the
// same duplicated service (docs/14-API_CONTRACTS.md) group their own assignments together, in
// resolution order, rather than interleaving arbitrarily (Postgres gives no defined secondary
// order among rows tied on quantity_position alone, which is NULL for every single-unit
// requirement — the common case). quantity_position is still the secondary tiebreaker within one
// line's own multi-unit requirement, preserving its original positional assignment.
export async function queryAssignmentsByBookingLines(
  manager: EntityManager,
  tenantId: string,
  bookingLineIds: string[],
): Promise<ResourceLineAssignment[]> {
  const rows: AssignmentByLineRow[] = await manager.query(
    `
    SELECT bla.booking_line_id, ro.resource_id, ro.resource_type, ro.leg_index
    FROM booking.resource_occupancy ro
    JOIN booking.booking_line_resource_assignments bla
      ON bla.tenant_id = ro.tenant_id AND bla.id = ro.booking_line_resource_assignment_id
    WHERE ro.tenant_id = $1 AND bla.booking_line_id = ANY($2::uuid[])
    ORDER BY array_position($2::uuid[], bla.booking_line_id), bla.quantity_position ASC NULLS FIRST
    `,
    [tenantId, bookingLineIds],
  );
  return rows.map((row) => ({
    bookingLineId: row.booking_line_id,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    legIndex: row.leg_index,
  }));
}

interface ActiveWindowRow {
  resource_id: string;
  starts_at: Date;
  ends_at: Date;
}

// The HOLD/COMMITTED windows of the given resources overlapping [from, to), one row each — see
// IResourceOccupancyRepository.findActiveWindows().
export async function queryActiveWindows(
  manager: EntityManager,
  params: { tenantId: string; resourceIds: string[]; from: Date; to: Date },
): Promise<ResourceOccupancyWindow[]> {
  const rows: ActiveWindowRow[] = await manager.query(
    `
    SELECT ro.resource_id, ro.starts_at, ro.ends_at
    FROM booking.resource_occupancy ro
    WHERE ro.tenant_id = $1
      AND ro.resource_id = ANY($2::uuid[])
      AND ro.lock_state IN ('HOLD', 'COMMITTED')
      AND tstzrange(ro.starts_at, ro.ends_at, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
    `,
    [params.tenantId, params.resourceIds, params.from, params.to],
  );
  return rows.map((row) => ({
    resourceId: row.resource_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}
