import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyCandidate,
  ResourceOccupancyWindow,
} from '../../application/ports/resource-occupancy-repository.port';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { rethrowOccupancyInsertError } from './typeorm-resource-occupancy.persistence-errors';

interface ConflictRow {
  resource_id: string;
}

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
// findConflictingResourceIds uses below. The fallback SELECT's plain table scan runs against this
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

@Injectable()
export class TypeOrmResourceOccupancyRepository implements IResourceOccupancyRepository {
  // Window-overlap is evaluated in SQL (tstzrange &&, same operator the GIST exclusion
  // constraint itself uses) rather than fetched-then-filtered-in-JS — each candidate can have a
  // different window, so the candidate list is unnested into a value set first and joined per
  // (resource_id, window) pair, letting Postgres use the GIST index instead of a full scan of
  // every retained HOLD/COMMITTED row for the resource.
  async findConflictingResourceIds(
    tenantId: string,
    candidates: ResourceOccupancyWindow[],
    excludeBookingLineIds?: string[],
  ): Promise<string[]> {
    if (candidates.length === 0) return [];
    const manager = this.requireActiveManager();

    const rows: ConflictRow[] = await manager.query(
      `
      WITH candidates AS (
        SELECT * FROM unnest($2::uuid[], $3::timestamptz[], $4::timestamptz[])
          AS c(resource_id, starts_at, ends_at)
      )
      SELECT DISTINCT c.resource_id
      FROM candidates c
      JOIN booking.resource_occupancy ro
        ON ro.tenant_id = $1
        AND ro.resource_id = c.resource_id
        AND ro.lock_state IN ('HOLD', 'COMMITTED')
        AND tstzrange(ro.starts_at, ro.ends_at, '[)') && tstzrange(c.starts_at, c.ends_at, '[)')
      LEFT JOIN booking.booking_line_resource_assignments bla
        ON bla.tenant_id = ro.tenant_id AND bla.id = ro.booking_line_resource_assignment_id
      WHERE (
        $5::uuid[] IS NULL
        OR bla.booking_line_id IS NULL
        OR NOT (bla.booking_line_id = ANY($5::uuid[]))
      )
      `,
      [
        tenantId,
        candidates.map((c) => c.resourceId),
        candidates.map((c) => c.startsAt),
        candidates.map((c) => c.endsAt),
        excludeBookingLineIds ?? null,
      ],
    );

    return rows.map((row) => row.resource_id);
  }

  async assign(
    tenantId: string,
    bookingLineId: string,
    candidates: ResourceOccupancyCandidate[],
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void> {
    if (candidates.length === 0) return;
    const manager = this.requireActiveManager();
    const now = new Date();

    try {
      const assignmentIds = await this.upsertAssignments(
        manager,
        tenantId,
        bookingLineId,
        candidates,
        now,
      );
      await manager.insert(
        ResourceOccupancyEntity,
        this.buildOccupancyRows(candidates, {
          tenantId,
          assignmentIds,
          lockState,
          holdExpiresAt,
          now,
        }),
      );
    } catch (err) {
      rethrowOccupancyInsertError(err);
    }
  }

  private buildOccupancyRows(
    candidates: ResourceOccupancyCandidate[],
    ctx: {
      tenantId: string;
      assignmentIds: Map<string, string>;
      lockState: ResourceOccupancyLockState;
      holdExpiresAt: Date | null;
      now: Date;
    },
  ) {
    return candidates.map((candidate) => ({
      id: uuidv7(),
      tenantId: ctx.tenantId,
      resourceId: candidate.resourceId,
      resourceType: candidate.resourceType,
      sourceType: 'BOOKING_LINE' as const,
      bookingLineResourceAssignmentId: this.resolveAssignmentId(ctx.assignmentIds, candidate),
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

  private resolveAssignmentId(
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

  private async upsertAssignments(
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

  // Deletes only the short-lived lock rows — booking_line_resource_assignments is the immutable
  // business/audit record (docs/13-DATABASE_SCHEMA.md § booking.booking_line_resource_assignments,
  // "Resource utilization / professional-history BI queries") and is never deleted here, including
  // on reject/cancel: a cancelled booking's resolved-resource history stays queryable.
  async release(tenantId: string, bookingLineIds: string[]): Promise<void> {
    if (bookingLineIds.length === 0) return;
    const manager = this.requireActiveManager();
    await manager.query(
      `
      DELETE FROM booking.resource_occupancy
      WHERE tenant_id = $1
        AND booking_line_resource_assignment_id IN (
          SELECT id FROM booking.booking_line_resource_assignments
          WHERE tenant_id = $1 AND booking_line_id = ANY($2::uuid[])
        )
      `,
      [tenantId, bookingLineIds],
    );
  }

  private requireActiveManager() {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('IResourceOccupancyRepository methods require an active transaction');
    }
    return manager;
  }
}
