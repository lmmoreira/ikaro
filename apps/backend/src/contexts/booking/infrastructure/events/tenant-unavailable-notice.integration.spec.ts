import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { SubscriptionSuspendedEventBuilder } from '../../../../test/builders/billing/subscription-suspended-event.builder';
import { BookingBuilder } from '../../../../test/builders/booking';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/customer-entity.builder';
import { NotificationTemplateEntityBuilder } from '../../../../test/builders/notification/notification-template-entity.builder';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import type { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { NOTIFICATION_DISPATCHER } from '../../../notification/application/ports/notification-dispatcher.port';
import { NotificationTemplateKey } from '../../../notification/domain/notification-template-key.enum';
import { NotificationLogEntity } from '../../../notification/infrastructure/entities/notification-log.entity';
import { NotificationTemplateEntity } from '../../../notification/infrastructure/entities/notification-template.entity';
import { NotificationModule } from '../../../notification/notification.module';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import {
  BOOKING_REPOSITORY,
  IBookingRepository,
} from '../../application/ports/booking-repository.port';
import { BookingStatus } from '../../domain/booking.aggregate';

// The whole chain, through the real gate and the real outbox: Billing's SubscriptionSuspended →
// Booking's fan-out → one command per customer in shared.outbox → Notification → one email each,
// while the tenant is suspended (UC-121 O-B1, UC-123).
//
// `bus.publish()` resolves once the routing bus has delivered the event and everything it queued
// (the outbox relay's commands included), so each test asserts right after it, with no waiting.
// Every test publishes its own events and reads its own results: the fixtures are seeded once, the
// per-test state (the recorded emails and the tenant's outbox rows) is reset before each test.
const TENANT = '00000000-0000-7000-8000-0000000028a1';
const OTHER_TENANT = '00000000-0000-7000-8000-0000000028a2';
const FIXTURE_TENANTS = [TENANT, OTHER_TENANT];
const APPROVER = '00000000-0000-7000-8000-0000000028f1';
const CUSTOMER_1 = '00000000-0000-7000-8000-00000028c101';
const CUSTOMER_2 = '00000000-0000-7000-8000-00000028c102';
const CUSTOMER_PENDING = '00000000-0000-7000-8000-00000028c103';
const CUSTOMER_OTHER_TENANT = '00000000-0000-7000-8000-00000028c104';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Tenant unavailable notice, end to end (M25-S28)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let moduleRef: TestingModule;
  let bus: IEventBus;
  let access: InMemoryTenantAccessPort;
  let bookingRepo: IBookingRepository;
  const dispatcher = new InMemoryNotificationDispatcher();

  const recipients = (): string[] => dispatcher.dispatched.map((m) => m.to).sort();

  const suspensionEvent = () =>
    new SubscriptionSuspendedEventBuilder().withTenantId(TENANT).build();

  const commandKeys = async (): Promise<string[]> => {
    const rows: Array<{ dedup_key: string }> = await ds.query(
      `SELECT dedup_key FROM shared.outbox WHERE tenant_id = $1 AND event_name = 'TenantUnavailableNoticeDue' ORDER BY dedup_key`,
      [TENANT],
    );
    return rows.map((row) => row.dedup_key);
  };

  const seedBooking = async (
    tenantId: string,
    customerId: string | null,
    status = BookingStatus.APPROVED,
  ): Promise<void> => {
    const builder = new BookingBuilder()
      .withTenantId(tenantId)
      .withCustomerId(customerId)
      .withStatus(status)
      .withScheduledAt(new Date(Date.now() + 3 * DAY_MS))
      .withLines([]);
    if (status === BookingStatus.APPROVED) {
      builder.withApprovedAt(new Date()).withApprovedBy(APPROVER);
    }
    await bookingRepo.save(builder.build());
  };

  const seedCustomer = (tenantId: string, id: string, email: string, name: string) =>
    ds
      .getRepository(CustomerEntity)
      .save(
        new CustomerEntityBuilder()
          .withId(id)
          .withTenantId(tenantId)
          .withGoogleOAuthId(`google-${id}`)
          .withEmail(email)
          .withName(name)
          .build(),
      );

  // The tenants' ids are fixed and CI reuses one Postgres container across runs, so rows an earlier
  // aborted run left behind are cleared before seeding, and again at the end.
  const cleanup = async (): Promise<void> => {
    await ds.query(`DELETE FROM notification.notification_logs WHERE tenant_id = ANY($1)`, [
      FIXTURE_TENANTS,
    ]);
    await ds.query(`DELETE FROM shared.outbox WHERE tenant_id = ANY($1)`, [FIXTURE_TENANTS]);
    await ds.query(`DELETE FROM notification.notification_templates WHERE tenant_id = ANY($1)`, [
      FIXTURE_TENANTS,
    ]);
    await ds.query(`DELETE FROM booking.booking_status_transitions WHERE tenant_id = ANY($1)`, [
      FIXTURE_TENANTS,
    ]);
    await ds.query(`DELETE FROM booking.bookings WHERE tenant_id = ANY($1)`, [FIXTURE_TENANTS]);
    await ds.query(`DELETE FROM customer.customers WHERE tenant_id = ANY($1)`, [FIXTURE_TENANTS]);
    await ds.query(`DELETE FROM platform.tenants WHERE id = ANY($1)`, [FIXTURE_TENANTS]);
  };

  beforeAll(async () => {
    ({ app, ds, moduleRef } = await createBookingIntegrationApp({
      extraModules: [NotificationModule],
      extraEntities: [NotificationLogEntity, NotificationTemplateEntity],
      useRealOutbox: true,
      overrideProviders: [{ provide: NOTIFICATION_DISPATCHER, useValue: dispatcher }],
    }));
    bus = app.get<IEventBus>(EVENT_BUS);
    access = moduleRef.get<InMemoryTenantAccessPort>(TENANT_ACCESS_PORT);
    bookingRepo = moduleRef.get<IBookingRepository>(BOOKING_REPOSITORY);

    await cleanup();
    for (const [id, slug] of [
      [TENANT, 'notice-a'],
      [OTHER_TENANT, 'notice-b'],
    ]) {
      await ds
        .getRepository(TenantEntity)
        .save(
          new TenantEntityBuilder()
            .withId(id)
            .withName('Lava Rápido Central')
            .withSlug(`${slug}-${id}`)
            .build(),
        );
      await ds
        .getRepository(NotificationTemplateEntity)
        .save(
          new NotificationTemplateEntityBuilder()
            .withTenantId(id)
            .withTriggerEvent(NotificationTemplateKey.TENANT_UNAVAILABLE_CUSTOMER)
            .build(),
        );
    }
    await seedCustomer(TENANT, CUSTOMER_1, 'um@example.com', 'Cliente Um');
    await seedCustomer(TENANT, CUSTOMER_2, 'dois@example.com', 'Cliente Dois');
    await seedCustomer(TENANT, CUSTOMER_PENDING, 'pendente@example.com', 'Cliente Pendente');
    await seedCustomer(OTHER_TENANT, CUSTOMER_OTHER_TENANT, 'outro@example.com', 'Outro Tenant');

    await seedBooking(TENANT, CUSTOMER_1);
    await seedBooking(TENANT, CUSTOMER_1);
    await seedBooking(TENANT, CUSTOMER_2);
    await seedBooking(TENANT, null);
    await seedBooking(TENANT, CUSTOMER_PENDING, BookingStatus.PENDING);
    await seedBooking(OTHER_TENANT, CUSTOMER_OTHER_TENANT);
    access.seedSuspended(TENANT);
  });

  beforeEach(async () => {
    dispatcher.clear();
    await ds.query(`DELETE FROM shared.outbox WHERE tenant_id = ANY($1)`, [FIXTURE_TENANTS]);
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await app.close();
    }
  });

  it('emails each customer with an approved booking once, while the tenant is suspended', async () => {
    expect((await access.getAccess(TENANT)).operational).toBe(false);

    await bus.publish(suspensionEvent());

    expect(recipients()).toEqual(['dois@example.com', 'um@example.com']);
    expect(dispatcher.dispatched[0].body).toContain('temporariamente indisponível');
    expect(dispatcher.dispatched[0].body).not.toContain('{{');
  });

  it('emails nobody else: not the guest, the pending customer or another tenant customer', async () => {
    await bus.publish(suspensionEvent());

    expect(recipients()).not.toContain('pendente@example.com');
    expect(recipients()).not.toContain('outro@example.com');
    expect(dispatcher.dispatched).toHaveLength(2);
    expect(await commandKeys()).toHaveLength(2);
  });

  it('writes exactly one outbox command per customer, keyed on the suspension event', async () => {
    const event = suspensionEvent();

    await bus.publish(event);

    const keys = await commandKeys();
    expect(keys).toHaveLength(2);
    expect(keys.every((key) => key.includes(event.eventId))).toBe(true);
    expect(keys).toEqual([
      `TenantUnavailableNoticeDue:${TENANT}:${event.eventId}:${CUSTOMER_1}`,
      `TenantUnavailableNoticeDue:${TENANT}:${event.eventId}:${CUSTOMER_2}`,
    ]);
  });

  it('notifies again for a later suspension event: it is a new unavailability', async () => {
    await bus.publish(suspensionEvent());
    await bus.publish(suspensionEvent());

    expect(recipients()).toEqual([
      'dois@example.com',
      'dois@example.com',
      'um@example.com',
      'um@example.com',
    ]);
    expect(await commandKeys()).toHaveLength(4);
  });

  it('writes no second command and sends no second email when the same event is redelivered', async () => {
    const event = suspensionEvent();

    await bus.publish(event);
    await bus.publish(event);

    expect(await commandKeys()).toHaveLength(2);
    expect(recipients()).toEqual(['dois@example.com', 'um@example.com']);
  });
});
