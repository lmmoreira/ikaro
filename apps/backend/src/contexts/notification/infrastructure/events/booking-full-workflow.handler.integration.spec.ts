import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
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
import { LoyaltyModule } from '../../../loyalty/loyalty.module';
import { LoyaltyEntryEntity } from '../../../loyalty/infrastructure/entities/loyalty-entry.entity';
import { LoyaltyBalanceEntity } from '../../../loyalty/infrastructure/entities/loyalty-balance.entity';
import { LoyaltyRedemptionEntity } from '../../../loyalty/infrastructure/entities/loyalty-redemption.entity';
import { BalanceExpiryLogEntity } from '../../../loyalty/infrastructure/entities/balance-expiry-log.entity';
import { ProcessedEventEntity } from '../../../loyalty/infrastructure/entities/processed-event.entity';
import { ServicePointsEarned } from '../../../loyalty/domain/events/service-points-earned.event';

const PLATFORM_KEY = 'full-workflow-notif-key-xxxxxxxxxx';

const BOOKING_ENTITIES = [
  BookingEntity,
  BookingLineEntity,
  ServiceEntity,
  ScheduleClosureEntity,
  ScheduleOpeningEntity,
  CustomerEntity,
] as const;

const LOYALTY_ENTITIES = [
  LoyaltyEntryEntity,
  LoyaltyBalanceEntity,
  LoyaltyRedemptionEntity,
  BalanceExpiryLogEntity,
  ProcessedEventEntity,
] as const;

describe('Story: full booking lifecycle → event bus → all notification emails dispatched (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dispatcher: InMemoryNotificationDispatcher;
  let eventBus: IEventBus;
  let tenantId: string;
  let adminEmail: string;
  let staffId: string;
  let customerId: string;
  let customerEmail: string;
  let serviceId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'booking-full-workflow-notif-test-secret-32c';

    dispatcher = new InMemoryNotificationDispatcher();
    ({ app, ds } = await createNotificationIntegrationApp({
      dispatcher,
      extraModules: [BookingModule, LoyaltyModule],
      extraEntities: [...BOOKING_ENTITIES, ...LOYALTY_ENTITIES],
      withTenantInterceptor: true,
    }));

    eventBus = app.get<IEventBus>(EVENT_BUS);

    const slug = `bfw-${Date.now()}`;
    adminEmail = `admin-bfw-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({ name: 'Full Workflow Notif', slug, adminEmail, country_code: 'BR', timezone: 'America/Sao_Paulo' })
      .expect(201);

    tenantId = body.tenantId as string;

    // RoutingInMemoryEventBus is synchronous — the full TenantProvisioned → StaffInvited chain
    // (including the staff-invitation email) is complete when 201 returns.
    const manager = await ds
      .getRepository(StaffEntity)
      .findOne({ where: { tenantId, role: 'MANAGER' } });
    staffId = manager!.id;

    const service = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Lavagem Premium')
      .withDurationMinutes(60)
      .withLoyaltyPointsValue(10)
      .build();
    await ds.getRepository(ServiceEntity).save(service);
    serviceId = service.id;

    customerId = uuidv7();
    customerEmail = `customer-bfw-${Date.now()}@example.com`;
    await ds
      .getRepository(CustomerEntity)
      .save(
        new CustomerEntityBuilder()
          .withId(customerId)
          .withTenantId(tenantId)
          .withEmail(customerEmail)
          .withPhone('31999888777')
          .build(),
      );
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['JWT_SECRET'];
  });

  it('full booking lifecycle: STAFF_INVITED + all 6 booking notification types + SERVICE_POINTS_EARNED dispatched', async () => {
    // 1. Authenticated customer creates booking
    const { body: b1 } = await request(app.getHttpServer())
      .post('/bookings/authenticated')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', customerId)
      .set('X-Actor-Type', 'CUSTOMER')
      .set('X-Actor-Role', 'CUSTOMER')
      .send({ scheduledAt: '2026-07-01T10:00:00.000Z', serviceIds: [serviceId] })
      .expect(201);

    const booking1Id = b1.bookingId as string;

    // 2. Staff requests more info (booking1: PENDING → INFO_REQUESTED)
    await request(app.getHttpServer())
      .patch(`/bookings/${booking1Id}/request-info`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .send({ message: 'Please provide clear photos of the vehicle damage area' })
      .expect(200);

    // 3. Customer submits info (booking1: INFO_REQUESTED → PENDING)
    await request(app.getHttpServer())
      .patch(`/bookings/${booking1Id}/submit-info`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', customerId)
      .set('X-Actor-Type', 'CUSTOMER')
      .set('X-Actor-Role', 'CUSTOMER')
      .send({ response: 'Here are the photos you requested' })
      .expect(200);

    // 4. Staff approves (booking1: PENDING → APPROVED)
    await request(app.getHttpServer())
      .patch(`/bookings/${booking1Id}/approve`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    // 5. Guest creates a second booking (for rejection flow)
    const contactEmail = `guest-bfw-${Date.now()}@example.com`;
    const { body: b2 } = await request(app.getHttpServer())
      .post('/bookings')
      .set('X-Tenant-ID', tenantId)
      .send({
        contactEmail,
        contactName: 'Ana Costa',
        contactPhone: '31998765432',
        scheduledAt: '2026-07-02T14:00:00.000Z',
        serviceIds: [serviceId],
      })
      .expect(201);

    const booking2Id = b2.bookingId as string;

    // 6. Staff rejects guest booking (booking2: PENDING → REJECTED)
    await request(app.getHttpServer())
      .patch(`/bookings/${booking2Id}/reject`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .send({ reason: 'Selected slot is no longer available at that date' })
      .expect(200);

    // 7. Admin cancels booking1 (APPROVED → CANCELLED)
    await request(app.getHttpServer())
      .patch(`/bookings/${booking1Id}/cancel-admin`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .send({ reason: 'Schedule conflict' })
      .expect(200);

    // 8. Guest creates booking3 for reschedule test
    const booking3GuestEmail = `guest3-bfw-${Date.now()}@example.com`;
    const { body: b3 } = await request(app.getHttpServer())
      .post('/bookings')
      .set('X-Tenant-ID', tenantId)
      .send({
        contactEmail: booking3GuestEmail,
        contactName: 'Pedro Santos',
        contactPhone: '31997654321',
        scheduledAt: '2026-07-03T10:00:00.000Z',
        serviceIds: [serviceId],
      })
      .expect(201);
    const booking3Id = b3.bookingId as string;

    // 9. Approve booking3
    await request(app.getHttpServer())
      .patch(`/bookings/${booking3Id}/approve`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    // 10. Reschedule booking3 → BookingRescheduled
    await request(app.getHttpServer())
      .patch(`/bookings/${booking3Id}/reschedule`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .send({ scheduledAt: '2026-07-07T10:00:00.000Z' })
      .expect(200);

    // 11. Authenticated customer creates booking4 → approve → complete
    //     Full chain: BookingCompleted → RecordLoyaltyEntries → ServicePointsEarned → email
    const { body: b4 } = await request(app.getHttpServer())
      .post('/bookings/authenticated')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', customerId)
      .set('X-Actor-Type', 'CUSTOMER')
      .set('X-Actor-Role', 'CUSTOMER')
      .send({ scheduledAt: '2026-07-08T10:00:00.000Z', serviceIds: [serviceId] })
      .expect(201);
    const booking4Id = b4.bookingId as string;

    await request(app.getHttpServer())
      .patch(`/bookings/${booking4Id}/approve`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    const { body: bk4 } = await request(app.getHttpServer())
      .get(`/bookings/${booking4Id}`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/bookings/${booking4Id}/complete`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .send({
        lines: (bk4.lines as Array<{ lineId: string; priceAtBooking: { amount: number } }>).map(
          (l) => ({ lineId: l.lineId, actualPriceCharged: l.priceAtBooking.amount }),
        ),
        afterServicePhotoUrls: [],
      })
      .expect(200);

    // RoutingInMemoryEventBus is synchronous — after the last HTTP call every notification
    // (including the 2-hop BookingCompleted → ServicePointsEarned chain) is already dispatched.

    // Assert all notification types present in DB
    const logs = await ds.getRepository(NotificationLogEntity).find({ where: { tenantId } });
    const logTypes = logs.map((l) => l.notificationType);
    expect(logTypes).toContain('staff-invitation');
    expect(logTypes).toContain('booking-requested-admin');
    expect(logTypes).toContain('booking-requested-customer');
    expect(logTypes).toContain('booking-info-requested-customer');
    expect(logTypes).toContain('booking-info-submitted-admin');
    expect(logTypes).toContain('booking-approved-customer');
    expect(logTypes).toContain('booking-rejected-customer');
    expect(logTypes).toContain('booking-cancelled-customer');
    expect(logTypes).toContain('booking-cancelled-admin');
    expect(logTypes).toContain('booking-rescheduled-customer');
    expect(logTypes).toContain('booking-rescheduled-admin');
    expect(logTypes).toContain('service-points-earned');

    // Assert recipients
    const d = dispatcher.dispatched;

    const staffMsg = d.find((m) => m.subject.includes('convidado') && m.to === adminEmail);
    expect(staffMsg).toBeDefined();

    const requestedAdminMsgs = d.filter(
      (m) =>
        (m.to === adminEmail && m.subject.includes('agendamento recebido')) ||
        (m.to === adminEmail && m.subject.includes('Novo agendamento')),
    );
    expect(requestedAdminMsgs.length).toBeGreaterThanOrEqual(1);

    const requestedCustomerMsgs = d.filter(
      (m) =>
        m.subject.includes('Solicitação de agendamento') ||
        m.subject.includes('agendamento foi recebido'),
    );
    expect(requestedCustomerMsgs.length).toBeGreaterThanOrEqual(1);

    const infoReqMsg = d.find(
      (m) =>
        m.to === customerEmail &&
        (m.subject.includes('informações') || m.subject.includes('mais informações')),
    );
    expect(infoReqMsg).toBeDefined();

    const infoSubmitMsg = d.find((m) => m.to === adminEmail && m.subject.includes('respondeu'));
    expect(infoSubmitMsg).toBeDefined();

    const approvedMsgs = d.filter((m) => m.subject.includes('confirmado'));
    expect(approvedMsgs.map((m) => m.to)).toContain(customerEmail);

    const rejectedMsg = d.find(
      (m) =>
        m.to === contactEmail &&
        (m.subject.includes('não confirmado') || m.subject.includes('pedido')),
    );
    expect(rejectedMsg).toBeDefined();

    const cancelledCustomerMsg = d.find(
      (m) => m.to === customerEmail && m.subject.includes('cancelado'),
    );
    expect(cancelledCustomerMsg).toBeDefined();

    const cancelledAdminMsg = d.find(
      (m) =>
        m.to === adminEmail &&
        m.subject.includes('cancelado') &&
        m.subject !== cancelledCustomerMsg?.subject,
    );
    expect(cancelledAdminMsg).toBeDefined();

    const rescheduledCustomerMsg = d.find(
      (m) => m.to === booking3GuestEmail && m.subject.includes('reagendado'),
    );
    expect(rescheduledCustomerMsg).toBeDefined();

    const rescheduledAdminMsg = d.find(
      (m) => m.to === adminEmail && m.subject.includes('reagendado'),
    );
    expect(rescheduledAdminMsg).toBeDefined();

    const pointsMsg = d.find((m) => m.to === customerEmail && m.subject.includes('pontos'));
    expect(pointsMsg).toBeDefined();
  });

  it('ServicePointsEarned: is idempotent — replaying same event produces only one notification log', async () => {
    const event = new ServicePointsEarned(tenantId, uuidv7(), {
      customerId,
      bookingId: uuidv7(),
      totalPointsEarned: 5,
      earnedAt: new Date().toISOString(),
      lines: [
        {
          entryId: uuidv7(),
          serviceId,
          pointsEarned: 5,
          expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      currentBalance: 15,
    });

    await eventBus.publish(event);

    const logAfterFirst = await ds.getRepository(NotificationLogEntity).findOne({
      where: { tenantId, eventId: event.eventId, notificationType: 'service-points-earned' },
    });
    expect(logAfterFirst).not.toBeNull();

    // Second publish with same eventId — isAlreadySent finds processedEvent → skips.
    await eventBus.publish(event);

    const idempotencyLogs = await ds.getRepository(NotificationLogEntity).find({
      where: { tenantId, eventId: event.eventId, notificationType: 'service-points-earned' },
    });
    expect(idempotencyLogs).toHaveLength(1);
  });
});
