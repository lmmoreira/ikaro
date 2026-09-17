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
import { BookingEntity } from './entities/booking.entity';
import { BookingLineEntity } from './entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from './entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from './entities/resource-occupancy.entity';
import { ResourceType } from '../domain/resource.types';
import { DropTenantWideExclusion1748500000014 } from './migrations/1748500000014-DropTenantWideExclusion';

// integration-global-setup.ts already ran this migration once, up front, against an empty
// bookings table — it already dropped EX_booking_bookings_approved_slot for the shared test
// datasource. This spec re-invokes up() directly (same discipline as
// backfill-resource-occupancy.integration.spec.ts) to exercise its own data-invariant guard,
// independent of whether the constraint itself has already been dropped. Two tenants, not one —
// the guard's query is unscoped by tenant (it must catch the offending line regardless of which
// tenant it belongs to), so sharing one tenant across both tests would make the "proceeds" case
// see the other test's deliberately-unprotected leftover row.
const TENANT_UNPROTECTED = '00000000-1114-7000-8000-000000000001';
const TENANT_PROTECTED = '00000000-1114-7000-8000-000000000002';

describe('DropTenantWideExclusion1748500000014 (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let migration: DropTenantWideExclusion1748500000014;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    migration = new DropTenantWideExclusion1748500000014();

    await ds
      .getRepository(TenantEntity)
      .save([
        new TenantEntityBuilder().withId(TENANT_UNPROTECTED).withSlug('drop-exclusion-a').build(),
        new TenantEntityBuilder().withId(TENANT_PROTECTED).withSlug('drop-exclusion-b').build(),
      ]);
  });

  afterAll(async () => {
    await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId: TENANT_PROTECTED });
    await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .delete({ tenantId: TENANT_PROTECTED });
    await ds
      .getRepository(BookingLineEntity)
      .delete({ tenantId: In([TENANT_UNPROTECTED, TENANT_PROTECTED]) });
    await ds
      .getRepository(BookingEntity)
      .delete({ tenantId: In([TENANT_UNPROTECTED, TENANT_PROTECTED]) });
    await ds
      .getRepository(ServiceEntity)
      .delete({ tenantId: In([TENANT_UNPROTECTED, TENANT_PROTECTED]) });
    await ds.getRepository(ResourceEntity).delete({ tenantId: TENANT_PROTECTED });
    await ds.getRepository(TenantEntity).delete({ id: In([TENANT_UNPROTECTED, TENANT_PROTECTED]) });
    await app.close();
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

  it('proceeds when every APPROVED booking line already has a COMMITTED resource_occupancy row', async () => {
    // TENANT_UNPROTECTED's own bad row from the test above must not leak into this assertion —
    // remove it first so this test only proves the (tenant-agnostic) guard passes cleanly.
    await ds.getRepository(BookingLineEntity).delete({ tenantId: TENANT_UNPROTECTED });
    await ds.getRepository(BookingEntity).delete({ tenantId: TENANT_UNPROTECTED });

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

    await expect(runUp()).resolves.toBeUndefined();
  });
});
