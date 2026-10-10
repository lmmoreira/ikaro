import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import {
  AvailabilityAlertEntityBuilder,
  AvailabilityAlertMatchedEventBuilder,
  AvailabilityAlertNotificationAttemptEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/customer-entity.builder';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { BookingModule } from '../../../booking/booking.module';
import { BookingEntity } from '../../../booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../../booking/infrastructure/entities/booking-line.entity';
import { BookingStatusTransitionEntity } from '../../../booking/infrastructure/entities/booking-status-transition.entity';
import { ServiceEntity } from '../../../booking/infrastructure/entities/service.entity';
import {
  ServiceResourceRequirementEntity,
  ServiceResourceRequirementPoolEntity,
} from '../../../booking/infrastructure/entities/service-resource-requirement.entity';
import {
  ServiceLegEntity,
  ServiceLegResourceRequirementEntity,
  ServiceLegResourceRequirementPoolEntity,
} from '../../../booking/infrastructure/entities/service-leg.entity';
import { ServiceClassResourcePoolEntity } from '../../../booking/infrastructure/entities/service-class-resource-pool.entity';
import { ScheduleClosureEntity } from '../../../booking/infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../../../booking/infrastructure/entities/schedule-opening.entity';
import { ResourceEntity } from '../../../booking/infrastructure/entities/resource.entity';
import { BookingLineResourceAssignmentEntity } from '../../../booking/infrastructure/entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from '../../../booking/infrastructure/entities/resource-occupancy.entity';
import { ServiceBookingIntakeSchemaEntity } from '../../../booking/infrastructure/entities/service-booking-intake-schema.entity';
import { BookingAttendeeEntity } from '../../../booking/infrastructure/entities/booking-attendee.entity';
import { LoyaltyModule } from '../../../loyalty/loyalty.module';
import { LoyaltyEntryEntity } from '../../../loyalty/infrastructure/entities/loyalty-entry.entity';
import { LoyaltyBalanceEntity } from '../../../loyalty/infrastructure/entities/loyalty-balance.entity';
import { LoyaltyRedemptionEntity } from '../../../loyalty/infrastructure/entities/loyalty-redemption.entity';
import { BalanceExpiryLogEntity } from '../../../loyalty/infrastructure/entities/balance-expiry-log.entity';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';
import { AvailabilityAlertEntity } from '../../../booking/infrastructure/entities/availability-alert.entity';
import { AvailabilityAlertNotificationAttemptEntity } from '../../../booking/infrastructure/entities/availability-alert-notification-attempt.entity';
import { AddAvailabilityAlertMatchedTemplate1748500000031 } from '../migrations/1748500000031-AddAvailabilityAlertMatchedTemplate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';

const PLATFORM_KEY = 'alert-matched-notif-key-xxxxxxxxxx';

// POST /internal/tenants below drives BookingModule's TenantProvisionedHandler, which always
// queries booking.resources — the same entity set the full-workflow notification spec registers.
const BOOKING_ENTITIES = [
  BookingEntity,
  BookingLineEntity,
  BookingStatusTransitionEntity,
  ServiceEntity,
  ServiceResourceRequirementEntity,
  ServiceResourceRequirementPoolEntity,
  ServiceLegEntity,
  ServiceLegResourceRequirementEntity,
  ServiceLegResourceRequirementPoolEntity,
  ServiceClassResourcePoolEntity,
  ScheduleClosureEntity,
  ScheduleOpeningEntity,
  CustomerEntity,
  ResourceEntity,
  BookingLineResourceAssignmentEntity,
  ResourceOccupancyEntity,
  ServiceBookingIntakeSchemaEntity,
  BookingAttendeeEntity,
  AvailabilityAlertEntity,
  AvailabilityAlertNotificationAttemptEntity,
] as const;

const LOYALTY_ENTITIES = [
  LoyaltyEntryEntity,
  LoyaltyBalanceEntity,
  LoyaltyRedemptionEntity,
  BalanceExpiryLogEntity,
] as const;

const NEW_KEY = NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER;

interface SeededTenant {
  tenantId: string;
  customerId: string;
  customerEmail: string;
  serviceId: string;
  serviceName: string;
}

describe('Story: AvailabilityAlertMatched → customer email and attempt outcome (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let eventBus: IEventBus;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  async function provisionTenant(label: string): Promise<SeededTenant> {
    const stamp = `${label}-${Date.now()}`;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: `Alert ${label}`,
        slug: `aa-${stamp}`,
        adminEmail: `admin-${stamp}@lavacar.com.br`,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    const tenantId = body.tenantId as string;

    const serviceName = `Aula ${label}`;
    const service = new ServiceEntityBuilder().withTenantId(tenantId).withName(serviceName).build();
    await ds.getRepository(ServiceEntity).save(service);

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
    return { tenantId, customerId, customerEmail, serviceId: service.id, serviceName };
  }

  // A NOTIFIED alert with its PENDING EMAIL attempt for the event's window, and the event.
  async function matchFor(tenant: SeededTenant) {
    const event = new AvailabilityAlertMatchedEventBuilder().withTenantId(tenant.tenantId).build();
    event.data.customerId = tenant.customerId;
    event.data.serviceId = tenant.serviceId;
    await ds
      .getRepository(AvailabilityAlertEntity)
      .save(
        new AvailabilityAlertEntityBuilder()
          .withId(event.data.alertId)
          .withTenantId(tenant.tenantId)
          .withServiceId(tenant.serviceId)
          .withCustomerId(tenant.customerId)
          .withStatus('NOTIFIED')
          .build(),
      );
    await ds
      .getRepository(AvailabilityAlertNotificationAttemptEntity)
      .save(
        new AvailabilityAlertNotificationAttemptEntityBuilder()
          .withTenantId(tenant.tenantId)
          .withAlertId(event.data.alertId)
          .withWindowStart(new Date(event.data.matchingWindowStart))
          .withWindowEnd(new Date(event.data.matchingWindowEnd))
          .build(),
      );
    return event;
  }

  function attemptOf(tenantId: string, alertId: string) {
    return ds
      .getRepository(AvailabilityAlertNotificationAttemptEntity)
      .findOneOrFail({ where: { tenantId, alertId } });
  }

  function logsFor(tenantId: string, eventId: string) {
    return ds.getRepository(NotificationLogEntity).find({ where: { tenantId, eventId } });
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'alert-matched-notif-test-secret-32c';

    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds, eventBus } = await createNotificationIntegrationApp({
      dispatcher,
      extraModules: [BookingModule, LoyaltyModule],
      extraEntities: [...BOOKING_ENTITIES, ...LOYALTY_ENTITIES],
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

  it('emails the customer once and ends the attempt SENT with one try', async () => {
    const event = await matchFor(tenantA);

    await eventBus.publish(event);

    const logs = await logsFor(tenantA.tenantId, event.eventId);
    expect(logs.map((l) => l.notificationType)).toEqual(['availability-alert-matched-customer']);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].to).toBe(tenantA.customerEmail);
    expect(dispatcher.dispatched[0].subject).toBe(`Abriu uma vaga para ${tenantA.serviceName}`);
    expect(await attemptOf(tenantA.tenantId, event.data.alertId)).toMatchObject({
      outcome: 'SENT',
      attemptCount: 1,
      lastError: null,
    });
  });

  it('links the booking page on the alert service, the day and the duration', async () => {
    const event = await matchFor(tenantA);
    event.data.durationMinutes = 90;

    await eventBus.publish(event);

    expect(dispatcher.dispatched).toHaveLength(1);
    const body = dispatcher.dispatched[0].body;
    expect(body).toContain('/booking?');
    expect(body).toContain(`serviceId=${tenantA.serviceId}`);
    expect(body).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    expect(body).toContain('durationMinutes=90');
  });

  it('a replay of the same event sends nothing more and counts no extra try', async () => {
    const event = await matchFor(tenantA);

    await eventBus.publish(event);
    await eventBus.publish(event);

    expect(dispatcher.dispatched).toHaveLength(1);
    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(1);
    expect((await attemptOf(tenantA.tenantId, event.data.alertId)).attemptCount).toBe(1);
  });

  it('a dispatch failure ends the attempt FAILED, and the redelivery turns it into SENT', async () => {
    const event = await matchFor(tenantA);

    // The in-memory bus swallows the handler's rethrow, like Pub/Sub's fire-and-forget nack.
    dispatcher.failNext(new Error('SMTP connection refused'));
    await eventBus.publish(event);

    expect(await attemptOf(tenantA.tenantId, event.data.alertId)).toMatchObject({
      outcome: 'FAILED',
      attemptCount: 1,
      lastError: 'SMTP connection refused',
    });
    expect(dispatcher.dispatched).toHaveLength(0);

    await eventBus.publish(event);

    expect(await attemptOf(tenantA.tenantId, event.data.alertId)).toMatchObject({
      outcome: 'SENT',
      attemptCount: 2,
      lastError: null,
    });
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('a customer that no longer exists produces no email and leaves the attempt PENDING', async () => {
    const event = await matchFor(tenantA);
    event.data.customerId = uuidv7();

    await eventBus.publish(event);

    expect(dispatcher.dispatched).toHaveLength(0);
    expect(await attemptOf(tenantA.tenantId, event.data.alertId)).toMatchObject({
      outcome: 'PENDING',
      attemptCount: 0,
    });
  });

  it('tenant isolation: an event of Tenant A never reaches Tenant B and writes nothing under it', async () => {
    const event = await matchFor(tenantA);
    const otherEvent = await matchFor(tenantB);

    await eventBus.publish(event);

    expect(dispatcher.dispatched.some((m) => m.to === tenantB.customerEmail)).toBe(false);
    expect(await logsFor(tenantB.tenantId, event.eventId)).toHaveLength(0);
    expect(await attemptOf(tenantB.tenantId, otherEvent.data.alertId)).toMatchObject({
      outcome: 'PENDING',
      attemptCount: 0,
    });
  });

  it('tenant isolation: an event under Tenant A naming Tenant B’s customer resolves nothing', async () => {
    const event = await matchFor(tenantA);
    event.data.customerId = tenantB.customerId;

    await eventBus.publish(event);

    expect(dispatcher.dispatched).toHaveLength(0);
    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(0);
  });

  describe('AddAvailabilityAlertMatchedTemplate migration', () => {
    async function runMigration(): Promise<void> {
      const queryRunner = ds.createQueryRunner();
      try {
        await new AddAvailabilityAlertMatchedTemplate1748500000031().up(queryRunner);
      } finally {
        await queryRunner.release();
      }
    }

    function newKeyRows(tenantId: string) {
      return ds
        .getRepository(NotificationTemplateEntity)
        .find({ where: { tenantId, triggerEvent: NEW_KEY } });
    }

    it('copies the template to a tenant that existed before it, in the tenant locale, and is idempotent', async () => {
      await ds
        .createQueryBuilder()
        .delete()
        .from(NotificationTemplateEntity)
        .where('tenant_id = :tenantId AND trigger_event = :key', {
          tenantId: tenantB.tenantId,
          key: NEW_KEY,
        })
        .execute();
      await ds.query(
        `UPDATE platform.tenants SET settings = jsonb_set(settings, '{localization,language}', '"en"') WHERE id = $1`,
        [tenantB.tenantId],
      );
      expect(await newKeyRows(tenantB.tenantId)).toHaveLength(0);

      await runMigration();

      const copied = await newKeyRows(tenantB.tenantId);
      expect(copied).toHaveLength(1);
      expect(copied[0].locale).toBe('en');

      await runMigration();
      expect(await newKeyRows(tenantB.tenantId)).toHaveLength(1);
    });

    it('seeds the global default in both locales', async () => {
      const globals = await ds
        .getRepository(NotificationTemplateEntity)
        .createQueryBuilder('t')
        .where('t.tenant_id IS NULL AND t.trigger_event = :key', { key: NEW_KEY })
        .getMany();

      expect(globals.map((g) => g.locale).sort()).toEqual(['en', 'pt-BR']);
    });

    it('left the tenant provisioned after it with its own row in pt-BR', async () => {
      const rows = await newKeyRows(tenantA.tenantId);

      expect(rows).toHaveLength(1);
      expect(rows[0].locale).toBe('pt-BR');
    });
  });
});
