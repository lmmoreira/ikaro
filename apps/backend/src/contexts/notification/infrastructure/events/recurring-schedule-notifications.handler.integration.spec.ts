import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { BookingCancelledEventBuilder } from '../../../../test/builders/booking/booking-cancelled-event.builder';
import {
  RecurringBookingScheduleApprovalRequestedEventBuilder,
  RecurringBookingScheduleCreatedEventBuilder,
  RecurringBookingScheduleEndedEventBuilder,
  RecurringBookingScheduleRejectedEventBuilder,
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
import { AddRecurringScheduleTemplates1748500000029 } from '../migrations/1748500000029-AddRecurringScheduleTemplates';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';

const PLATFORM_KEY = 'recurring-sched-notif-key-xxxxxxxxxx';

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
] as const;

const LOYALTY_ENTITIES = [
  LoyaltyEntryEntity,
  LoyaltyBalanceEntity,
  LoyaltyRedemptionEntity,
  BalanceExpiryLogEntity,
] as const;

const NEW_KEYS = [
  NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER,
  NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN,
  NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER,
  NotificationTemplateKey.RECURRING_SCHEDULE_EXPIRED_CUSTOMER,
  NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER,
  NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_BY_STAFF_CUSTOMER,
];

interface SeededTenant {
  tenantId: string;
  adminEmail: string;
  customerId: string;
  customerEmail: string;
  serviceId: string;
}

describe('Story: recurring-schedule events → Notification emails (integration)', () => {
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
        name: `Recurring ${label}`,
        slug: `rs-${stamp}`,
        adminEmail,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    const tenantId = body.tenantId as string;

    const service = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName(`Aula ${label}`)
      .build();
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
    return { tenantId, adminEmail, customerId, customerEmail, serviceId: service.id };
  }

  // The event builders carry random customer/service ids — point the event at the seeded rows.
  function aim<T extends { data: { customerId: string; serviceId: string } }>(
    event: T,
    tenant: SeededTenant,
  ): T {
    event.data.customerId = tenant.customerId;
    event.data.serviceId = tenant.serviceId;
    return event;
  }

  function logsFor(tenantId: string, eventId: string) {
    return ds.getRepository(NotificationLogEntity).find({ where: { tenantId, eventId } });
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'recurring-sched-notif-test-secret-32c';

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

  it('Created → exactly one confirmation log and email to the customer', async () => {
    const event = aim(
      new RecurringBookingScheduleCreatedEventBuilder().withTenantId(tenantA.tenantId).build(),
      tenantA,
    );

    await eventBus.publish(event);

    const logs = await logsFor(tenantA.tenantId, event.eventId);
    expect(logs.map((l) => l.notificationType)).toEqual(['recurring-schedule-created-customer']);
    expect(dispatcher.dispatched.map((m) => m.to)).toEqual([tenantA.customerEmail]);
    expect(dispatcher.dispatched[0].subject).toBe('Sua recorrência foi confirmada');
  });

  it('ApprovalRequested → one alert to the managers and nothing to the customer', async () => {
    const event = aim(
      new RecurringBookingScheduleApprovalRequestedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .build(),
      tenantA,
    );

    await eventBus.publish(event);

    const logs = await logsFor(tenantA.tenantId, event.eventId);
    expect(logs.map((l) => l.notificationType)).toEqual([
      'recurring-schedule-approval-requested-admin',
    ]);
    expect(dispatcher.dispatched.some((m) => m.to === tenantA.customerEmail)).toBe(false);
    expect(dispatcher.dispatched.map((m) => m.to)).toContain(tenantA.adminEmail);
  });

  it.each([
    ['APPROVAL_REJECTED', 'recurring-schedule-rejected-customer'],
    ['APPROVAL_EXPIRED', 'recurring-schedule-expired-customer'],
  ] as const)('Rejected with %s → the matching template', async (reason, notificationType) => {
    const event = aim(
      new RecurringBookingScheduleRejectedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withReason(reason)
        .build(),
      tenantA,
    );

    await eventBus.publish(event);

    const logs = await logsFor(tenantA.tenantId, event.eventId);
    expect(logs.map((l) => l.notificationType)).toEqual([notificationType]);
    expect(dispatcher.dispatched.map((m) => m.to)).toEqual([tenantA.customerEmail]);
  });

  it.each([
    ['CUSTOMER', 'recurring-schedule-ended-customer'],
    ['STAFF', 'recurring-schedule-ended-by-staff-customer'],
  ] as const)('Ended by %s → the matching template', async (endedBy, notificationType) => {
    const event = aim(
      new RecurringBookingScheduleEndedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withEndedBy(endedBy)
        .build(),
      tenantA,
    );

    await eventBus.publish(event);

    const logs = await logsFor(tenantA.tenantId, event.eventId);
    expect(logs.map((l) => l.notificationType)).toEqual([notificationType]);
    expect(dispatcher.dispatched.map((m) => m.to)).toEqual([tenantA.customerEmail]);
  });

  it('replaying the same event sends nothing more', async () => {
    const event = aim(
      new RecurringBookingScheduleCreatedEventBuilder().withTenantId(tenantA.tenantId).build(),
      tenantA,
    );

    await eventBus.publish(event);
    await eventBus.publish(event);

    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(1);
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('tenant isolation: an event of Tenant A never reaches Tenant B and writes no log under it', async () => {
    const event = aim(
      new RecurringBookingScheduleCreatedEventBuilder().withTenantId(tenantA.tenantId).build(),
      tenantA,
    );

    await eventBus.publish(event);

    expect(dispatcher.dispatched.some((m) => m.to === tenantB.customerEmail)).toBe(false);
    expect(await logsFor(tenantB.tenantId, event.eventId)).toHaveLength(0);
  });

  it('tenant isolation: an event naming Tenant B customer under Tenant A resolves nothing', async () => {
    const event = new RecurringBookingScheduleCreatedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .build();
    event.data.customerId = tenantB.customerId;
    event.data.serviceId = tenantA.serviceId;

    await eventBus.publish(event);

    expect(dispatcher.dispatched).toHaveLength(0);
    expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(0);
  });

  describe('BookingCancelled emitted when a schedule is ended', () => {
    it('sends no cancellation email for an occurrence cancelled by the schedule ending', async () => {
      const event = new BookingCancelledEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withContactEmail(tenantA.customerEmail)
        .withCancelledByScheduleEnd(true)
        .build();

      await eventBus.publish(event);

      expect(dispatcher.dispatched).toHaveLength(0);
      expect(await logsFor(tenantA.tenantId, event.eventId)).toHaveLength(0);
    });

    it('still emails a single occurrence cancelled on its own', async () => {
      const event = new BookingCancelledEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withContactEmail(tenantA.customerEmail)
        .build();

      await eventBus.publish(event);

      const logs = await logsFor(tenantA.tenantId, event.eventId);
      expect(logs.map((l) => l.notificationType)).toContain('booking-cancelled-customer');
      expect(dispatcher.dispatched.some((m) => m.to === tenantA.customerEmail)).toBe(true);
    });
  });

  describe('AddRecurringScheduleTemplates migration', () => {
    async function runMigration(): Promise<void> {
      const queryRunner = ds.createQueryRunner();
      try {
        await new AddRecurringScheduleTemplates1748500000029().up(queryRunner);
      } finally {
        await queryRunner.release();
      }
    }

    async function newKeyRows(tenantId: string) {
      const rows = await ds.getRepository(NotificationTemplateEntity).find({ where: { tenantId } });
      return rows.filter((r) => NEW_KEYS.includes(r.triggerEvent as NotificationTemplateKey));
    }

    it('copies the six templates to a tenant that existed before it, in the tenant locale, and is idempotent', async () => {
      // Simulate a tenant provisioned before the migration: it has no row for the new keys, and
      // its locale is English.
      await ds
        .createQueryBuilder()
        .delete()
        .from(NotificationTemplateEntity)
        .where('tenant_id = :tenantId AND trigger_event IN (:...keys)', {
          tenantId: tenantB.tenantId,
          keys: NEW_KEYS,
        })
        .execute();
      await ds.query(
        `UPDATE platform.tenants SET settings = jsonb_set(settings, '{localization,language}', '"en"') WHERE id = $1`,
        [tenantB.tenantId],
      );
      expect(await newKeyRows(tenantB.tenantId)).toHaveLength(0);

      await runMigration();

      const copied = await newKeyRows(tenantB.tenantId);
      expect(copied.map((r) => r.triggerEvent).sort()).toEqual([...NEW_KEYS].sort());
      expect(copied.every((r) => r.locale === 'en')).toBe(true);

      await runMigration();
      expect(await newKeyRows(tenantB.tenantId)).toHaveLength(NEW_KEYS.length);
    });

    it('seeds the six global defaults in both locales', async () => {
      const globals = await ds
        .getRepository(NotificationTemplateEntity)
        .createQueryBuilder('t')
        .where('t.tenant_id IS NULL AND t.trigger_event IN (:...keys)', { keys: NEW_KEYS })
        .getMany();

      expect(globals).toHaveLength(NEW_KEYS.length * 2);
    });

    it('left the tenant that was provisioned after it with its own six rows in pt-BR', async () => {
      const rows = await newKeyRows(tenantA.tenantId);

      expect(rows).toHaveLength(NEW_KEYS.length);
      expect(rows.every((r) => r.locale === 'pt-BR')).toBe(true);
    });
  });
});
