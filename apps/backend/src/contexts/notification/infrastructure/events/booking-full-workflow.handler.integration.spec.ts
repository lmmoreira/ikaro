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
import { waitFor } from '../../../../test/utils/wait-for';

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

describe('Story: full booking lifecycle → Pub/Sub → all notification emails dispatched (integration)', () => {
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
    process.env['PUBSUB_SUBSCRIPTION_SUFFIX'] = `-bfw-${Date.now()}`;
    process.env['JWT_SECRET'] = 'booking-full-workflow-notif-test-secret-32c';

    dispatcher = new InMemoryNotificationDispatcher();
    // All handlers active — single app instance prevents cross-spec Pub/Sub contamination.
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
      .send({ name: 'Full Workflow Notif', slug, adminEmail, timezone: 'America/Sao_Paulo' })
      .expect(201);

    tenantId = body.tenantId as string;

    // Wait for both manager record AND STAFF_INVITED notification so the provisioning
    // noise is fully drained before the it() block starts accumulating messages.
    await waitFor(async () => {
      const staff = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId, role: 'MANAGER' } });
      if (!staff) return false;
      const log = await ds
        .getRepository(NotificationLogEntity)
        .findOne({ where: { tenantId, notificationType: 'STAFF_INVITED' } });
      return log !== null;
    });

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
    delete process.env['PUBSUB_SUBSCRIPTION_SUFFIX'];
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
    const guestEmail = `guest-bfw-${Date.now()}@example.com`;
    const { body: b2 } = await request(app.getHttpServer())
      .post('/bookings')
      .set('X-Tenant-ID', tenantId)
      .send({
        guestEmail,
        guestName: 'Ana Costa',
        guestPhone: '31998765432',
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

    // 7. Admin cancels booking1 (APPROVED → CANCELLED) → BookingCancelled
    await request(app.getHttpServer())
      .patch(`/bookings/${booking1Id}/cancel-admin`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .send({ reason: 'Schedule conflict' })
      .expect(200);

    // 8. Create booking3 (guest) for reschedule test
    const booking3GuestEmail = `guest3-bfw-${Date.now()}@example.com`;
    const { body: b3 } = await request(app.getHttpServer())
      .post('/bookings')
      .set('X-Tenant-ID', tenantId)
      .send({
        guestEmail: booking3GuestEmail,
        guestName: 'Pedro Santos',
        guestPhone: '31997654321',
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

    // 10. Reschedule booking3 (APPROVED, new slot) → BookingRescheduled
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

    // Wait for all 20 notification logs:
    //   1x STAFF_INVITED
    //   2x BOOKING_REQUESTED_* (booking1) + 2x (booking2) + 2x (booking3) + 2x (booking4) = 8
    //   1x BOOKING_INFO_REQUESTED_CUSTOMER
    //   1x BOOKING_INFO_SUBMITTED_ADMIN
    //   1x BOOKING_APPROVED_CUSTOMER (booking1) + 1x (booking3) + 1x (booking4) = 3
    //   1x BOOKING_REJECTED_CUSTOMER
    //   2x BOOKING_CANCELLED_* (booking1)
    //   2x BOOKING_RESCHEDULED_* (booking3)
    //   1x SERVICE_POINTS_EARNED (booking4 completed by authenticated customer)
    await waitFor(async () => {
      const logs = await ds.getRepository(NotificationLogEntity).find({ where: { tenantId } });
      return logs.length >= 20;
    });

    // Assert all notification types present in DB
    const logs = await ds.getRepository(NotificationLogEntity).find({ where: { tenantId } });
    const logTypes = logs.map((l) => l.notificationType);
    expect(logTypes).toContain('STAFF_INVITED');
    expect(logTypes).toContain('BOOKING_REQUESTED_ADMIN');
    expect(logTypes).toContain('BOOKING_REQUESTED_CUSTOMER');
    expect(logTypes).toContain('BOOKING_INFO_REQUESTED_CUSTOMER');
    expect(logTypes).toContain('BOOKING_INFO_SUBMITTED_ADMIN');
    expect(logTypes).toContain('BOOKING_APPROVED_CUSTOMER');
    expect(logTypes).toContain('BOOKING_REJECTED_CUSTOMER');
    expect(logTypes).toContain('BOOKING_CANCELLED_CUSTOMER');
    expect(logTypes).toContain('BOOKING_CANCELLED_ADMIN');
    expect(logTypes).toContain('BOOKING_RESCHEDULED_CUSTOMER');
    expect(logTypes).toContain('BOOKING_RESCHEDULED_ADMIN');
    expect(logTypes).toContain('SERVICE_POINTS_EARNED');

    // Assert recipients
    // Filter by adminEmail to guard against StaffInvited events from other parallel test suites.
    const staffMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'staff-invitation' && m.to === adminEmail,
    );
    expect(staffMsg).toBeDefined();

    const requestedAdminMsgs = dispatcher.dispatched.filter(
      (m) => m.templateKey === 'booking-requested-admin',
    );
    expect(requestedAdminMsgs).toHaveLength(4);
    expect(requestedAdminMsgs.every((m) => m.to === adminEmail)).toBe(true);

    const requestedCustomerMsgs = dispatcher.dispatched.filter(
      (m) => m.templateKey === 'booking-requested-customer',
    );
    expect(requestedCustomerMsgs).toHaveLength(4);

    const infoReqMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-info-requested-customer',
    );
    expect(infoReqMsg).toBeDefined();
    expect(infoReqMsg!.to).toBe(customerEmail);

    const infoSubmitMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-info-submitted-admin',
    );
    expect(infoSubmitMsg).toBeDefined();
    expect(infoSubmitMsg!.to).toBe(adminEmail);

    const approvedMsgs = dispatcher.dispatched.filter(
      (m) => m.templateKey === 'booking-approved-customer',
    );
    expect(approvedMsgs).toHaveLength(3);
    const approvedRecipients = approvedMsgs.map((m) => m.to);
    expect(approvedRecipients).toContain(customerEmail);
    expect(approvedRecipients).toContain(booking3GuestEmail);

    const rejectedMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-rejected-customer',
    );
    expect(rejectedMsg).toBeDefined();
    expect(rejectedMsg!.to).toBe(guestEmail);

    const cancelledCustomerMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-cancelled-customer',
    );
    expect(cancelledCustomerMsg).toBeDefined();
    expect(cancelledCustomerMsg!.to).toBe(customerEmail);

    const cancelledAdminMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-cancelled-admin',
    );
    expect(cancelledAdminMsg).toBeDefined();
    expect(cancelledAdminMsg!.to).toBe(adminEmail);
    expect(cancelledAdminMsg!.data['isBusiness']).toBe(true);

    const rescheduledCustomerMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-rescheduled-customer',
    );
    expect(rescheduledCustomerMsg).toBeDefined();
    expect(rescheduledCustomerMsg!.to).toBe(booking3GuestEmail);

    const rescheduledAdminMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-rescheduled-admin',
    );
    expect(rescheduledAdminMsg).toBeDefined();
    expect(rescheduledAdminMsg!.to).toBe(adminEmail);

    // booking4 completed: full chain BookingCompleted → ServicePointsEarned → thank-you email
    const pointsMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'service-points-earned' && m.to === customerEmail,
    );
    expect(pointsMsg).toBeDefined();
    expect(pointsMsg!.data['totalPointsEarned']).toBe(10);
    expect(pointsMsg!.data['currentBalance']).toBe(10);
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
    await waitFor(async () => {
      const log = await ds.getRepository(NotificationLogEntity).findOne({
        where: { tenantId, eventId: event.eventId, notificationType: 'SERVICE_POINTS_EARNED' },
      });
      return log !== null;
    });

    await eventBus.publish(event);
    await new Promise((r) => setTimeout(r, 400));

    const idempotencyLogs = await ds.getRepository(NotificationLogEntity).find({
      where: { tenantId, eventId: event.eventId, notificationType: 'SERVICE_POINTS_EARNED' },
    });
    expect(idempotencyLogs).toHaveLength(1);
  });
});
