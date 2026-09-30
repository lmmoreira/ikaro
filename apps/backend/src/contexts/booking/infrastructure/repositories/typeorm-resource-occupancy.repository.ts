import { Injectable } from '@nestjs/common';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  BookingLineOccupancyAssignment,
  BookingLineOccupancyRow,
  IResourceOccupancyRepository,
  ResourceBookingImpact,
  ResourceLineAssignment,
  ResourceOccupancyCandidate,
  ResourceOccupancyWindow,
} from '../../application/ports/resource-occupancy-repository.port';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { rethrowOccupancyInsertError } from './typeorm-resource-occupancy.persistence-errors';
import {
  queryActiveWindows,
  queryAssignmentsByBookingLines,
  queryFutureBookingImpactsByResource,
  queryOccupancyByBookingLines,
} from './typeorm-resource-occupancy.read-queries';
import {
  buildOccupancyRows,
  insertFreshAssignmentsAndOccupancy,
  insertOccupancyRows,
  upsertBookingLineResourceAssignments,
} from './typeorm-resource-occupancy.write-queries';

interface ConflictRow {
  position: string;
}

interface WorkloadCountRow {
  resource_id: string;
  count: string;
}

@Injectable()
export class TypeOrmResourceOccupancyRepository implements IResourceOccupancyRepository {
  async findConflictingResourceIds(
    tenantId: string,
    candidates: ResourceOccupancyWindow[],
    excludeBookingLineIds?: string[],
  ): Promise<string[]> {
    const conflicting = await this.findConflictingWindows(
      tenantId,
      candidates,
      excludeBookingLineIds,
    );
    return [...new Set(conflicting.map((window) => window.resourceId))];
  }

  // Window-overlap is evaluated in SQL (tstzrange &&, same operator the GIST exclusion
  // constraint itself uses) rather than fetched-then-filtered-in-JS — each window can differ, so
  // the list is unnested into a value set first and joined per (resource_id, window) pair,
  // letting Postgres use the GIST index instead of a full scan of every retained HOLD/COMMITTED
  // row for the resource. WITH ORDINALITY carries each input window's position through the join,
  // so a conflict maps back to exactly the window that caused it even when several windows share
  // a resource.
  async findConflictingWindows(
    tenantId: string,
    windows: ResourceOccupancyWindow[],
    excludeBookingLineIds?: string[],
  ): Promise<ResourceOccupancyWindow[]> {
    if (windows.length === 0) return [];
    const manager = this.requireActiveManager();

    const rows: ConflictRow[] = await manager.query(
      `
      WITH candidates AS (
        SELECT * FROM unnest($2::uuid[], $3::timestamptz[], $4::timestamptz[])
          WITH ORDINALITY AS c(resource_id, starts_at, ends_at, position)
      )
      SELECT DISTINCT c.position
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
      ORDER BY c.position
      `,
      [
        tenantId,
        windows.map((w) => w.resourceId),
        windows.map((w) => w.startsAt),
        windows.map((w) => w.endsAt),
        excludeBookingLineIds ?? null,
      ],
    );

    return rows.map((row) => windows[Number(row.position) - 1]);
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

  async assignMany(
    tenantId: string,
    assignments: BookingLineOccupancyAssignment[],
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void> {
    if (assignments.length === 0) return;
    const manager = this.requireActiveManager();
    try {
      await insertFreshAssignmentsAndOccupancy(manager, {
        tenantId,
        assignments,
        lockState,
        holdExpiresAt,
      });
    } catch (err) {
      rethrowOccupancyInsertError(err);
    }
  }

  async findActiveWindows(
    tenantId: string,
    resourceIds: string[],
    from: Date,
    to: Date,
  ): Promise<ResourceOccupancyWindow[]> {
    if (resourceIds.length === 0) return [];
    return queryActiveWindows(this.requireActiveManager(), { tenantId, resourceIds, from, to });
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

  // Approval/reschedule re-resolution replay (M23-S01) — see typeorm-resource-occupancy.read-queries.ts.
  async findAssignmentsByBookingLines(
    tenantId: string,
    bookingLineIds: string[],
  ): Promise<ResourceLineAssignment[]> {
    if (bookingLineIds.length === 0) return [];
    return queryAssignmentsByBookingLines(this.requireActiveManager(), tenantId, bookingLineIds);
  }

  // M23-S08 (UC-073) — see typeorm-resource-occupancy.read-queries.ts.
  async findFutureBookingImpactsByResource(
    tenantId: string,
    resourceId: string,
    after: Date,
  ): Promise<ResourceBookingImpact[]> {
    return queryFutureBookingImpactsByResource(
      this.requireActiveManager(),
      tenantId,
      resourceId,
      after,
    );
  }

  // M23-S08 (UC-077) — see typeorm-resource-occupancy.read-queries.ts.
  async findOccupancyByBookingLines(
    tenantId: string,
    bookingLineIds: string[],
  ): Promise<BookingLineOccupancyRow[]> {
    if (bookingLineIds.length === 0) return [];
    return queryOccupancyByBookingLines(this.requireActiveManager(), tenantId, bookingLineIds);
  }

  private requireActiveManager() {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('IResourceOccupancyRepository methods require an active transaction');
    }
    return manager;
  }
}
