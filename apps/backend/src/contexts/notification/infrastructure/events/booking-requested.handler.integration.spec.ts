import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { ServiceEntityBuilder } from '../../../../test/builders/booking/service-entity.builder';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/customer-entity.builder';
import { BookingEntity } from '../../../booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../../booking/infrastructure/entities/booking-line.entity';
import { ServiceEntity } from '../../../booking/infrastructure/entities/service.entity';
import { ScheduleClosureEntity } from '../../../booking/infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../../../booking/infrastructure/entities/schedule-opening.entity';
import { BookingModule } from '../../../booking/booking.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { waitFor } from '../../../../test/utils/wait-for';
import { BookingRequested } from '../../../booking/domain/events/booking-requested.event';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { StaffInvitedHandler } from './staff-invited.handler';

const PLATFORM_KEY = 'booking-notif-test-key-xxxxxxxxx';

// Suppress StaffInvitedHandler in this spec to prevent cross-test Pub/Sub interference.
// Both notification integration specs share a live Pub/Sub emulator and DB; if this spec
// subscribes to beloauto-StaffInvited, its handler would process events from the
// staff-invited spec and write notification logs under those eventIds. Those logs would
// then be found by the staff-invited spec's idempotency check, causing it to skip
// dispatching and fail its assertion.
const noOpStaffInvitedHandler = { onModuleInit: () => undefined, handle: async () => undefined };

const BOOKING_ENTITIES = [
  BookingEntity,
  BookingLineEntity,
  ServiceEntity,
  ScheduleClosureEntity,
  ScheduleOpeningEntity,
  CustomerEntity,
] as const;

describe('BookingRequestedHandler integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let eventBus: IEventBus;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['PUBSUB_SUBSCRIPTION_SUFFIX'] = `-bkr-${Date.now()}`;
    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds, eventBus } = await createNotificationIntegrationApp({
      dispatcher,
      configure: (b) => b.overrideProvider(StaffInvitedHandler).useValue(noOpStaffInvitedHandler),
      extraModules: [BookingModule],
      extraEntities: [...BOOKING_ENTITIES],
      withTenantInterceptor: true,
    }));
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['PUBSUB_SUBSCRIPTION_SUFFIX'];
  });

  afterEach(() => {
    dispatcher.clear();
  });

  it('BookingRequested (guest) → admin + customer emails dispatched + two log rows written', async () => {
    const slug = `bkr-guest-${Date.now()}`;
    const adminEmail = `admin-guest-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({ name: 'Lava Car Guest', slug, adminEmail, timezone: 'America/Sao_Paulo' })
      .expect(201);

    const tenantId: string = body.tenantId;

    // Wait for the manager staff record — confirms TenantProvisioned → CreateInitialManager
    // completed. Querying directly avoids writing a STAFF_INVITED log here, which would
    // conflict with the staff-invited integration spec running concurrently.
    await waitFor(async () => {
      const staff = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId, role: 'MANAGER' } });
      return staff !== null;
    });

    const service = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Lavagem Completa')
      .withDurationMinutes(60)
      .build();
    await ds.getRepository(ServiceEntity).save(service);

    const guestEmail = `guest-${Date.now()}@example.com`;

    await request(app.getHttpServer())
      .post('/bookings')
      .set('X-Tenant-ID', tenantId)
      .send({
        guestEmail,
        guestName: 'João Silva',
        guestPhone: '31999999999',
        scheduledAt: '2026-06-15T13:00:00.000Z',
        serviceIds: [service.id],
      })
      .expect(201);

    await waitFor(async () => {
      const logs = await ds.getRepository(NotificationLogEntity).find({ where: { tenantId } });
      return logs.filter((l) => l.notificationType.startsWith('BOOKING_REQUESTED')).length >= 2;
    });

    const logs = await ds.getRepository(NotificationLogEntity).find({ where: { tenantId } });
    const types = logs.map((l) => l.notificationType);
    expect(types).toContain('BOOKING_REQUESTED_ADMIN');
    expect(types).toContain('BOOKING_REQUESTED_CUSTOMER');

    const adminMsg = dispatcher.dispatched.find((m) => m.templateKey === 'booking-requested-admin');
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.to).toBe(adminEmail);
    expect(adminMsg!.subject).toContain('Nova solicitação de agendamento');
    expect(adminMsg!.subject).toContain('Lavagem Completa');

    const customerMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-requested-customer',
    );
    expect(customerMsg).toBeDefined();
    expect(customerMsg!.to).toBe(guestEmail);
    expect(customerMsg!.subject).toBe('Seu agendamento foi recebido');
  });

  it('BookingRequested (authenticated customer) → admin + customer emails dispatched + two log rows written', async () => {
    const slug = `bkr-cust-${Date.now()}`;
    const adminEmail = `admin-cust-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({ name: 'Lava Car Customer', slug, adminEmail, timezone: 'America/Sao_Paulo' })
      .expect(201);

    const tenantId: string = body.tenantId;

    await waitFor(async () => {
      const staff = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId, role: 'MANAGER' } });
      return staff !== null;
    });

    const service = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Polimento')
      .withDurationMinutes(90)
      .build();
    await ds.getRepository(ServiceEntity).save(service);

    const customerId = uuidv7();
    const customerEmail = `customer-${Date.now()}@example.com`;
    await ds
      .getRepository(CustomerEntity)
      .save(
        new CustomerEntityBuilder()
          .withId(customerId)
          .withTenantId(tenantId)
          .withEmail(customerEmail)
          .withPhone('31888888888')
          .build(),
      );

    await request(app.getHttpServer())
      .post('/bookings/authenticated')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', customerId)
      .set('X-Actor-Type', 'CUSTOMER')
      .set('X-Actor-Role', 'CUSTOMER')
      .send({
        scheduledAt: '2026-06-16T10:00:00.000Z',
        serviceIds: [service.id],
      })
      .expect(201);

    await waitFor(async () => {
      const logs = await ds.getRepository(NotificationLogEntity).find({ where: { tenantId } });
      return logs.filter((l) => l.notificationType.startsWith('BOOKING_REQUESTED')).length >= 2;
    });

    const logs = await ds.getRepository(NotificationLogEntity).find({ where: { tenantId } });
    const types = logs.map((l) => l.notificationType);
    expect(types).toContain('BOOKING_REQUESTED_ADMIN');
    expect(types).toContain('BOOKING_REQUESTED_CUSTOMER');

    const adminMsg = dispatcher.dispatched.find((m) => m.templateKey === 'booking-requested-admin');
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.to).toBe(adminEmail);

    const customerMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-requested-customer',
    );
    expect(customerMsg).toBeDefined();
    expect(customerMsg!.to).toBe(customerEmail);
    expect(customerMsg!.subject).toBe('Seu agendamento foi recebido');
  });

  it('is idempotent: re-delivery of same eventId produces exactly 2 log rows total', async () => {
    const slug = `bkr-idem-${Date.now()}`;
    const adminEmail = `admin-idem-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({ name: 'Idem Test', slug, adminEmail, timezone: 'America/Sao_Paulo' })
      .expect(201);

    const tenantId: string = body.tenantId;

    await waitFor(async () => {
      const staff = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId, role: 'MANAGER' } });
      return staff !== null;
    });

    // Publish a synthetic BookingRequested directly to test handler idempotency
    // without the overhead of the full booking flow.
    const guestEmail = `idem-guest-${Date.now()}@example.com`;
    const event = new BookingRequested(tenantId, 'corr-idem-1', {
      bookingId: 'bbbbbbbb-2222-4000-8000-000000000001',
      type: 'GUEST',
      customerId: null,
      guestEmail,
      guestName: 'Maria',
      guestPhone: '+5531999999999',
      guestAddress: null,
      scheduledAt: '2026-07-01T13:00:00.000Z',
      totalDurationMins: 30,
      totalPrice: { amount: '80.00', currency: 'BRL' },
      requiresPickup: false,
      pickupAddress: null,
      lines: [
        {
          lineId: 'cccccccc-2222-4000-8000-000000000001',
          serviceId: 'dddddddd-2222-4000-8000-000000000001',
          serviceNameAtBooking: 'Lavagem Simples',
          priceAtBooking: { amount: '80.00', currency: 'BRL' },
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 0,
          requiresPickupAddressAtBooking: false,
        },
      ],
      beforeServicePhotoUrls: [],
    });

    await eventBus.publish(event);
    await waitFor(async () => {
      const logs = await ds
        .getRepository(NotificationLogEntity)
        .find({ where: { tenantId, eventId: event.eventId } });
      return logs.length >= 2;
    });

    const bookingTemplates = ['booking-requested-admin', 'booking-requested-customer'];
    const countBeforeRedeliver = dispatcher.dispatched.filter((m) =>
      bookingTemplates.includes(m.templateKey),
    ).length;

    await eventBus.publish(event);

    const redeliveryDeadline = Date.now() + 2000;
    await waitFor(async () => {
      const bookingCount = dispatcher.dispatched.filter((m) =>
        bookingTemplates.includes(m.templateKey),
      ).length;
      if (bookingCount > countBeforeRedeliver) {
        throw new Error('Idempotency broken: new email dispatched after re-delivery');
      }
      return Date.now() >= redeliveryDeadline;
    });

    const logs = await ds
      .getRepository(NotificationLogEntity)
      .find({ where: { tenantId, eventId: event.eventId } });

    expect(logs).toHaveLength(2);
  });
});
