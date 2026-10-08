import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { BookingCancelledEventBuilder } from '../../../../test/builders/booking/booking-cancelled-event.builder';
import { BookingInfoRequestedEventBuilder } from '../../../../test/builders/booking/booking-info-requested-event.builder';
import { BookingRequestedEventBuilder } from '../../../../test/builders/booking/booking-requested-event.builder';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/customer-entity.builder';
import { AdminDailyScheduleReminder } from '../../../booking/domain/commands/admin-daily-schedule-reminder.command';
import { BookingReminderDue } from '../../../booking/domain/commands/booking-reminder-due.command';
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
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { LoyaltyModule } from '../../../loyalty/loyalty.module';
import { LoyaltyEntryEntity } from '../../../loyalty/infrastructure/entities/loyalty-entry.entity';
import { LoyaltyBalanceEntity } from '../../../loyalty/infrastructure/entities/loyalty-balance.entity';
import { LoyaltyRedemptionEntity } from '../../../loyalty/infrastructure/entities/loyalty-redemption.entity';
import { BalanceExpiryLogEntity } from '../../../loyalty/infrastructure/entities/balance-expiry-log.entity';
import { NotificationLogEntity } from '../entities/notification-log.entity';

const PLATFORM_KEY = 'notification-emails-key-xxxxxxxxxxxxxx';

// POST /internal/tenants below drives BookingModule's TenantProvisionedHandler, which always
// queries booking.resources — the same entity set the other notification specs register.
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

interface SeededTenant {
  tenantId: string;
  slug: string;
  adminEmail: string;
  customerId: string;
  customerEmail: string;
}

describe('Story: booking emails render their shipped copy end to end (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let eventBus: IEventBus;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  async function provisionTenant(label: string): Promise<SeededTenant> {
    const stamp = `${label}-${Date.now()}`;
    const adminEmail = `admin-${stamp}@lavacar.com.br`;
    const slug = `ne-${stamp}`;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: `Emails ${label}`,
        slug,
        adminEmail,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    const tenantId = body.tenantId as string;

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
    return { tenantId, slug, adminEmail, customerId, customerEmail };
  }

  function logsFor(tenantId: string, eventId: string) {
    return ds.getRepository(NotificationLogEntity).find({ where: { tenantId, eventId } });
  }

  function to(email: string) {
    return dispatcher.dispatched.find((m) => m.to === email);
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'notification-emails-test-secret-32chars';

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

  it('daily schedule → the manager receives the day table, not an empty email', async () => {
    const command = new AdminDailyScheduleReminder(tenantA.tenantId, 'corr-daily', {
      localDate: '2026-07-02',
      totalBookingsToday: 1,
      bookingsToday: [
        {
          bookingId: uuidv7(),
          customerName: 'Maria <b>Souza</b>',
          customerPhone: '+5531999990000',
          lines: [{ serviceId: uuidv7(), serviceName: 'Lavagem Completa' }],
          appointmentSlot: {
            startTime: '2026-07-02T13:00:00.000Z',
            endTime: '2026-07-02T14:00:00.000Z',
          },
          adminNotes: null,
        },
      ],
    });

    await eventBus.publish(command);

    const message = to(tenantA.adminEmail);
    expect(message).toBeDefined();
    expect(message!.body).toContain('<strong>02/07/2026</strong>');
    expect(message!.body).toContain('<td>10:00</td>');
    expect(message!.body).toContain('Maria &lt;b&gt;Souza&lt;/b&gt;');
    expect(message!.body).not.toContain('{{');
  });

  it('reminder → the customer is greeted by name with a formatted date', async () => {
    const command = new BookingReminderDue(
      tenantA.tenantId,
      'corr-reminder',
      {
        bookingId: uuidv7(),
        customerId: tenantA.customerId,
        recipientEmail: tenantA.customerEmail,
        customerName: 'Maria Souza',
        scheduledAt: '2026-07-02T13:00:00.000Z',
        appointmentSlot: {
          startTime: '2026-07-02T13:00:00.000Z',
          endTime: '2026-07-02T14:00:00.000Z',
        },
        lines: [{ serviceId: uuidv7(), serviceName: 'Lavagem Completa' }],
      },
      '2026-07-01',
    );

    await eventBus.publish(command);

    const message = to(tenantA.customerEmail);
    expect(message!.body).toContain('Olá, Maria Souza!');
    expect(message!.body).toContain('02/07/2026');
    expect(message!.body).not.toContain('{{');
  });

  describe('info requested', () => {
    it('sends a signed-in customer to their own booking page', async () => {
      const bookingId = uuidv7();
      const event = new BookingInfoRequestedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withBookingId(bookingId)
        .withCustomerId(tenantA.customerId)
        .withContactEmail(tenantA.customerEmail)
        .build();

      await eventBus.publish(event);

      const message = to(tenantA.customerEmail);
      expect(message!.body).toContain(
        `http://localhost:3000/${tenantA.slug}/my-account/bookings/${bookingId}`,
      );
      expect(message!.body).not.toContain('/dashboard/');
    });

    it('gives a guest the tokenized link', async () => {
      const bookingId = uuidv7();
      const event = new BookingInfoRequestedEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withBookingId(bookingId)
        .withCustomerId(null)
        .withContactEmail('guest@example.com')
        .build();

      await eventBus.publish(event);

      const message = to('guest@example.com');
      expect(message!.body).toContain(`/bookings/${bookingId}/submit-info?token=`);
    });
  });

  describe('cancelled', () => {
    it('business-initiated with a reason → the manager and the customer both see the reason', async () => {
      const event = new BookingCancelledEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withContactEmail(tenantA.customerEmail)
        .withIsBusiness(true)
        .withReason('Máquina quebrada')
        .build();

      await eventBus.publish(event);

      const manager = to(tenantA.adminEmail);
      const customer = to(tenantA.customerEmail);
      expect(manager!.body).toContain('Cancelado pelo estabelecimento.');
      expect(manager!.body).toContain('<strong>Motivo:</strong> Máquina quebrada');
      expect(customer!.body).toContain('<strong>Motivo:</strong> Máquina quebrada');
      expect(manager!.body).toContain('01/07/2026');
    });

    it('customer-initiated → the manager sees who cancelled and the customer sees no reason line', async () => {
      const event = new BookingCancelledEventBuilder()
        .withTenantId(tenantA.tenantId)
        .withContactEmail(tenantA.customerEmail)
        .withIsBusiness(false)
        .withReason(null)
        .build();

      await eventBus.publish(event);

      const manager = to(tenantA.adminEmail);
      const customer = to(tenantA.customerEmail);
      expect(manager!.body).toContain('Cancelado pelo cliente.');
      expect(manager!.body).not.toContain('Motivo');
      expect(customer!.body).not.toContain('Motivo');
    });
  });

  it('requested with a pickup address → the manager sees it formatted, the customer does not', async () => {
    const event = new BookingRequestedEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withContactEmail(tenantA.customerEmail)
      .withPickupAddress({
        street: 'Rua das Flores',
        number: '10',
        complement: null,
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30110-000',
      })
      .build();

    await eventBus.publish(event);

    const manager = to(tenantA.adminEmail);
    const customer = to(tenantA.customerEmail);
    expect(manager!.body).toContain(
      '<strong>Endereço de retirada:</strong> Rua das Flores, 10, Centro, Belo Horizonte - MG, 30110-000',
    );
    expect(manager!.body).not.toContain('{"street"');
    expect(customer!.body).not.toContain('Rua das Flores');
    expect(customer!.body).not.toContain(' às ');
  });

  it('tenant isolation: an event of Tenant A never reaches Tenant B and writes no log under it', async () => {
    const event = new BookingCancelledEventBuilder()
      .withTenantId(tenantA.tenantId)
      .withContactEmail(tenantA.customerEmail)
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched.some((m) => m.to === tenantB.adminEmail)).toBe(false);
    expect(dispatcher.dispatched.some((m) => m.to === tenantB.customerEmail)).toBe(false);
    expect(await logsFor(tenantB.tenantId, event.eventId)).toHaveLength(0);
    expect((await logsFor(tenantA.tenantId, event.eventId)).length).toBeGreaterThan(0);
  });
});
