import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResourceEntityBuilder } from '../../../../test/builders/booking/index';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
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
});
