import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import { waitFor } from '../../../../test/utils/wait-for';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { StaffInvitedEventBuilder } from '../../../../test/builders/staff';

const PLATFORM_KEY = 'notification-story-test-key-xxxxxxxxx';

describe('Story: POST /internal/tenants → Pub/Sub → invitation email dispatched (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let eventBus: IEventBus;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['PUBSUB_SUBSCRIPTION_SUFFIX'] = `-si-${Date.now()}`;
    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds, eventBus } = await createNotificationIntegrationApp({ dispatcher }));
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['PUBSUB_SUBSCRIPTION_SUFFIX'];
  });

  afterEach(() => {
    dispatcher.clear();
  });

  it('provisions tenant → StaffInvited published → invitation email dispatched', async () => {
    const slug = `notif-${Date.now()}`;
    const adminEmail = `admin-notif-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({ name: 'Lava Car Notif', slug, adminEmail, timezone: 'America/Sao_Paulo' })
      .expect(201);

    expect(body.tenantId).toBeDefined();
    const tenantId: string = body.tenantId;

    await waitFor(async () => {
      const log = await ds.getRepository(NotificationLogEntity).findOne({
        where: { tenantId, notificationType: 'STAFF_INVITED', channel: 'EMAIL' },
      });
      return log !== null;
    });

    const log = await ds.getRepository(NotificationLogEntity).findOne({
      where: { tenantId, notificationType: 'STAFF_INVITED', channel: 'EMAIL' },
    });

    expect(log).not.toBeNull();
    expect(log!.tenantId).toBe(tenantId);
    expect(log!.channel).toBe('EMAIL');

    const msg = dispatcher.dispatched.find((m) => m.to === adminEmail);
    expect(msg).toBeDefined();
    expect(msg!.subject).toContain('Lava Car Notif');
    expect(msg!.data['activationLink']).toContain(slug);
  });

  it('is idempotent: re-delivery of same eventId produces exactly 1 log row total', async () => {
    const slug = `notif-idem-${Date.now()}`;
    const adminEmail = `admin-idem-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({ name: 'Idem Notif', slug, adminEmail, timezone: 'America/Sao_Paulo' })
      .expect(201);

    const tenantId: string = body.tenantId;

    // Wait for the manager staff record so we can get its real staffId.
    // Wait for both the manager staff record AND the provisioning's notification log.
    // The provisioning flow publishes its own StaffInvited event; if that email arrives
    // after we capture countBeforeRedeliver, the 2-second wait window would miscount it
    // as idempotency broken. Waiting for the log here drains that background noise first.
    await waitFor(async () => {
      const staff = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId, role: 'MANAGER' } });
      if (!staff) return false;
      const provisioningLog = await ds
        .getRepository(NotificationLogEntity)
        .findOne({ where: { tenantId, notificationType: 'STAFF_INVITED', channel: 'EMAIL' } });
      return provisioningLog !== null;
    });

    const staff = await ds
      .getRepository(StaffEntity)
      .findOne({ where: { tenantId, role: 'MANAGER' } });

    // Publish a synthetic StaffInvited event directly to test handler idempotency
    // without relying on the provisioning flow's event (whose eventId is not controllable).
    const event = new StaffInvitedEventBuilder()
      .withTenantId(tenantId)
      .withStaffId(staff!.id)
      .build();

    await eventBus.publish(event);
    await waitFor(async () => {
      const logs = await ds
        .getRepository(NotificationLogEntity)
        .find({ where: { tenantId, eventId: event.eventId } });
      return logs.length >= 1;
    });

    const countBeforeRedeliver = dispatcher.dispatched.filter(
      (m) => m.templateKey === 'staff-invitation',
    ).length;

    await eventBus.publish(event);

    const redeliveryDeadline = Date.now() + 2000;
    await waitFor(async () => {
      const newCount = dispatcher.dispatched.filter(
        (m) => m.templateKey === 'staff-invitation',
      ).length;
      if (newCount > countBeforeRedeliver) {
        throw new Error('Idempotency broken: new email dispatched after re-delivery');
      }
      return Date.now() >= redeliveryDeadline;
    });

    const logs = await ds
      .getRepository(NotificationLogEntity)
      .find({ where: { tenantId, eventId: event.eventId } });

    expect(logs).toHaveLength(1);
  });

  it('tenant isolation: notification log is scoped to the correct tenant', async () => {
    const slugA = `iso-notif-a-${Date.now()}`;
    const slugB = `iso-notif-b-${Date.now()}`;
    const emailA = `iso-a-${Date.now()}@lavacar.com.br`;
    const emailB = `iso-b-${Date.now()}@lavacar.com.br`;

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${PLATFORM_KEY}`)
        .send({ name: 'Iso A Notif', slug: slugA, adminEmail: emailA }),
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${PLATFORM_KEY}`)
        .send({ name: 'Iso B Notif', slug: slugB, adminEmail: emailB }),
    ]);

    const tenantAId: string = resA.body.tenantId;
    const tenantBId: string = resB.body.tenantId;

    await waitFor(async () => {
      const [a, b] = await Promise.all([
        ds.getRepository(NotificationLogEntity).findOne({ where: { tenantId: tenantAId } }),
        ds.getRepository(NotificationLogEntity).findOne({ where: { tenantId: tenantBId } }),
      ]);
      return a !== null && b !== null;
    });

    const logsA = await ds
      .getRepository(NotificationLogEntity)
      .find({ where: { tenantId: tenantAId } });
    const logsB = await ds
      .getRepository(NotificationLogEntity)
      .find({ where: { tenantId: tenantBId } });

    expect(logsA).toHaveLength(1);
    expect(logsB).toHaveLength(1);
    expect(logsA[0].tenantId).toBe(tenantAId);
    expect(logsB[0].tenantId).toBe(tenantBId);
  });
});
