import { DataSource } from 'typeorm';
import { TenantEntityBuilder } from '../../../../test/builders/platform/tenant-entity.builder';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  ResourceEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { createTestDataSource } from '../../../../test/test-datasource';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';
import { ResourceType } from '../../domain/resource.types';
import { ResourceOccupancyCandidate } from '../../application/ports/resource-occupancy-repository.port';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { ServiceEntity } from '../entities/service.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { TypeOrmResourceOccupancyRepository } from './typeorm-resource-occupancy.repository';

const TENANT_A = uuidv7();
const TENANT_B = uuidv7();

function candidate(
  resourceId: string,
  startsAt: Date,
  endsAt: Date,
  overrides: Partial<ResourceOccupancyCandidate> = {},
): ResourceOccupancyCandidate {
  return {
    resourceId,
    resourceType: ResourceType.LOCATION,
    resourceName: 'Localização Principal',
    legIndex: null,
    quantityPosition: null,
    startsAt,
    endsAt,
    ...overrides,
  };
}

describe('TypeOrmResourceOccupancyRepository (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let repo: TypeOrmResourceOccupancyRepository;
  let resourceA: string;
  let resourceA2: string;
  let resourceB: string;

  // booking_line_resource_assignments.booking_line_id carries a real composite FK to
  // booking_lines(tenant_id, line_id), which in turn FKs to services(tenant_id, id) — every
  // candidate below needs a genuinely persisted service + booking + line.
  async function seedBookingLine(tenantId: string): Promise<string> {
    const service = new ServiceEntityBuilder().withTenantId(tenantId).build();
    await dataSource.getRepository(ServiceEntity).save(service);
    const booking = new BookingEntityBuilder().withTenantId(tenantId).build();
    await dataSource.getRepository(BookingEntity).save(booking);
    const line = new BookingLineEntityBuilder()
      .withTenantId(tenantId)
      .withBookingId(booking.id)
      .withServiceId(service.id)
      .build();
    await dataSource.getRepository(BookingLineEntity).save(line);
    return line.lineId;
  }

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    repo = new TypeOrmResourceOccupancyRepository();

    await dataSource
      .getRepository(TenantEntity)
      .save([
        new TenantEntityBuilder().withId(TENANT_A).withSlug(`ro-tenant-a-${TENANT_A}`).build(),
        new TenantEntityBuilder().withId(TENANT_B).withSlug(`ro-tenant-b-${TENANT_B}`).build(),
      ]);

    const resourceEntityA = new ResourceEntityBuilder()
      .withTenantId(TENANT_A)
      .withType(ResourceType.LOCATION)
      .build();
    // EQUIPMENT, not LOCATION — a tenant can only have one LOCATION resource
    // (UQ_booking_resources_tenant_location), and this needs a second, genuinely distinct
    // resource under TENANT_A for the multi-candidate (multi-leg) tests below.
    const resourceEntityA2 = new ResourceEntityBuilder()
      .withTenantId(TENANT_A)
      .withType(ResourceType.EQUIPMENT)
      .build();
    const resourceEntityB = new ResourceEntityBuilder()
      .withTenantId(TENANT_B)
      .withType(ResourceType.LOCATION)
      .build();
    await dataSource
      .getRepository(ResourceEntity)
      .save([resourceEntityA, resourceEntityA2, resourceEntityB]);
    resourceA = resourceEntityA.id;
    resourceA2 = resourceEntityA2.id;
    resourceB = resourceEntityB.id;
  });

  afterAll(async () => {
    await dataSource.getRepository(ResourceOccupancyEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(ResourceOccupancyEntity).delete({ tenantId: TENANT_B });
    await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .delete({ tenantId: TENANT_A });
    await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .delete({ tenantId: TENANT_B });
    await dataSource.getRepository(BookingLineEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(BookingLineEntity).delete({ tenantId: TENANT_B });
    await dataSource.getRepository(BookingEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(BookingEntity).delete({ tenantId: TENANT_B });
    await dataSource.getRepository(ServiceEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(ServiceEntity).delete({ tenantId: TENANT_B });
    await dataSource.getRepository(ResourceEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(ResourceEntity).delete({ tenantId: TENANT_B });
    await dataSource.getRepository(TenantEntity).delete({ id: TENANT_A });
    await dataSource.getRepository(TenantEntity).delete({ id: TENANT_B });
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.getRepository(ResourceOccupancyEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(ResourceOccupancyEntity).delete({ tenantId: TENANT_B });
    await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .delete({ tenantId: TENANT_A });
    await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .delete({ tenantId: TENANT_B });
    await dataSource.getRepository(BookingLineEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(BookingLineEntity).delete({ tenantId: TENANT_B });
    await dataSource.getRepository(BookingEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(BookingEntity).delete({ tenantId: TENANT_B });
    await dataSource.getRepository(ServiceEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(ServiceEntity).delete({ tenantId: TENANT_B });
  });

  it('rejects a genuinely overlapping insert at the DB level via the GIST exclusion constraint', async () => {
    const start = new Date('2026-06-01T10:00:00.000Z');
    const end = new Date('2026-06-01T11:00:00.000Z');
    const lineId1 = await seedBookingLine(TENANT_A);
    const lineId2 = await seedBookingLine(TENANT_A);

    await txManager.run(() =>
      repo.assign(TENANT_A, lineId1, [candidate(resourceA, start, end)], 'COMMITTED', null),
    );

    const overlapStart = new Date('2026-06-01T10:30:00.000Z');
    const overlapEnd = new Date('2026-06-01T11:30:00.000Z');
    await expect(
      txManager.run(() =>
        repo.assign(
          TENANT_A,
          lineId2,
          [candidate(resourceA, overlapStart, overlapEnd)],
          'COMMITTED',
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(BookingSlotUnavailableError);
  });

  it('rejects a genuinely overlapping insert under real concurrency (two parallel transactions)', async () => {
    const start = new Date('2026-06-02T10:00:00.000Z');
    const end = new Date('2026-06-02T11:00:00.000Z');
    const lineId1 = await seedBookingLine(TENANT_A);
    const lineId2 = await seedBookingLine(TENANT_A);

    const results = await Promise.allSettled([
      txManager.run(() =>
        repo.assign(TENANT_A, lineId1, [candidate(resourceA, start, end)], 'COMMITTED', null),
      ),
      txManager.run(() =>
        repo.assign(TENANT_A, lineId2, [candidate(resourceA, start, end)], 'COMMITTED', null),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      BookingSlotUnavailableError,
    );
  });

  it('allows adjacent (touching, non-overlapping) windows on the same resource (UC-060 A1)', async () => {
    const firstEnd = new Date('2026-06-03T11:00:00.000Z');
    const lineId1 = await seedBookingLine(TENANT_A);
    const lineId2 = await seedBookingLine(TENANT_A);
    await txManager.run(() =>
      repo.assign(
        TENANT_A,
        lineId1,
        [candidate(resourceA, new Date('2026-06-03T10:00:00.000Z'), firstEnd)],
        'COMMITTED',
        null,
      ),
    );

    await expect(
      txManager.run(() =>
        repo.assign(
          TENANT_A,
          lineId2,
          [candidate(resourceA, firstEnd, new Date('2026-06-03T12:00:00.000Z'))],
          'COMMITTED',
          null,
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it('a booking line never conflicts with its own existing commitment when excluded (UC-060 A2)', async () => {
    const lineId = await seedBookingLine(TENANT_A);
    const start = new Date('2026-06-04T10:00:00.000Z');
    const end = new Date('2026-06-04T11:00:00.000Z');
    await txManager.run(() =>
      repo.assign(TENANT_A, lineId, [candidate(resourceA, start, end)], 'COMMITTED', null),
    );

    const conflicts = await txManager.run(() =>
      repo.findConflictingResourceIds(
        TENANT_A,
        [{ resourceId: resourceA, startsAt: start, endsAt: end }],
        [lineId],
      ),
    );
    expect(conflicts).toEqual([]);

    const conflictsWithoutExclusion = await txManager.run(() =>
      repo.findConflictingResourceIds(TENANT_A, [
        { resourceId: resourceA, startsAt: start, endsAt: end },
      ]),
    );
    expect(conflictsWithoutExclusion).toEqual([resourceA]);
  });

  it('scopes the exclusion constraint by tenant_id — two tenants never conflict on their own resources', async () => {
    const start = new Date('2026-06-05T10:00:00.000Z');
    const end = new Date('2026-06-05T11:00:00.000Z');
    const lineIdA = await seedBookingLine(TENANT_A);
    const lineIdB = await seedBookingLine(TENANT_B);

    await txManager.run(() =>
      repo.assign(TENANT_A, lineIdA, [candidate(resourceA, start, end)], 'COMMITTED', null),
    );

    await expect(
      txManager.run(() =>
        repo.assign(TENANT_B, lineIdB, [candidate(resourceB, start, end)], 'COMMITTED', null),
      ),
    ).resolves.toBeUndefined();
  });

  // The test above necessarily uses two different resource ids (resources.id is a global,
  // tenant-independent PRIMARY KEY, per CreateBookingResources's own PK_booking_resources — two
  // tenants can never share one), so it alone can't distinguish "scoped by tenant_id" from
  // "scoped by resource_id" catching the same case. Assert the constraint's own key list directly.
  it("the exclusion constraint's key list includes tenant_id, not just resource_id", async () => {
    const rows: { conkey: string }[] = await dataSource.query(`
      SELECT pg_get_constraintdef(oid) AS conkey
      FROM pg_constraint
      WHERE conname = 'EX_booking_resource_occupancy_locked_window'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].conkey).toContain('tenant_id');
  });

  it('release() deletes the occupancy row but preserves the immutable assignment record', async () => {
    const lineId = await seedBookingLine(TENANT_A);
    const start = new Date('2026-06-07T10:00:00.000Z');
    const end = new Date('2026-06-07T11:00:00.000Z');
    await txManager.run(() =>
      repo.assign(TENANT_A, lineId, [candidate(resourceA, start, end)], 'COMMITTED', null),
    );

    await txManager.run(() => repo.release(TENANT_A, [lineId]));

    const occupancyRows = await dataSource
      .getRepository(ResourceOccupancyEntity)
      .find({ where: { tenantId: TENANT_A, resourceId: resourceA } });
    const assignmentRows = await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: lineId } });
    expect(occupancyRows).toHaveLength(0);
    expect(assignmentRows).toHaveLength(1);
  });

  it('a multi-candidate assign() (e.g. a 2-leg service) produces exactly one assignment + one occupancy row per candidate', async () => {
    const lineId = await seedBookingLine(TENANT_A);
    const start = new Date('2026-06-06T10:00:00.000Z');
    const end = new Date('2026-06-06T11:00:00.000Z');
    const legOneCandidate = candidate(resourceA, start, end, { legIndex: 0 });
    const legTwoCandidate = candidate(resourceA2, start, end, {
      legIndex: 1,
      resourceType: ResourceType.EQUIPMENT,
    });

    await txManager.run(() =>
      repo.assign(TENANT_A, lineId, [legOneCandidate, legTwoCandidate], 'COMMITTED', null),
    );

    const assignmentRows = await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: lineId } });
    expect(assignmentRows).toHaveLength(2);

    const occupancyRows = await dataSource
      .getRepository(ResourceOccupancyEntity)
      .find({ where: { tenantId: TENANT_A } });
    const forThisLine = occupancyRows.filter((row) =>
      assignmentRows.some((a) => a.id === row.bookingLineResourceAssignmentId),
    );
    expect(forThisLine).toHaveLength(2);
    expect(forThisLine.map((row) => row.resourceId).sort()).toEqual([resourceA, resourceA2].sort());
  });

  it('a release() + assign() reschedule to the same resource reuses the existing assignment row (immutable, not duplicated)', async () => {
    const lineId = await seedBookingLine(TENANT_A);
    const oldStart = new Date('2026-06-08T10:00:00.000Z');
    const oldEnd = new Date('2026-06-08T11:00:00.000Z');
    await txManager.run(() =>
      repo.assign(TENANT_A, lineId, [candidate(resourceA, oldStart, oldEnd)], 'COMMITTED', null),
    );
    const [originalAssignment] = await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: lineId } });

    const newStart = new Date('2026-06-08T14:00:00.000Z');
    const newEnd = new Date('2026-06-08T15:00:00.000Z');
    await txManager.run(async () => {
      await repo.release(TENANT_A, [lineId]);
      await repo.assign(
        TENANT_A,
        lineId,
        [candidate(resourceA, newStart, newEnd)],
        'COMMITTED',
        null,
      );
    });

    const assignmentRows = await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: lineId } });
    expect(assignmentRows).toHaveLength(1);
    expect(assignmentRows[0].id).toBe(originalAssignment.id);
    expect(assignmentRows[0].assignedAt).toEqual(originalAssignment.assignedAt);

    const occupancyRows = await dataSource.getRepository(ResourceOccupancyEntity).find({
      where: { tenantId: TENANT_A, bookingLineResourceAssignmentId: originalAssignment.id },
    });
    expect(occupancyRows).toHaveLength(1);
    expect(occupancyRows[0].startsAt.toISOString()).toBe(newStart.toISOString());
  });

  it('a multi-candidate release() + assign() reschedule reuses every existing assignment row under the batched write path', async () => {
    const lineId = await seedBookingLine(TENANT_A);
    const oldStart = new Date('2026-06-09T10:00:00.000Z');
    const oldEnd = new Date('2026-06-09T11:00:00.000Z');
    await txManager.run(() =>
      repo.assign(
        TENANT_A,
        lineId,
        [
          candidate(resourceA, oldStart, oldEnd, { legIndex: 0 }),
          candidate(resourceA2, oldStart, oldEnd, {
            legIndex: 1,
            resourceType: ResourceType.EQUIPMENT,
          }),
        ],
        'COMMITTED',
        null,
      ),
    );
    const originalAssignments = await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: lineId } });
    expect(originalAssignments).toHaveLength(2);

    const newStart = new Date('2026-06-09T14:00:00.000Z');
    const newEnd = new Date('2026-06-09T15:00:00.000Z');
    await txManager.run(async () => {
      await repo.release(TENANT_A, [lineId]);
      await repo.assign(
        TENANT_A,
        lineId,
        [
          candidate(resourceA, newStart, newEnd, { legIndex: 0 }),
          candidate(resourceA2, newStart, newEnd, {
            legIndex: 1,
            resourceType: ResourceType.EQUIPMENT,
          }),
        ],
        'COMMITTED',
        null,
      );
    });

    const assignmentRows = await dataSource
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: lineId } });
    expect(assignmentRows).toHaveLength(2);
    expect(assignmentRows.map((a) => a.id).sort()).toEqual(
      originalAssignments.map((a) => a.id).sort(),
    );

    const occupancyRows = await dataSource.getRepository(ResourceOccupancyEntity).find({
      where: { tenantId: TENANT_A },
    });
    const forThisLine = occupancyRows.filter((row) =>
      assignmentRows.some((a) => a.id === row.bookingLineResourceAssignmentId),
    );
    expect(forThisLine).toHaveLength(2);
    expect(forThisLine.every((row) => row.startsAt.toISOString() === newStart.toISOString())).toBe(
      true,
    );
  });

  describe('deleteOlderThan (TD40 Story 2)', () => {
    it('deletes a row 91 days past ends_at, keeps a row 89 days past, and never touches booking_line_resource_assignments', async () => {
      const now = new Date('2026-09-17T00:00:00.000Z');
      const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const lineIdOld = await seedBookingLine(TENANT_A);
      const lineIdRecent = await seedBookingLine(TENANT_A);
      const oldEnd = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000); // 91 days past now
      const recentEnd = new Date(cutoff.getTime() + 24 * 60 * 60 * 1000); // 89 days past now

      await txManager.run(() =>
        repo.assign(
          TENANT_A,
          lineIdOld,
          [candidate(resourceA, new Date(oldEnd.getTime() - 60 * 60 * 1000), oldEnd)],
          'COMMITTED',
          null,
        ),
      );
      await txManager.run(() =>
        repo.assign(
          TENANT_A,
          lineIdRecent,
          [
            candidate(resourceA2, new Date(recentEnd.getTime() - 60 * 60 * 1000), recentEnd, {
              resourceType: ResourceType.EQUIPMENT,
            }),
          ],
          'COMMITTED',
          null,
        ),
      );

      const rowsDeleted = await txManager.run(() => repo.deleteOlderThan(cutoff));

      expect(rowsDeleted).toBe(1);
      const remaining = await dataSource
        .getRepository(ResourceOccupancyEntity)
        .find({ where: { tenantId: TENANT_A } });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].resourceId).toBe(resourceA2);
      const assignmentRows = await dataSource
        .getRepository(BookingLineResourceAssignmentEntity)
        .find({ where: { tenantId: TENANT_A, bookingLineId: lineIdOld } });
      expect(assignmentRows).toHaveLength(1);
    });

    it('deletes rows across every lock_state and every tenant in one unscoped pass', async () => {
      const cutoff = new Date('2026-01-01T00:00:00.000Z');
      const pastEnd = new Date('2025-12-01T10:00:00.000Z');
      const lineIdA = await seedBookingLine(TENANT_A);
      const lineIdB = await seedBookingLine(TENANT_B);

      await txManager.run(() =>
        repo.assign(
          TENANT_A,
          lineIdA,
          [candidate(resourceA, new Date(pastEnd.getTime() - 60 * 60 * 1000), pastEnd)],
          'REQUESTED',
          null,
        ),
      );
      await txManager.run(() =>
        repo.assign(
          TENANT_B,
          lineIdB,
          [candidate(resourceB, new Date(pastEnd.getTime() - 60 * 60 * 1000), pastEnd)],
          'COMMITTED',
          null,
        ),
      );

      const rowsDeleted = await txManager.run(() => repo.deleteOlderThan(cutoff));

      expect(rowsDeleted).toBe(2);
    });

    // Structural verification, not an EXPLAIN-plan assertion — matches the established style for
    // this class of index in this codebase (see lead_form_answers' own index tests); neither of
    // this job's two direct precedents (IDX_platform_lead_form_submissions_expires_at,
    // IDX_chatbot_messages_created_at) has an EXPLAIN-based test either. A query-plan assertion
    // would also be genuinely fragile here: the planner's choice between an index scan and a
    // sequential scan depends on live table statistics/row counts, which a fresh integration-test
    // database doesn't reliably reproduce.
    it('the standalone ends_at index exists', async () => {
      const rows: { indexname: string }[] = await dataSource.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'booking' AND tablename = 'resource_occupancy'
          AND indexname = 'IDX_booking_resource_occupancy_ends_at'
      `);
      expect(rows).toHaveLength(1);
    });
  });
});
