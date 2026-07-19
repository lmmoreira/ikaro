import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ServiceEntityBuilder } from '../../../test/builders/booking/index';
import { InMemoryNotificationDispatcher } from '../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../test/utils/notification-integration-app';
import { futureDate } from '../../../test/utils/date-helpers';
import { actorHeaders } from '../../../test/utils/actor-headers';
import { BookingModule } from '../../../contexts/booking/booking.module';
import { BookingEntity } from '../../../contexts/booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../../contexts/booking/infrastructure/entities/booking-line.entity';
import { ScheduleClosureEntity } from '../../../contexts/booking/infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../../../contexts/booking/infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from '../../../contexts/booking/infrastructure/entities/service.entity';
import { CustomerEntity } from '../../../contexts/customer/infrastructure/entities/customer.entity';
import { NotificationLogEntity } from '../../../contexts/notification/infrastructure/entities/notification-log.entity';
import { OutboxEventEntity } from './outbox-event.entity';

const PLATFORM_KEY = 'outbox-full-topology-test-key-xxxxxx';

const BOOKING_ENTITIES = [
  BookingEntity,
  BookingLineEntity,
  ServiceEntity,
  ScheduleClosureEntity,
  ScheduleOpeningEntity,
  CustomerEntity,
] as const;

// TD24-S02 — the one new test exercising the *production* pipeline shape end-to-end: a real HTTP
// booking approval → TypeOrmBookingRepository.save() drains via the real OUTBOX_PUBLISHER (not
// bypassed like every other flow test) → a real shared.outbox row → OutboxRelayService's inline
// dispatch (via EVENT_BUS, overridden here to the routing bus so it reaches a real subscriber
// without needing actual Pub/Sub) → BookingApprovedHandler → NotificationLog row. Flow tests
// elsewhere bypass the real outbox table by design (S02 dual-token override); the abstract
// OutboxPublisher/OutboxRelayService guarantees are S01's job. This is the only test proving the
// two wire up correctly together — catching envelope-serialization drift through the JSONB
// round-trip that neither of the others can.
describe('Outbox full topology: booking approval → real outbox → relay → notification (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantId: string;
  let serviceId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'outbox-full-topology-test-secret-32ch';

    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds } = await createNotificationIntegrationApp({
      dispatcher,
      extraModules: [BookingModule],
      extraEntities: [...BOOKING_ENTITIES],
      withRequestInterceptor: true,
      useRealOutbox: true,
    }));

    const slug = `outbox-topology-${Date.now()}`;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: 'Outbox Full Topology',
        slug,
        adminEmail: `admin-${Date.now()}@lavacar.com.br`,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    tenantId = body.tenantId as string;

    const svc = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Lavagem Completa')
      .withPriceAmount('100.00')
      .withDurationMinutes(30)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save(svc);
    serviceId = svc.id;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['JWT_SECRET'];
    await app.close();
  });

  it('drives one booking approval end-to-end through the real outbox and relay to a notification log', async () => {
    const contactEmail = 'joao-full-topology@example.com';
    const { body: created } = await request(app.getHttpServer())
      .post('/bookings')
      .set({ 'x-tenant-id': tenantId, 'x-correlation-id': 'outbox-full-topology-corr' })
      .send({
        contactEmail,
        contactName: 'João Silva',
        contactPhone: '+5531999999999',
        scheduledAt: `${futureDate(2)}T13:00:00.000Z`,
        serviceIds: [serviceId],
      })
      .expect(201);

    const staffId = '20000000-0000-4000-8000-000000009901';
    await request(app.getHttpServer())
      .patch(`/bookings/${created.bookingId}/approve`)
      .set(actorHeaders(tenantId, staffId, 'MANAGER'))
      .send({})
      .expect(200);

    // Inline dispatch is awaited inside the after-commit callback — by the time the HTTP call
    // above resolved, the real outbox row was already written AND relayed.
    const outboxRows = await ds
      .getRepository(OutboxEventEntity)
      .find({ where: { tenantId, eventName: 'BookingApproved' } });
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].publishedAt).not.toBeNull();
    const payload = outboxRows[0].payload as {
      eventName: string;
      tenantId: string;
      data: { bookingId: string };
    };
    expect(payload.eventName).toBe('BookingApproved');
    expect(payload.tenantId).toBe(tenantId);
    expect(payload.data.bookingId).toBe(created.bookingId);

    const logs = await ds
      .getRepository(NotificationLogEntity)
      .find({ where: { tenantId, recipientEmail: contactEmail } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.status === 'SENT')).toBe(true);
  });
});
