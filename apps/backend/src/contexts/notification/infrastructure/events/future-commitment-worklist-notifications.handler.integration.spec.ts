import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { BookingResourceReassignedEventBuilder } from '../../../../test/builders/booking/booking-resource-reassigned-event.builder';
import { ResourceDeactivationImpactRaisedEventBuilder } from '../../../../test/builders/booking/resource-deactivation-impact-raised-event.builder';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { NotificationLogEntity } from '../entities/notification-log.entity';

const PLATFORM_KEY = 'worklist-notifications-key-xxxxxxxxxxxxx';

interface SeededTenant {
  tenantId: string;
  adminEmail: string;
}

// M23-S23 against the real database and real provisioned templates: one manager email per
// deactivation, one customer email per moved booking, nothing crossing tenants.
describe('Story: future-commitment worklist events → emails (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let eventBus: IEventBus;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  async function provisionTenant(label: string): Promise<SeededTenant> {
    const stamp = `${label}-${Date.now()}`;
    const adminEmail = `admin-${stamp}@clinica.com.br`;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: `Worklist ${label}`,
        slug: `wl-${stamp}`,
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

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'worklist-notifications-secret-32chars';

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

  describe('ResourceDeactivationImpactRaised → manager alert', () => {
    it('sends the managers exactly one email for the deactivation and logs it under the tenant', async () => {
      const event = new ResourceDeactivationImpactRaisedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withResourceName('Sala 1')
        .withAffectedCount(11)
        .build();

      await eventBus.publish(event);

      const alerts = dispatcher.dispatched.filter((m) => m.to === tenantA.adminEmail);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].subject).toBe('Reservas precisam de decisão: Sala 1 foi desativado(a)');
      expect(alerts[0].body).toContain('<strong>11</strong>');
      expect(alerts[0].body).toContain('/dashboard"');
      expect(alerts[0].body).not.toContain('{{');
      const logs = await logsFor(tenantA.tenantId, event.eventId);
      expect(logs).toHaveLength(1);
      expect(logs[0].notificationType).toBe(
        NotificationTemplateKey.RESOURCE_DEACTIVATION_IMPACT_ADMIN,
      );
    });

    it('replaying the same event sends nothing more', async () => {
      const event = new ResourceDeactivationImpactRaisedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .build();

      await eventBus.publish(event);
      await eventBus.publish(event);

      expect(dispatcher.dispatched.filter((m) => m.to === tenantA.adminEmail)).toHaveLength(1);
    });

    it('tenant isolation: Tenant A’s deactivation never reaches Tenant B’s managers', async () => {
      const event = new ResourceDeactivationImpactRaisedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .build();

      await eventBus.publish(event);

      expect(dispatcher.dispatched.some((m) => m.to === tenantB.adminEmail)).toBe(false);
      expect(await logsFor(tenantB.tenantId, event.eventId)).toHaveLength(0);
    });
  });

  describe('BookingResourceReassigned → customer message', () => {
    it('emails the booking contact the time is unchanged and names the new resource when disclosed', async () => {
      const event = new BookingResourceReassignedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withContactEmail('maria@example.com')
        .withContactName('Maria Souza')
        .withNewResourceName('Sala 2')
        .build();

      await eventBus.publish(event);

      expect(dispatcher.dispatched).toHaveLength(1);
      const message = dispatcher.dispatched[0];
      expect(message.to).toBe('maria@example.com');
      expect(message.subject).toBe(
        'O recurso do seu agendamento mudou, mas o horário continua o mesmo',
      );
      expect(message.body).toContain('<strong>Novo recurso:</strong> Sala 2');
      expect(message.body).not.toContain('{{');
      const logs = await logsFor(tenantA.tenantId, event.eventId);
      expect(logs).toHaveLength(1);
      expect(logs[0].notificationType).toBe(
        NotificationTemplateKey.BOOKING_RESOURCE_REASSIGNED_CUSTOMER,
      );
    });

    it('names no resource when the requirement does not disclose it', async () => {
      const event = new BookingResourceReassignedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withNewResourceName(null)
        .build();

      await eventBus.publish(event);

      expect(dispatcher.dispatched[0].body).not.toContain('Novo recurso');
      expect(dispatcher.dispatched[0].body).not.toContain('Sala 2');
    });

    it('sends one email per moved booking, each to its own contact', async () => {
      const first = new BookingResourceReassignedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withContactEmail('ana@example.com')
        .build();
      const second = new BookingResourceReassignedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withContactEmail('bruno@example.com')
        .build();

      await eventBus.publish(first);
      await eventBus.publish(second);

      expect(dispatcher.dispatched.map((m) => m.to).sort()).toEqual([
        'ana@example.com',
        'bruno@example.com',
      ]);
    });

    it('tenant isolation: Tenant A’s reassign never reaches Tenant B’s managers or writes a log under it', async () => {
      const event = new BookingResourceReassignedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .build();

      await eventBus.publish(event);

      expect(dispatcher.dispatched.some((m) => m.to === tenantB.adminEmail)).toBe(false);
      expect(await logsFor(tenantB.tenantId, event.eventId)).toHaveLength(0);
      expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(1);
    });
  });
});
