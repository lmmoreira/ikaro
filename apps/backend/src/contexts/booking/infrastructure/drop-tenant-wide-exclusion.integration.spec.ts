import { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  BookingLineResourceAssignmentEntityBuilder,
  ResourceEntityBuilder,
  ResourceOccupancyEntityBuilder,
  ServiceEntityBuilder,
} from '../../../test/builders/booking/index';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { createBookingIntegrationApp } from '../../../test/utils/booking-integration-app';
import { TenantEntity } from '../../platform/infrastructure/entities/tenant.entity';
import { ResourceEntity } from './entities/resource.entity';
import { ServiceEntity } from './entities/service.entity';
import { ServiceResourceRequirementEntity } from './entities/service-resource-requirement.entity';
import { BookingEntity } from './entities/booking.entity';
import { BookingLineEntity } from './entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from './entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from './entities/resource-occupancy.entity';
import { ResourceType } from '../domain/resource.types';
import { DropTenantWideExclusion1748500000014 } from './migrations/1748500000014-DropTenantWideExclusion';

// integration-global-setup.ts already ran this migration once, up front, against an empty
// bookings table — it already dropped EX_booking_bookings_approved_slot for the shared test
// datasource. The first spec below re-invokes up() directly (same discipline as
// backfill-resource-occupancy.integration.spec.ts) to exercise its own data-invariant guard,
// independent of whether the constraint itself has already been dropped. Two tenants, not one, so
// the second spec's tenant-scoped query never sees the first spec's deliberately-unprotected row.
const TENANT_UNPROTECTED = '00000000-1114-7000-8000-000000000001';
const TENANT_PROTECTED = '00000000-1114-7000-8000-000000000002';
const FIXTURE_TENANT_IDS = [TENANT_UNPROTECTED, TENANT_PROTECTED];

describe('DropTenantWideExclusion1748500000014 (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let migration: DropTenantWideExclusion1748500000014;

  // Deletes in FK-safe order for both fixture tenants at once — used both defensively before
  // seeding (self-heals if a prior run's afterAll never completed, e.g. under CI's
  // TESTCONTAINERS_REUSE_ENABLE) and in afterAll's own teardown, so the two never drift apart
  // (same discipline as backfill-service-resource-requirements-and-buffer.integration.spec.ts).
  async function cleanupFixtures(): Promise<void> {
    await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(BookingLineEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(BookingEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds
      .getRepository(ServiceResourceRequirementEntity)
      .delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(ServiceEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(ResourceEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(TenantEntity).delete({ id: In(FIXTURE_TENANT_IDS) });
  }

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    migration = new DropTenantWideExclusion1748500000014();

    await cleanupFixtures();

    await ds
      .getRepository(TenantEntity)
      .save([
        new TenantEntityBuilder().withId(TENANT_UNPROTECTED).withSlug('drop-exclusion-a').build(),
        new TenantEntityBuilder().withId(TENANT_PROTECTED).withSlug('drop-exclusion-b').build(),
      ]);
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app.close();
    }
  });

  async function runUp(): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration.up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  it('fails closed when an APPROVED booking line has no COMMITTED resource_occupancy row', async () => {
    const service = new ServiceEntityBuilder().withTenantId(TENANT_UNPROTECTED).build();
    await ds.getRepository(ServiceEntity).save(service);
    const booking = new BookingEntityBuilder()
      .withTenantId(TENANT_UNPROTECTED)
      .withStatus('APPROVED')
      .build();
    await ds.getRepository(BookingEntity).save(booking);
    const line = new BookingLineEntityBuilder()
      .withTenantId(TENANT_UNPROTECTED)
      .withBookingId(booking.id)
      .withServiceId(service.id)
      .build();
    await ds.getRepository(BookingLineEntity).save(line);
    // Deliberately no booking_line_resource_assignments/resource_occupancy row for this line —
    // simulates a booking approved after M22-S03 shipped but before its occupancy row was
    // assigned, or one BackfillResourceOccupancy skipped because it wasn't APPROVED yet.

    await expect(runUp()).rejects.toThrow(/APPROVED booking line\(s\) have no COMMITTED/);
  });

  // Cannot assert "the full migration resolves without throwing" here: the guard's own query is
  // deliberately unscoped by tenant (real production has many tenants to protect at once), and
  // this integration suite runs against one shared Postgres container where many unrelated spec
  // files seed their own APPROVED bookings with no occupancy row for entirely different testing
  // purposes — the guard correctly (and harmlessly, for those specs' own concerns) flags them too.
  // So the positive case is verified narrowly instead: the guard's own correlated-subquery logic,
  // scoped to just this test's own tenant, finds zero unprotected lines once a proper
  // assignment + COMMITTED occupancy row exists.
  it('scoped to a fully-protected tenant, the guard query finds zero unprotected booking lines', async () => {
    const resource = new ResourceEntityBuilder()
      .withTenantId(TENANT_PROTECTED)
      .withType(ResourceType.LOCATION)
      .build();
    await ds.getRepository(ResourceEntity).save(resource);
    const service = new ServiceEntityBuilder().withTenantId(TENANT_PROTECTED).build();
    await ds.getRepository(ServiceEntity).save(service);
    const booking = new BookingEntityBuilder()
      .withTenantId(TENANT_PROTECTED)
      .withStatus('APPROVED')
      .build();
    await ds.getRepository(BookingEntity).save(booking);
    const line = new BookingLineEntityBuilder()
      .withTenantId(TENANT_PROTECTED)
      .withBookingId(booking.id)
      .withServiceId(service.id)
      .build();
    await ds.getRepository(BookingLineEntity).save(line);
    const assignment = new BookingLineResourceAssignmentEntityBuilder()
      .withTenantId(TENANT_PROTECTED)
      .withBookingLineId(line.lineId)
      .withResourceId(resource.id)
      .withResourceType(ResourceType.LOCATION)
      .build();
    await ds.getRepository(BookingLineResourceAssignmentEntity).save(assignment);
    const occupancy = new ResourceOccupancyEntityBuilder()
      .withTenantId(TENANT_PROTECTED)
      .withResourceId(resource.id)
      .withResourceType(ResourceType.LOCATION)
      .withBookingLineResourceAssignmentId(assignment.id)
      .withLockState('COMMITTED')
      .withHoldExpiresAt(null)
      .build();
    await ds.getRepository(ResourceOccupancyEntity).save(occupancy);

    const [{ unprotected_count: unprotectedCount }] = await ds.query(
      `
      SELECT COUNT(*)::int AS unprotected_count
      FROM "booking"."bookings" b
      JOIN "booking"."booking_lines" bl
        ON bl."tenant_id" = b."tenant_id" AND bl."booking_id" = b."id"
      WHERE b."status" = 'APPROVED'
        AND b."tenant_id" = $1
        AND NOT EXISTS (
          SELECT 1
          FROM "booking"."booking_line_resource_assignments" bla
          JOIN "booking"."resource_occupancy" ro
            ON ro."tenant_id" = bla."tenant_id"
            AND ro."booking_line_resource_assignment_id" = bla."id"
            AND ro."lock_state" = 'COMMITTED'
          WHERE bla."tenant_id" = bl."tenant_id" AND bla."booking_line_id" = bl."line_id"
        )
      `,
      [TENANT_PROTECTED],
    );

    expect(unprotectedCount).toBe(0);
  });
});
