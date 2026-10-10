import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { BookingCompletedEventBuilder } from '../../../../test/builders/booking/booking-completed-event.builder';
import { BookingNoShowEventBuilder } from '../../../../test/builders/booking/booking-no-show-event.builder';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';
import { AddBookingNoShowCustomerTemplate1748500000032 } from '../migrations/1748500000032-AddBookingNoShowCustomerTemplate';

const PLATFORM_KEY = 'booking-no-show-key-xxxxxxxxxxxxxxxxx';
const KEY = NotificationTemplateKey.BOOKING_NO_SHOW_CUSTOMER;

interface SeededTenant {
  tenantId: string;
  adminEmail: string;
}

describe('Story: BookingNoShow → customer email (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let eventBus: IEventBus;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  async function provisionTenant(label: string): Promise<SeededTenant> {
    const stamp = `${label}-${Date.now()}`;
    const adminEmail = `admin-${stamp}@lavacar.com.br`;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: `NoShow ${label}`,
        slug: `ns-${stamp}`,
        adminEmail,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    return { tenantId: body.tenantId as string, adminEmail };
  }

  function logsFor(tenantId: string, eventId: string) {
    return ds.getRepository(NotificationLogEntity).find({ where: { tenantId, eventId } });
  }

  function templateRows(tenantId: string) {
    return ds
      .getRepository(NotificationTemplateEntity)
      .find({ where: { tenantId, triggerEvent: KEY } });
  }

  async function runMigration(): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    try {
      await new AddBookingNoShowCustomerTemplate1748500000032().up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'booking-no-show-test-secret-32chars-x';

    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds, eventBus } = await createNotificationIntegrationApp({
      dispatcher,
      withRequestInterceptor: true,
    }));

    tenantA = await provisionTenant('a');
    tenantB = await provisionTenant('b');
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['JWT_SECRET'];
  });

  beforeEach(() => dispatcher.clear());

  it('emails the booking contact once, in the tenant locale, and logs it under the tenant', async () => {
    const event = new BookingNoShowEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withContactEmail('maria@example.com')
      .withContactName('Maria Souza')
      .withScheduledAt('2026-06-01T18:30:00.000Z')
      .withReason('Nota interna da equipe')
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched).toHaveLength(1);
    const message = dispatcher.dispatched[0];
    expect(message.to).toBe('maria@example.com');
    expect(message.subject).toBe('Seu agendamento foi registrado como não comparecimento');
    expect(message.body).toContain('Maria Souza');
    expect(message.body).toContain('01/06/2026');
    expect(message.body).toContain('15:30');
    expect(message.body).not.toContain('{{');
    expect(message.body).not.toContain('Nota interna');
    const logs = await logsFor(tenantA.tenantId, event.eventId);
    expect(logs).toHaveLength(1);
    expect(logs[0].notificationType).toBe(KEY);
  });

  it('emails a guest booking (no customer id) at its contact email', async () => {
    const event = new BookingNoShowEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withCustomerId(null)
      .withContactEmail('guest@example.com')
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched.map((m) => m.to)).toEqual(['guest@example.com']);
  });

  it('a manager correcting the no-show to COMPLETED sends no second email', async () => {
    const noShow = new BookingNoShowEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withContactEmail('corrected@example.com')
      .build();
    const correction = new BookingCompletedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withContactEmail('corrected@example.com')
      .build();

    await eventBus.publish(noShow);
    await eventBus.publish(correction);

    expect(dispatcher.dispatched.filter((m) => m.to === 'corrected@example.com')).toHaveLength(1);
    const noShowLogs = await ds
      .getRepository(NotificationLogEntity)
      .find({ where: { tenantId: tenantA.tenantId, notificationType: KEY } });
    expect(noShowLogs.filter((l) => l.eventId === noShow.eventId)).toHaveLength(1);
    expect(noShowLogs.some((l) => l.eventId === correction.eventId)).toBe(false);
  });

  it('replaying the same event sends nothing more', async () => {
    const event = new BookingNoShowEventBuilder().withTenantId(tenantA.tenantId).build();

    await eventBus.publish(event);
    await eventBus.publish(event);

    expect(dispatcher.dispatched).toHaveLength(1);
    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(1);
  });

  it('tenant isolation: an event of Tenant A never reaches Tenant B and writes no log under it', async () => {
    const event = new BookingNoShowEventBuilder().withTenantId(tenantA.tenantId).build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched.some((m) => m.to === tenantB.adminEmail)).toBe(false);
    expect(await logsFor(tenantB.tenantId, event.eventId)).toHaveLength(0);
    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(1);
  });

  describe('AddBookingNoShowCustomerTemplate migration', () => {
    it('seeds the global default in both locales', async () => {
      const globals = await ds
        .getRepository(NotificationTemplateEntity)
        .createQueryBuilder('t')
        .where('t.tenant_id IS NULL AND t.trigger_event = :key', { key: KEY })
        .getMany();

      expect(globals.map((g) => g.locale).sort()).toEqual(['en', 'pt-BR']);
    });

    it('copies the template to a tenant that existed before it, in the tenant locale, and is idempotent', async () => {
      // Simulate a tenant provisioned before the migration: no row for the key, English locale.
      await ds
        .createQueryBuilder()
        .delete()
        .from(NotificationTemplateEntity)
        .where('tenant_id = :tenantId AND trigger_event = :key', {
          tenantId: tenantB.tenantId,
          key: KEY,
        })
        .execute();
      await ds.query(
        `UPDATE platform.tenants SET settings = jsonb_set(settings, '{localization,language}', '"en"') WHERE id = $1`,
        [tenantB.tenantId],
      );
      expect(await templateRows(tenantB.tenantId)).toHaveLength(0);

      await runMigration();

      const copied = await templateRows(tenantB.tenantId);
      expect(copied).toHaveLength(1);
      expect(copied[0].locale).toBe('en');

      await runMigration();
      expect(await templateRows(tenantB.tenantId)).toHaveLength(1);
    });

    it('left the tenant provisioned after it with its own row in pt-BR', async () => {
      const rows = await templateRows(tenantA.tenantId);

      expect(rows).toHaveLength(1);
      expect(rows[0].locale).toBe('pt-BR');
    });
  });
});
