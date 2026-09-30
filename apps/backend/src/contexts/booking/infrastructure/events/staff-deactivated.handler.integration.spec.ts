import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResourceEntityBuilder } from '../../../../test/builders/booking/index';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { TenantEntityBuilder } from '../../../../test/builders/platform/tenant-entity.builder';
import {
  cleanupFutureCommitmentTenant,
  seedFutureBooking,
  seedService,
} from '../../../../test/utils/future-commitment-db-fixture';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { FutureCommitmentExceptionEntity } from '../entities/future-commitment-exception.entity';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { waitFor } from '../../../../test/utils/wait-for';
import { DeactivateStaffUseCase } from '../../../staff/application/use-cases/deactivate-staff.use-case';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { ResourceType } from '../../domain/resource.types';

const TENANT_ID = '10000000-0000-4000-8000-000000000500';
const MANAGER_ID = '20000000-0000-4000-8000-000000000002';

describe('StaffDeactivatedHandler (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let deactivateStaff: DeactivateStaffUseCase;

  beforeAll(async () => {
    const created = await createBookingIntegrationApp();
    app = created.app;
    ds = created.ds;
    deactivateStaff = created.moduleRef.get(DeactivateStaffUseCase, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('deactivates the Resource wrapping a staff member deactivated via UC-029, end-to-end through the real event bus', async () => {
    const staff = new StaffEntityBuilder()
      .withTenantId(TENANT_ID)
      .withEmail('camila@lavacar.com.br')
      .withRole('STAFF')
      .withIsActive(true)
      .build();
    await ds.getRepository(StaffEntity).save(staff);

    const resource = new ResourceEntityBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(staff.id)
      .build();
    await ds.getRepository(ResourceEntity).save(resource);

    await deactivateStaff.execute({
      staffId: staff.id,
      tenantId: TENANT_ID,
      deactivatedBy: MANAGER_ID,
      correlationId: 'staff-deactivated-integration-test',
    });

    await waitFor(async () => {
      const found = await ds.getRepository(ResourceEntity).findOne({ where: { id: resource.id } });
      return found?.isActive === false;
    });

    const found = await ds.getRepository(ResourceEntity).findOne({ where: { id: resource.id } });
    expect(found!.isActive).toBe(false);
  });

  it('no-ops when no Resource wraps the deactivated staff member', async () => {
    const staff = new StaffEntityBuilder()
      .withTenantId(TENANT_ID)
      .withEmail('joao@lavacar.com.br')
      .withRole('STAFF')
      .withIsActive(true)
      .build();
    await ds.getRepository(StaffEntity).save(staff);

    await expect(
      deactivateStaff.execute({
        staffId: staff.id,
        tenantId: TENANT_ID,
        deactivatedBy: MANAGER_ID,
        correlationId: 'staff-deactivated-noop-test',
      }),
    ).resolves.toEqual({ staffId: staff.id, isActive: false });
  });

  describe('worklist entries (M23-S08, UC-048 → UC-073)', () => {
    const WORKLIST_TENANT = '10000000-0000-4000-8000-000000000501';

    beforeAll(async () => {
      await ds
        .getRepository(TenantEntity)
        .save(
          new TenantEntityBuilder()
            .withId(WORKLIST_TENANT)
            .withSlug(`cascade-worklist-${WORKLIST_TENANT}`)
            .build(),
        );
    });

    afterAll(async () => {
      await cleanupFutureCommitmentTenant(ds, [WORKLIST_TENANT]);
      await ds.getRepository(StaffEntity).delete({ tenantId: WORKLIST_TENANT });
      await ds.getRepository(TenantEntity).delete({ id: WORKLIST_TENANT });
    });

    it('raises one entry per future booking of the deactivated staff member’s resource, and none for another tenant', async () => {
      const staff = new StaffEntityBuilder()
        .withTenantId(WORKLIST_TENANT)
        .withEmail('marina@lavacar.com.br')
        .withRole('STAFF')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(staff);
      const resource = await ds
        .getRepository(ResourceEntity)
        .save(
          new ResourceEntityBuilder()
            .withTenantId(WORKLIST_TENANT)
            .withType(ResourceType.STAFF)
            .withRefId(staff.id)
            .withName('Marina')
            .build(),
        );
      const service = await seedService(ds, WORKLIST_TENANT, { type: ResourceType.STAFF });
      const seeded = await seedFutureBooking(ds, {
        tenantId: WORKLIST_TENANT,
        serviceId: service.id,
        resource,
        startsInHours: 36,
      });

      await deactivateStaff.execute({
        staffId: staff.id,
        tenantId: WORKLIST_TENANT,
        deactivatedBy: MANAGER_ID,
        correlationId: 'staff-deactivated-worklist-test',
      });

      await waitFor(
        async () =>
          (await ds
            .getRepository(FutureCommitmentExceptionEntity)
            .count({ where: { tenantId: WORKLIST_TENANT } })) === 1,
      );
      const [entry] = await ds
        .getRepository(FutureCommitmentExceptionEntity)
        .find({ where: { tenantId: WORKLIST_TENANT } });
      expect(entry).toMatchObject({
        sourceType: 'RESOURCE_DEACTIVATION',
        sourceId: resource.id,
        affectedType: 'BOOKING',
        affectedId: seeded.bookingId,
        status: 'OPEN',
      });
      expect(
        await ds
          .getRepository(FutureCommitmentExceptionEntity)
          .count({ where: { tenantId: TENANT_ID } }),
      ).toBe(0);
    });
  });
});
