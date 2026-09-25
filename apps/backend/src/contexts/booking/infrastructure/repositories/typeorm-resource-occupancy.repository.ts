import { Injectable } from '@nestjs/common';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  IResourceOccupancyRepository,
  ResourceLineAssignment,
  ResourceOccupancyCandidate,
  ResourceOccupancyWindow,
} from '../../application/ports/resource-occupancy-repository.port';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { rethrowOccupancyInsertError } from './typeorm-resource-occupancy.persistence-errors';
import {
  buildOccupancyRows,
  insertOccupancyRows,
  upsertBookingLineResourceAssignments,
} from './typeorm-resource-occupancy.write-queries';

interface ConflictRow {
  resource_id: string;
}

interface WorkloadCountRow {
  resource_id: string;
  count: string;
}

interface AssignmentByLineRow {
  booking_line_id: string;
  resource_id: string;
  resource_type: ResourceLineAssignment['resourceType'];
  leg_index: number | null;
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
      const assignmentIds = await upsertBookingLineResourceAssignments(
        manager,
        tenantId,
        bookingLineId,
        candidates,
        now,
      );
      const rows = buildOccupancyRows(candidates, {
        tenantId,
        assignmentIds,
        lockState,
        holdExpiresAt,
        now,
      });
      await insertOccupancyRows(manager, rows);
    } catch (err) {
      rethrowOccupancyInsertError(err);
    }
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

  // TD40 Story 2: single set-based DELETE, no tenant_id predicate (cross-tenant retention sweep —
  // relies on the standalone ends_at index added alongside this method, not the tenant-led
  // composite index every other query on this table can seek). A plain cutoff predicate, no
  // correlated subquery, so — unlike this class's other methods — the query-builder form applies
  // directly via EntityManager.createQueryBuilder() (no injected Repository<T> needed).
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const manager = this.requireActiveManager();
    const result = await manager
      .createQueryBuilder()
      .delete()
      .from(ResourceOccupancyEntity)
      .where('ends_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  // AUTO_ANY tie-break (UC-063 A1, M23-S01) — same HOLD/COMMITTED lock-state filter and tstzrange
  // overlap operator as findConflictingResourceIds above, grouped/counted per resource instead of
  // just existence-checked. excludeBookingLineIds mirrors findConflictingResourceIds' own
  // self-exclusion LEFT JOIN — approve-booking/reschedule-booking's fresh AUTO_ANY re-resolution
  // must never count the booking's own existing HOLD/COMMITTED row as workload against itself.
  async countActiveByResource(
    tenantId: string,
    resourceIds: string[],
    from: Date,
    to: Date,
    excludeBookingLineIds?: string[],
  ): Promise<Map<string, number>> {
    if (resourceIds.length === 0) return new Map();
    const manager = this.requireActiveManager();
    const rows: WorkloadCountRow[] = await manager.query(
      `
      SELECT ro.resource_id, COUNT(*)::text AS count
      FROM booking.resource_occupancy ro
      LEFT JOIN booking.booking_line_resource_assignments bla
        ON bla.tenant_id = ro.tenant_id AND bla.id = ro.booking_line_resource_assignment_id
      WHERE ro.tenant_id = $1
        AND ro.resource_id = ANY($2::uuid[])
        AND ro.lock_state IN ('HOLD', 'COMMITTED')
        AND tstzrange(ro.starts_at, ro.ends_at, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
        AND (
          $5::uuid[] IS NULL
          OR bla.booking_line_id IS NULL
          OR NOT (bla.booking_line_id = ANY($5::uuid[]))
        )
      GROUP BY ro.resource_id
      `,
      [tenantId, resourceIds, from, to, excludeBookingLineIds ?? null],
    );
    return new Map(rows.map((row) => [row.resource_id, Number(row.count)]));
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
  async findAssignmentsByBookingLines(
    tenantId: string,
    bookingLineIds: string[],
  ): Promise<ResourceLineAssignment[]> {
    if (bookingLineIds.length === 0) return [];
    const manager = this.requireActiveManager();
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

  private requireActiveManager() {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('IResourceOccupancyRepository methods require an active transaction');
    }
    return manager;
  }
}
