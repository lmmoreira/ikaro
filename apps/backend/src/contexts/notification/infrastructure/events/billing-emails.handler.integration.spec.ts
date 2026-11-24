import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { Envelope } from '../../../../shared/domain/envelope';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import {
  ChargeIssuedEventBuilder,
  ChargePaidEventBuilder,
  PlanChangedEventBuilder,
  SubscriptionCancelledEventBuilder,
  SubscriptionPastDueEventBuilder,
  SubscriptionPriceChangeAnnouncedEventBuilder,
  SubscriptionReactivatedEventBuilder,
  SubscriptionSuspendedEventBuilder,
  BillingReminderDueCommandBuilder,
} from '../../../../test/builders/billing';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';

const PLATFORM_KEY = 'billing-emails-test-key-xxxxxxxxxxxxxx';

interface ProvisionedTenant {
  tenantId: string;
  managerEmail: string;
}

// M26-S12 (UC-124): each Billing event reaches its manager through the real handler, the real use
// case, the real platform template row and the real notification log; only the dispatcher and the
// bus are in memory. One spec for all nine events, like the booking emails family spec.
describe('Billing emails to the manager (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: IEventBus;
  let access: InMemoryTenantAccessPort;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantA: ProvisionedTenant;
  let tenantB: ProvisionedTenant;

  async function provisionTenant(label: string): Promise<ProvisionedTenant> {
    const stamp = `${label}-${Date.now()}`;
    const managerEmail = `manager-${stamp}@lavacar.com.br`;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: `Billing Emails ${label}`,
        slug: `billing-emails-${stamp}`,
        adminEmail: managerEmail,
        country_code: 'BR',
        registrationId: TEST_REGISTRATION_ID,
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    return { tenantId: body.tenantId as string, managerEmail };
  }

  function logsFor(tenantId: string, eventId: string): Promise<NotificationLogEntity[]> {
    return ds.getRepository(NotificationLogEntity).find({ where: { tenantId, eventId } });
  }

  // Each case: the event for tenant A with no billing email (so the managers are the recipients),
  // and the template key it must pick.
  const cases: ReadonlyArray<[string, (tenantId: string) => Envelope, NotificationTemplateKey]> = [
    [
      'ChargeIssued (period)',
      (t) =>
        new ChargeIssuedEventBuilder()
          .withTenantId(t)
          .withKind('PERIOD')
          .withRecipientEmail(null)
          .build(),
      NotificationTemplateKey.CHARGE_ISSUED_PERIOD,
    ],
    [
      'ChargePaid',
      (t) => new ChargePaidEventBuilder().withTenantId(t).withRecipientEmail(null).build(),
      NotificationTemplateKey.CHARGE_PAID,
    ],
    [
      'SubscriptionPastDue',
      (t) => new SubscriptionPastDueEventBuilder().withTenantId(t).withRecipientEmail(null).build(),
      NotificationTemplateKey.SUBSCRIPTION_PAST_DUE,
    ],
    [
      'SubscriptionSuspended (non payment)',
      (t) =>
        new SubscriptionSuspendedEventBuilder()
          .withTenantId(t)
          .withReason('NON_PAYMENT')
          .withRecipientEmail(null)
          .build(),
      NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_NON_PAYMENT,
    ],
    [
      'SubscriptionReactivated',
      (t) =>
        new SubscriptionReactivatedEventBuilder()
          .withTenantId(t)
          .withExempt(false)
          .withRecipientEmail(null)
          .build(),
      NotificationTemplateKey.SUBSCRIPTION_REACTIVATED,
    ],
    [
      'SubscriptionCancelled (scheduled)',
      (t) =>
        new SubscriptionCancelledEventBuilder()
          .withTenantId(t)
          .withImmediate(false)
          .withRecipientEmail(null)
          .build(),
      NotificationTemplateKey.SUBSCRIPTION_CANCELLED_SCHEDULED,
    ],
    [
      'PlanChanged',
      (t) => new PlanChangedEventBuilder().withTenantId(t).withRecipientEmail(null).build(),
      NotificationTemplateKey.PLAN_CHANGED,
    ],
    [
      'BillingReminderDue (charge due soon)',
      (t) =>
        new BillingReminderDueCommandBuilder()
          .withTenantId(t)
          .withKind('CHARGE_DUE_SOON')
          .withRecipientEmail(null)
          .build(),
      NotificationTemplateKey.BILLING_REMINDER_CHARGE_DUE_SOON,
    ],
    [
      'SubscriptionPriceChangeAnnounced',
      (t) =>
        new SubscriptionPriceChangeAnnouncedEventBuilder()
          .withTenantId(t)
          .withRecipientEmail(null)
          .build(),
      NotificationTemplateKey.SUBSCRIPTION_PRICE_CHANGE_ANNOUNCED,
    ],
  ];

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'billing-emails-test-secret-32chars-xx';

    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds, eventBus } = await createNotificationIntegrationApp({
      dispatcher,
      extraEntities: [StaffEntity],
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

  it.each(cases)(
    '%s sends its template once to the managers and writes one SENT row',
    async (_name, build, key) => {
      const event = build(tenantA.tenantId);

      await eventBus.publish(event);

      const rows = await logsFor(tenantA.tenantId, event.eventId);
      expect(rows.map((r) => [r.notificationType, r.status, r.recipientEmail])).toEqual([
        [key, 'SENT', tenantA.managerEmail],
      ]);
      expect(dispatcher.dispatched.map((m) => m.to)).toEqual([tenantA.managerEmail]);
    },
  );

  it.each(cases)(
    '%s delivered a second time creates no second row and no second email',
    async (_name, build) => {
      const event = build(tenantA.tenantId);

      await eventBus.publish(event);
      dispatcher.clear();
      await eventBus.publish(event);

      expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(1);
      expect(dispatcher.dispatched).toEqual([]);
    },
  );

  it('goes to the event billing email instead of the managers when it has one', async () => {
    const event = new ChargePaidEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withRecipientEmail('cobranca@example.com')
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched.map((m) => m.to)).toEqual(['cobranca@example.com']);
  });

  it('emails only the event tenant: the other tenant manager gets nothing and the row carries the event tenantId', async () => {
    const event = new ChargePaidEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withRecipientEmail(null)
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched.map((m) => m.to)).not.toContain(tenantB.managerEmail);
    expect(await logsFor(tenantB.tenantId, event.eventId)).toEqual([]);
    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(1);
  });

  it('still sends to a suspended tenant: SubscriptionSuspended and the recovery invoice (skipWhenSuspended: false)', async () => {
    access.seedSuspended(tenantA.tenantId);
    const suspended = new SubscriptionSuspendedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withReason('NON_PAYMENT')
      .withRecipientEmail(null)
      .build();
    const recovery = new ChargeIssuedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withKind('RECOVERY')
      .withRecipientEmail(null)
      .build();

    await eventBus.publish(suspended);
    await eventBus.publish(recovery);

    expect(await logsFor(tenantA.tenantId, suspended.eventId)).toHaveLength(1);
    expect(await logsFor(tenantA.tenantId, recovery.eventId)).toHaveLength(1);
  });

  it('an OPERATOR suspension tells the manager to contact Ikaro, with no payment link', async () => {
    const event = new SubscriptionSuspendedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withReason('OPERATOR')
      .withRecipientEmail(null)
      .build();

    await eventBus.publish(event);

    const [message] = dispatcher.dispatched;
    expect(message!.notificationType).toBe(NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_OPERATOR);
    expect(message!.body).not.toContain('href=');
  });

  it('a CANCELED suspension sends no email and writes no row', async () => {
    const event = new SubscriptionSuspendedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withReason('CANCELED')
      .withRecipientEmail(null)
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched).toEqual([]);
    expect(await logsFor(tenantA.tenantId, event.eventId)).toEqual([]);
  });

  it('an exempt SubscriptionReactivated sends no email and writes no row, with a null recipientEmail', async () => {
    const event = new SubscriptionReactivatedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withExempt(true)
      .withRecipientEmail(null)
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched).toEqual([]);
    expect(await logsFor(tenantA.tenantId, event.eventId)).toEqual([]);
  });

  it('logs billing_template_missing and sends nothing when the platform template is gone', async () => {
    const templates = ds.getRepository(NotificationTemplateEntity);
    const platformRows = (
      await templates.find({
        where: { triggerEvent: NotificationTemplateKey.CHARGE_PAID, locale: 'pt-BR' },
      })
    ).filter((row) => row.tenantId === null);
    const backup = platformRows.map((row) => ({ ...row }));
    const error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
    const event = new ChargePaidEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withRecipientEmail(null)
      .build();
    try {
      await templates.delete(platformRows.map((row) => row.id));

      await eventBus.publish(event);

      expect(error).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ event: 'billing_template_missing', tenantId: tenantA.tenantId }),
      );
      expect(dispatcher.dispatched).toEqual([]);
      expect(await logsFor(tenantA.tenantId, event.eventId)).toEqual([]);
    } finally {
      error.mockRestore();
      await templates.insert(backup);
    }
  });
});
