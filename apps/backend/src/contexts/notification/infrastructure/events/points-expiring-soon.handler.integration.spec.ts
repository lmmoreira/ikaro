import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/customer-entity.builder';
import { PointsExpiringSoonCommandBuilder } from '../../../../test/builders/loyalty';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';

const PLATFORM_KEY = 'pts-expiring-integration-test-key-xxxxxx';

describe('PointsExpiringSoonHandler (event bus → handler → use case → real DB) integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let eventBus: IEventBus;
  let tenantId: string;
  let customerId: string;
  let customerEmail: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'pts-expiring-integration-test-secret-32c';

    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds, eventBus } = await createNotificationIntegrationApp({
      dispatcher,
      extraEntities: [CustomerEntity],
      withRequestInterceptor: true,
    }));

    const slug = `pts-expiring-${Date.now()}`;
    const adminEmail = `admin-pts-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({
        name: 'Points Expiring Integration',
        slug,
        adminEmail,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);

    tenantId = body.tenantId as string;
    // RoutingInMemoryEventBus is synchronous — full provisioning chain is done when 201 returns.

    customerId = uuidv7();
    customerEmail = `customer-pts-${Date.now()}@example.com`;
    await ds
      .getRepository(CustomerEntity)
      .save(
        new CustomerEntityBuilder()
          .withId(customerId)
          .withTenantId(tenantId)
          .withEmail(customerEmail)
          .build(),
      );
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['JWT_SECRET'];
  });

  afterEach(() => dispatcher.clear());

  it('PointsExpiringSoon → writes log and dispatches warning email to customer', async () => {
    const event = new PointsExpiringSoonCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withCustomerId(customerId)
      .withPointsExpiringSoon(30)
      .build();

    await eventBus.publish(event);

    const log = await ds.getRepository(NotificationLogEntity).findOne({
      where: { tenantId, eventId: event.eventId, notificationType: 'points-expiring-soon' },
    });
    expect(log).not.toBeNull();

    const msg = dispatcher.dispatched.find((m) => m.to === customerEmail);
    expect(msg).toBeDefined();
    expect(msg!.subject).toContain('expirar');
  });

  it('is idempotent — replaying same event produces only one notification log', async () => {
    const event = new PointsExpiringSoonCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withCustomerId(customerId)
      .withPointsExpiringSoon(10)
      .build();

    await eventBus.publish(event);

    const logAfterFirst = await ds.getRepository(NotificationLogEntity).findOne({
      where: { tenantId, eventId: event.eventId, notificationType: 'points-expiring-soon' },
    });
    expect(logAfterFirst).not.toBeNull();

    // Second publish with same eventId — isAlreadySent finds processedEvent → skips.
    await eventBus.publish(event);

    const logs = await ds.getRepository(NotificationLogEntity).find({
      where: { tenantId, eventId: event.eventId, notificationType: 'points-expiring-soon' },
    });
    expect(logs).toHaveLength(1);
  });

  it('dispatch failure → FAILED log; explicit retry → SENT log with retryCount=1', async () => {
    const event = new PointsExpiringSoonCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withCustomerId(customerId)
      .withPointsExpiringSoon(99)
      .build();

    // First delivery: dispatch fails → use case writes FAILED log, processedEvent NOT saved.
    // RoutingInMemoryEventBus swallows the handler rethrow.
    dispatcher.failNext(new Error('SMTP connection refused'));
    await eventBus.publish(event);

    const failedLog = await ds.getRepository(NotificationLogEntity).findOne({
      where: { tenantId, eventId: event.eventId, notificationType: 'points-expiring-soon' },
    });
    expect(failedLog).not.toBeNull();
    expect(failedLog!.status).toBe('FAILED');

    // Second delivery (deterministic retry): isAlreadySent → no processedEvent → proceeds.
    // retryCount=1 proves the upsert incremented rather than reset to 0.
    await eventBus.publish(event);

    const sentLog = await ds.getRepository(NotificationLogEntity).findOne({
      where: { tenantId, eventId: event.eventId, notificationType: 'points-expiring-soon' },
    });
    expect(sentLog!.status).toBe('SENT');
    expect(sentLog!.sentAt).toBeTruthy();
    expect(sentLog!.retryCount).toBe(1);
  });

  it('tenant isolation: PointsExpiringSoon for Tenant A does not notify Tenant B customer', async () => {
    const tenantBSlug = `pts-expiring-b-${Date.now()}`;
    const tenantBAdminEmail = `admin-pts-b-${Date.now()}@lavacar.com.br`;
    const { body: bodyB } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({
        name: 'Points Expiring B',
        slug: tenantBSlug,
        adminEmail: tenantBAdminEmail,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    const tenantBId = bodyB.tenantId as string;

    const tenantBCustomerEmail = `customer-pts-b-${Date.now()}@example.com`;
    await ds
      .getRepository(CustomerEntity)
      .save(
        new CustomerEntityBuilder()
          .withId(uuidv7())
          .withTenantId(tenantBId)
          .withEmail(tenantBCustomerEmail)
          .build(),
      );

    dispatcher.clear();

    const event = new PointsExpiringSoonCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withCustomerId(customerId)
      .withPointsExpiringSoon(25)
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched.some((m) => m.to === customerEmail)).toBe(true);
    expect(dispatcher.dispatched.some((m) => m.to === tenantBCustomerEmail)).toBe(false);
  });
});
