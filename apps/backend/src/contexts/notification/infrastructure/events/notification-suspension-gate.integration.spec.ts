import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/customer-entity.builder';
import { PointsExpiringSoonCommandBuilder } from '../../../../test/builders/loyalty';
import { StaffInvitedEventBuilder } from '../../../../test/builders/staff/staff-invited-event.builder';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';

const PLATFORM_KEY = 'notif-suspension-gate-test-key-xxxxxx';

interface ProvisionedTenant {
  tenantId: string;
  adminEmail: string;
  staffId: string;
  customerId: string;
  customerEmail: string;
}

// UC-123 / UC-125 (M25-S21a): Notification has no gate of its own. Its send handlers declare
// skipWhenSuspended: true, and the event delivery gate stops a suspended tenant's emails at
// delivery time; the handlers that must run while suspended declare false.
describe('Notification handlers behind the event delivery gate (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: IEventBus;
  let access: InMemoryTenantAccessPort;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantA: ProvisionedTenant;
  let tenantB: ProvisionedTenant;

  async function provisionTenant(label: string): Promise<ProvisionedTenant> {
    const stamp = `${label}-${Date.now()}`;
    const adminEmail = `admin-${stamp}@lavacar.com.br`;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: `Suspension Gate ${label}`,
        slug: `suspension-gate-${stamp}`,
        adminEmail,
        country_code: 'BR',
        registrationId: TEST_REGISTRATION_ID,
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    const tenantId = body.tenantId as string;

    const manager = await ds
      .getRepository(StaffEntity)
      .findOne({ where: { tenantId, role: 'MANAGER' } });

    const customerId = uuidv7();
    const customerEmail = `customer-${stamp}@example.com`;
    await ds
      .getRepository(CustomerEntity)
      .save(
        new CustomerEntityBuilder()
          .withId(customerId)
          .withTenantId(tenantId)
          .withEmail(customerEmail)
          .build(),
      );
    return { tenantId, adminEmail, staffId: manager!.id, customerId, customerEmail };
  }

  function pointsExpiringSoon(tenant: ProvisionedTenant, points: number) {
    return new PointsExpiringSoonCommandBuilder()
      .withTenantId(tenant.tenantId)
      .withCorrelationId(uuidv7())
      .withCustomerId(tenant.customerId)
      .withPointsExpiringSoon(points)
      .build();
  }

  async function logsFor(tenantId: string, eventId: string): Promise<NotificationLogEntity[]> {
    return ds.getRepository(NotificationLogEntity).find({ where: { tenantId, eventId } });
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'notif-suspension-gate-test-secret-32chars';

    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds, eventBus } = await createNotificationIntegrationApp({
      dispatcher,
      extraEntities: [CustomerEntity, StaffEntity],
      withRequestInterceptor: true,
    }));
    access = app.get<InMemoryTenantAccessPort>(TENANT_ACCESS_PORT);

    tenantA = await provisionTenant('a');
    tenantB = await provisionTenant('b');
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['JWT_SECRET'];
  });

  beforeEach(() => {
    access.reactivate(tenantA.tenantId);
    access.reactivate(tenantB.tenantId);
    dispatcher.clear();
  });

  it('delivers a send handler for an operational tenant (the gate changes nothing)', async () => {
    const event = pointsExpiringSoon(tenantA, 30);

    await eventBus.publish(event);

    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(1);
    expect(dispatcher.dispatched.some((m) => m.to === tenantA.customerEmail)).toBe(true);
  });

  it('skips a send handler for a suspended tenant: no log, no email (UC-123)', async () => {
    access.seedSuspended(tenantA.tenantId);
    const event = pointsExpiringSoon(tenantA, 31);

    await eventBus.publish(event);

    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(0);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('still sends the staff invitation to a suspended tenant (declared false)', async () => {
    access.seedSuspended(tenantA.tenantId);
    const event = new StaffInvitedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withCorrelationId(uuidv7())
      .withStaffId(tenantA.staffId)
      .build();

    await eventBus.publish(event);

    expect(
      dispatcher.dispatched.some(
        (m) => m.notificationType === 'staff-invitation' && m.to === tenantA.adminEmail,
      ),
    ).toBe(true);
  });

  it("never lets tenant A's suspension stop tenant B's email (tenant isolation)", async () => {
    access.seedSuspended(tenantA.tenantId);
    const eventA = pointsExpiringSoon(tenantA, 32);
    const eventB = pointsExpiringSoon(tenantB, 33);

    await eventBus.publish(eventA);
    await eventBus.publish(eventB);

    expect(await logsFor(tenantA.tenantId, eventA.eventId)).toHaveLength(0);
    expect(await logsFor(tenantB.tenantId, eventB.eventId)).toHaveLength(1);
    expect(dispatcher.dispatched.map((m) => m.to)).toEqual([tenantB.customerEmail]);
  });

  it('resumes sending once the tenant is operational again; a dropped event is not replayed', async () => {
    access.seedSuspended(tenantA.tenantId);
    const dropped = pointsExpiringSoon(tenantA, 34);
    await eventBus.publish(dropped);

    access.reactivate(tenantA.tenantId);
    const next = pointsExpiringSoon(tenantA, 35);
    await eventBus.publish(next);

    expect(await logsFor(tenantA.tenantId, dropped.eventId)).toHaveLength(0);
    expect(await logsFor(tenantA.tenantId, next.eventId)).toHaveLength(1);
  });
});
