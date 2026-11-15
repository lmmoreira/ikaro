import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import type { SubscriptionSuspended } from '../../../billing/domain/events/subscription-suspended.event';
import { SubscriptionSuspendedEventBuilder } from '../../../../test/builders/billing/subscription-suspended-event.builder';
import { BookingBuilder } from '../../../../test/builders/booking';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/customer-entity.builder';
import { NotificationTemplateEntityBuilder } from '../../../../test/builders/notification/notification-template-entity.builder';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import type { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { waitFor } from '../../../../test/utils/wait-for';
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
const TENANT = '00000000-0000-7000-8000-0000000028a1';
const OTHER_TENANT = '00000000-0000-7000-8000-0000000028a2';
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
  let laterEvent: SubscriptionSuspended;

  const recipients = (): string[] => dispatcher.dispatched.map((m) => m.to).sort();

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

  afterAll(async () => {
    const tenants = [TENANT, OTHER_TENANT];
    await ds.query(`DELETE FROM notification.notification_logs WHERE tenant_id = ANY($1)`, [
      tenants,
    ]);
    await ds.query(`DELETE FROM shared.outbox WHERE tenant_id = ANY($1)`, [tenants]);
    await ds.query(`DELETE FROM notification.notification_templates WHERE tenant_id = ANY($1)`, [
      tenants,
    ]);
    await ds.query(`DELETE FROM booking.booking_status_transitions WHERE tenant_id = ANY($1)`, [
      tenants,
    ]);
    await ds.query(`DELETE FROM booking.bookings WHERE tenant_id = ANY($1)`, [tenants]);
    await ds.query(`DELETE FROM customer.customers WHERE tenant_id = ANY($1)`, [tenants]);
    await ds.query(`DELETE FROM platform.tenants WHERE id = ANY($1)`, [tenants]);
    await app.close();
  });

  const suspensionEvent = () =>
    new SubscriptionSuspendedEventBuilder().withTenantId(TENANT).build();

  it('emails each customer with an approved booking once, while the tenant is suspended', async () => {
    expect((await access.getAccess(TENANT)).operational).toBe(false);

    await bus.publish(suspensionEvent());
    await waitFor(async () => dispatcher.dispatched.length >= 2);

    expect(recipients()).toEqual(['dois@example.com', 'um@example.com']);
    const body = dispatcher.dispatched[0].body;
    expect(body).toContain('temporariamente indisponível');
    expect(body).not.toContain('{{');
  });

  it('emails nobody else: not the guest, the pending customer or another tenant customer', async () => {
    expect(recipients()).not.toContain('pendente@example.com');
    expect(recipients()).not.toContain('outro@example.com');
    expect(dispatcher.dispatched).toHaveLength(2);
  });

  it('writes exactly one outbox command per customer, keyed on the suspension event', async () => {
    const rows: Array<{ dedup_key: string }> = await ds.query(
      `SELECT dedup_key FROM shared.outbox WHERE tenant_id = $1 AND event_name = 'TenantUnavailableNoticeDue'`,
      [TENANT],
    );

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.dedup_key)).size).toBe(2);
  });

  it('notifies again for a later suspension event: it is a new unavailability', async () => {
    laterEvent = suspensionEvent();

    await bus.publish(laterEvent);
    await waitFor(async () => dispatcher.dispatched.length >= 4);

    expect(recipients()).toEqual([
      'dois@example.com',
      'dois@example.com',
      'um@example.com',
      'um@example.com',
    ]);
    expect(await countCommands()).toBe(4);
  });

  it('writes no second command and sends no second email when that event is redelivered', async () => {
    await bus.publish(laterEvent);
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(await countCommands()).toBe(4);
    expect(dispatcher.dispatched).toHaveLength(4);
  });

  async function countCommands(): Promise<number> {
    const [{ n }] = await ds.query(
      `SELECT count(*)::int AS n FROM shared.outbox WHERE tenant_id = $1 AND event_name = 'TenantUnavailableNoticeDue'`,
      [TENANT],
    );
    return n;
  }
});
