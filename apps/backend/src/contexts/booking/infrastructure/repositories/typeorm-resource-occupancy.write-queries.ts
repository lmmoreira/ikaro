import { EntityManager } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  BookingLineOccupancyAssignment,
  ResourceOccupancyCandidate,
} from '../../application/ports/resource-occupancy-repository.port';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';

// Split out of typeorm-resource-occupancy.repository.ts (docs/CODE_STANDARDS.md's file-length
// limit) — the write-path (upsert booking_line_resource_assignments, then insert
// resource_occupancy) called by that class's assign(). Free functions, not class methods, since
// none of them need `this` beyond the caller-supplied EntityManager.

interface AssignmentRow {
  id: string;
  resource_id: string;
  leg_index: number | null;
  quantity_position: number | null;
}

// Null-safe tuple key, matching the null-safe UNIQUE index on booking_line_resource_assignments
// (COALESCE(leg_index, -1), COALESCE(quantity_position, -1)) — used to map a batched upsert's
// result rows (arbitrary UNION ALL order) back to the candidate that produced each one.
function occupancyKey(
  resourceId: string,
  legIndex: number | null,
  quantityPosition: number | null,
): string {
  return `${resourceId}|${legIndex ?? -1}|${quantityPosition ?? -1}`;
}

// booking_line_resource_assignments is the immutable business/audit record
// (docs/13-DATABASE_SCHEMA.md) — release() never deletes it, so re-resolving the same
// (line, resource, leg, quantity) tuple on a reschedule/re-approval must reuse the existing row
// instead of violating its null-safe unique index. True ON CONFLICT DO NOTHING can't RETURNING
// the pre-existing row, so the insert attempt is unioned with a fallback lookup — batched across
// every candidate in one round trip (TD40 Story 1) via the same unnest-into-a-CTE technique
// findConflictingResourceIds uses. The fallback SELECT's plain table scan runs against this
// statement's initial snapshot, so it naturally excludes whatever `ins` just inserted in the same
// statement — no extra de-duplication needed between the two UNION ALL arms.
const UPSERT_ASSIGNMENTS_SQL = `
  WITH input AS (
    SELECT * FROM unnest($1::uuid[], $3::uuid[], $4::varchar[], $5::int[], $6::int[], $7::varchar[])
      AS c(new_id, resource_id, resource_type, leg_index, quantity_position, resource_name)
  ),
  ins AS (
    INSERT INTO booking.booking_line_resource_assignments
      (id, tenant_id, booking_line_id, resource_id, resource_type, leg_index,
       quantity_position, resource_name_at_assignment, assigned_at)
    SELECT new_id, $2, $8, resource_id, resource_type, leg_index, quantity_position, resource_name, $9
    FROM input
    ON CONFLICT (tenant_id, booking_line_id, resource_id, COALESCE(leg_index, -1), COALESCE(quantity_position, -1))
    DO NOTHING
    RETURNING id, resource_id, leg_index, quantity_position
  )
  SELECT id, resource_id, leg_index, quantity_position FROM ins
  UNION ALL
  SELECT a.id, a.resource_id, a.leg_index, a.quantity_position
  FROM booking.booking_line_resource_assignments a
  JOIN input i
    ON a.resource_id = i.resource_id
    AND COALESCE(a.leg_index, -1) = COALESCE(i.leg_index, -1)
    AND COALESCE(a.quantity_position, -1) = COALESCE(i.quantity_position, -1)
  WHERE a.tenant_id = $2 AND a.booking_line_id = $8
`;

function buildUpsertAssignmentsParams(
  tenantId: string,
  bookingLineId: string,
  candidates: ResourceOccupancyCandidate[],
  now: Date,
): unknown[] {
  return [
    candidates.map(() => uuidv7()),
    tenantId,
    candidates.map((c) => c.resourceId),
    candidates.map((c) => c.resourceType),
    candidates.map((c) => c.legIndex),
    candidates.map((c) => c.quantityPosition),
    candidates.map((c) => c.resourceName),
    bookingLineId,
    now,
  ];
}

function toAssignmentIdMap(rows: AssignmentRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(occupancyKey(row.resource_id, row.leg_index, row.quantity_position), row.id);
  }
  return map;
}

export async function upsertBookingLineResourceAssignments(
  manager: EntityManager,
  tenantId: string,
  bookingLineId: string,
  candidates: ResourceOccupancyCandidate[],
  now: Date,
): Promise<Map<string, string>> {
  const rows: AssignmentRow[] = await manager.query(
    UPSERT_ASSIGNMENTS_SQL,
    buildUpsertAssignmentsParams(tenantId, bookingLineId, candidates, now),
  );
  return toAssignmentIdMap(rows);
}

interface OccupancyRowContext {
  tenantId: string;
  assignmentIds: Map<string, string>;
  lockState: ResourceOccupancyLockState;
  holdExpiresAt: Date | null;
  now: Date;
}

function resolveAssignmentId(
  assignmentIds: Map<string, string>,
  candidate: ResourceOccupancyCandidate,
): string {
  const key = occupancyKey(candidate.resourceId, candidate.legIndex, candidate.quantityPosition);
  const assignmentId = assignmentIds.get(key);
  if (!assignmentId) {
    throw new Error(
      `resource_occupancy: batched upsert returned no assignment id for candidate ${key}`,
    );
  }
  return assignmentId;
}

export function buildOccupancyRows(
  candidates: ResourceOccupancyCandidate[],
  ctx: OccupancyRowContext,
): ResourceOccupancyEntity[] {
  return candidates.map((candidate) => ({
    id: uuidv7(),
    tenantId: ctx.tenantId,
    resourceId: candidate.resourceId,
    resourceType: candidate.resourceType,
    sourceType: 'BOOKING_LINE' as const,
    bookingLineResourceAssignmentId: resolveAssignmentId(ctx.assignmentIds, candidate),
    legIndex: candidate.legIndex,
    classSessionId: null,
    resourceNameAtAssignment: candidate.resourceName,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    lockState: ctx.lockState,
    holdExpiresAt: ctx.holdExpiresAt,
    createdAt: ctx.now,
  }));
}

// Every row of one insert goes in as one array per column, unnested server-side, so the statement
// binds a fixed 14 parameters however many rows there are — no PostgreSQL bound-parameter limit to
// chunk around, and one round trip whatever the candidate count (requiredQuantity has no upper
// bound, and a recurring term inserts one row per occurrence). The same unnest technique the
// assignment upsert above and the conflict checks use.
export const INSERT_OCCUPANCY_SQL = `
  INSERT INTO booking.resource_occupancy
    (id, tenant_id, resource_id, resource_type, source_type, booking_line_resource_assignment_id,
     leg_index, class_session_id, resource_name_at_assignment, starts_at, ends_at, lock_state,
     hold_expires_at, created_at)
  SELECT * FROM unnest(
    $1::uuid[], $2::uuid[], $3::uuid[], $4::varchar[], $5::varchar[], $6::uuid[], $7::int[],
    $8::uuid[], $9::varchar[], $10::timestamptz[], $11::timestamptz[], $12::varchar[],
    $13::timestamptz[], $14::timestamptz[]
  )
`;

export async function insertOccupancyRows(
  manager: EntityManager,
  rows: ResourceOccupancyEntity[],
): Promise<void> {
  if (rows.length === 0) return;
  await manager.query(INSERT_OCCUPANCY_SQL, [
    rows.map((row) => row.id),
    rows.map((row) => row.tenantId),
    rows.map((row) => row.resourceId),
    rows.map((row) => row.resourceType),
    rows.map((row) => row.sourceType),
    rows.map((row) => row.bookingLineResourceAssignmentId),
    rows.map((row) => row.legIndex),
    rows.map((row) => row.classSessionId),
    rows.map((row) => row.resourceNameAtAssignment),
    rows.map((row) => row.startsAt),
    rows.map((row) => row.endsAt),
    rows.map((row) => row.lockState),
    rows.map((row) => row.holdExpiresAt),
    rows.map((row) => row.createdAt),
  ]);
}

// The assignment rows of brand-new lines: a plain INSERT, unlike UPSERT_ASSIGNMENTS_SQL above — a
// new line has no row to conflict with. One array per column, like INSERT_OCCUPANCY_SQL.
export const INSERT_FRESH_ASSIGNMENTS_SQL = `
  INSERT INTO booking.booking_line_resource_assignments
    (id, tenant_id, booking_line_id, resource_id, resource_type, leg_index, quantity_position,
     resource_name_at_assignment, assigned_at)
  SELECT u.id, $2, u.booking_line_id, u.resource_id, u.resource_type, u.leg_index,
         u.quantity_position, u.resource_name, $9
  FROM unnest($1::uuid[], $3::uuid[], $4::uuid[], $5::varchar[], $6::int[], $7::int[], $8::varchar[])
    AS u(id, booking_line_id, resource_id, resource_type, leg_index, quantity_position, resource_name)
`;

interface FreshPair {
  bookingLineId: string;
  candidate: ResourceOccupancyCandidate;
  assignmentId: string;
}

function toFreshOccupancyRow(
  pair: FreshPair,
  ctx: Omit<OccupancyRowContext, 'assignmentIds'>,
): ResourceOccupancyEntity {
  return {
    id: uuidv7(),
    tenantId: ctx.tenantId,
    resourceId: pair.candidate.resourceId,
    resourceType: pair.candidate.resourceType,
    sourceType: 'BOOKING_LINE' as const,
    bookingLineResourceAssignmentId: pair.assignmentId,
    legIndex: pair.candidate.legIndex,
    classSessionId: null,
    resourceNameAtAssignment: pair.candidate.resourceName,
    startsAt: pair.candidate.startsAt,
    endsAt: pair.candidate.endsAt,
    lockState: ctx.lockState,
    holdExpiresAt: ctx.holdExpiresAt,
    createdAt: ctx.now,
  };
}

// assign() for many brand-new lines (M23-S05): every (line, candidate) pair gets a fresh
// assignment row and the occupancy row that points at it — two multi-row INSERTs, however many
// lines. Nothing is upserted because a new line has no assignment rows to reuse.
export async function insertFreshAssignmentsAndOccupancy(
  manager: EntityManager,
  params: {
    tenantId: string;
    assignments: BookingLineOccupancyAssignment[];
    lockState: ResourceOccupancyLockState;
    holdExpiresAt: Date | null;
  },
): Promise<void> {
  const { tenantId, lockState, holdExpiresAt } = params;
  const now = new Date();
  const pairs: FreshPair[] = params.assignments.flatMap(({ bookingLineId, candidates }) =>
    candidates.map((candidate) => ({ bookingLineId, candidate, assignmentId: uuidv7() })),
  );
  if (pairs.length === 0) return;

  await manager.query(INSERT_FRESH_ASSIGNMENTS_SQL, [
    pairs.map((pair) => pair.assignmentId),
    tenantId,
    pairs.map((pair) => pair.bookingLineId),
    pairs.map((pair) => pair.candidate.resourceId),
    pairs.map((pair) => pair.candidate.resourceType),
    pairs.map((pair) => pair.candidate.legIndex),
    pairs.map((pair) => pair.candidate.quantityPosition),
    pairs.map((pair) => pair.candidate.resourceName),
    now,
  ]);
  await insertOccupancyRows(
    manager,
    pairs.map((pair) => toFreshOccupancyRow(pair, { tenantId, lockState, holdExpiresAt, now })),
  );
}
