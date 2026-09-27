import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  ResourceEntityBuilder,
  ServiceEntityBuilder,
  ServiceResourceRequirementEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { ServiceEntity } from '../entities/service.entity';
import { ServiceResourceRequirementEntity } from '../entities/service-resource-requirement.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { ResourceType } from '../../domain/resource.types';

const TEST_KEY = 'recur-integ-test-key-booking-xxx'; // 36 chars
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000601';

describe('RecurringBookingScheduleController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantId: string;
  let resourceId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));

    const { body: tenant } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Recurring Tenant A',
        slug: 'recurring-tenant-a',
        adminEmail: 'a@recurring.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantId = tenant.tenantId as string;

    const customer = new CustomerEntityBuilder()
      .withTenantId(tenantId)
      .withId(CUSTOMER_ID)
      .withEmail('ana@recurring.test')
      .withName('Ana Souza')
      .withPhone('+5531999999999')
      .build();
    await ds.getRepository(CustomerEntity).save(customer);

    const resource = new ResourceEntityBuilder()
      .withTenantId(tenantId)
      .withType(ResourceType.ROOM)
      .withName('Sala Aurora')
      .build();
    await ds.getRepository(ResourceEntity).save(resource);
    resourceId = resource.id;
  });

  afterAll(async () => {
    await ds.getRepository(RecurringBookingScheduleResourceAssignmentEntity).delete({ tenantId });
    await ds.getRepository(RecurringBookingScheduleEntity).delete({ tenantId });
    await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId });
    await ds.getRepository(ServiceResourceRequirementEntity).delete({ tenantId });
    await ds.getRepository(ResourceEntity).delete({ tenantId });
    await ds.getRepository(ServiceEntity).delete({ tenantId });
    await ds.getRepository(CustomerEntity).delete({ tenantId });
    await app.close();
  });

  async function seedService(
    defaultApprovalMode: 'AUTO_CONFIRM' | 'MANUAL_APPROVAL',
  ): Promise<string> {
    const service = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Sala Aurora — reserva')
      .withRecurrenceEligible(true)
      .withDefaultApprovalMode(defaultApprovalMode)
      .build();
    const saved = await ds.getRepository(ServiceEntity).save(service);
    const requirement = new ServiceResourceRequirementEntityBuilder()
      .withTenantId(tenantId)
      .withServiceId(saved.id)
      .withResourceType(ResourceType.ROOM)
      .withSelectionMode('CUSTOMER_CHOICE')
      .build();
    await ds.getRepository(ServiceResourceRequirementEntity).save(requirement);
    return saved.id;
  }

  it('POST /recurring-booking-schedules persists ACTIVE with zero occurrences for AUTO_CONFIRM', async () => {
    const serviceId = await seedService('AUTO_CONFIRM');

    const { body } = await request(app.getHttpServer())
      .post('/recurring-booking-schedules')
      .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
      .send({
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 60,
        },
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        startsOn: nextWeekday(2),
      })
      .expect(201);

    expect(body.status).toBe('ACTIVE');
    const occupancyCount = await ds
      .getRepository(ResourceOccupancyEntity)
      .count({ where: { tenantId } });
    expect(occupancyCount).toBe(0);
  });

  it('POST /recurring-booking-schedules persists PENDING_APPROVAL for MANUAL_APPROVAL, no resource_occupancy rows', async () => {
    const serviceId = await seedService('MANUAL_APPROVAL');

    const { body } = await request(app.getHttpServer())
      .post('/recurring-booking-schedules')
      .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
      .send({
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['wednesday'],
          startTime: '11:00',
          durationMinutes: 60,
        },
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        startsOn: nextWeekday(3),
      })
      .expect(201);

    expect(body.status).toBe('PENDING_APPROVAL');
    expect(body.approvalHoldExpiresAt).toBeDefined();
    const occupancyCount = await ds
      .getRepository(ResourceOccupancyEntity)
      .count({ where: { tenantId } });
    expect(occupancyCount).toBe(0);
  });

  it('never crosses tenant/customer boundary on GET', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/recurring-booking-schedules')
      .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
      .expect(200);

    expect(
      body.items.every((item: { customerId: string }) => item.customerId === CUSTOMER_ID),
    ).toBe(true);
  });
});
