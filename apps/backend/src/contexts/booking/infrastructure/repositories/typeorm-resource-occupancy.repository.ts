import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyCandidate,
  ResourceOccupancyWindow,
} from '../../application/ports/resource-occupancy-repository.port';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import {
  ResourceOccupancyEntity,
  ResourceOccupancyLockState,
} from '../entities/resource-occupancy.entity';
import { rethrowOccupancyInsertError } from './typeorm-resource-occupancy.persistence-errors';

interface ConflictRow {
  resource_id: string;
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

    try {
      for (const candidate of candidates) {
        await this.insertOne(manager, tenantId, bookingLineId, candidate, lockState, holdExpiresAt);
      }
    } catch (err) {
      rethrowOccupancyInsertError(err);
    }
  }

  private async insertOne(
    manager: EntityManager,
    tenantId: string,
    bookingLineId: string,
    candidate: ResourceOccupancyCandidate,
    lockState: ResourceOccupancyLockState,
    holdExpiresAt: Date | null,
  ): Promise<void> {
    const now = new Date();
    const assignmentId = uuidv7();
    await manager.insert(BookingLineResourceAssignmentEntity, {
      id: assignmentId,
      tenantId,
      bookingLineId,
      resourceId: candidate.resourceId,
      resourceType: candidate.resourceType,
      legIndex: candidate.legIndex,
      quantityPosition: candidate.quantityPosition,
      resourceNameAtAssignment: candidate.resourceName,
      assignedAt: now,
    });
    await manager.insert(ResourceOccupancyEntity, {
      id: uuidv7(),
      tenantId,
      resourceId: candidate.resourceId,
      resourceType: candidate.resourceType,
      sourceType: 'BOOKING_LINE',
      bookingLineResourceAssignmentId: assignmentId,
      legIndex: candidate.legIndex,
      classSessionId: null,
      resourceNameAtAssignment: candidate.resourceName,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      lockState,
      holdExpiresAt,
      createdAt: now,
    });
  }

  async commit(tenantId: string, bookingLineIds: string[]): Promise<void> {
    if (bookingLineIds.length === 0) return;
    const manager = this.requireActiveManager();
    await manager.query(
      `
      UPDATE booking.resource_occupancy ro
      SET lock_state = 'COMMITTED', hold_expires_at = NULL
      FROM booking.booking_line_resource_assignments bla
      WHERE ro.tenant_id = $1
        AND ro.booking_line_resource_assignment_id = bla.id
        AND bla.tenant_id = ro.tenant_id
        AND bla.booking_line_id = ANY($2::uuid[])
      `,
      [tenantId, bookingLineIds],
    );
  }

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
    await manager.query(
      `
      DELETE FROM booking.booking_line_resource_assignments
      WHERE tenant_id = $1 AND booking_line_id = ANY($2::uuid[])
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
