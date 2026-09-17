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
    const resourceEntityB = new ResourceEntityBuilder()
      .withTenantId(TENANT_B)
      .withType(ResourceType.LOCATION)
      .build();
    await dataSource.getRepository(ResourceEntity).save([resourceEntityA, resourceEntityB]);
    resourceA = resourceEntityA.id;
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
});
