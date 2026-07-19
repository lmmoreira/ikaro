import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  AdminDailyScheduleReminderCommandBuilder,
  BookingReminderDueCommandBuilder,
  BookingReminderDueTodayCommandBuilder,
} from '../../../../test/builders/booking';
import { NOTIFICATION_LOG_REPOSITORY } from '../../application/ports/notification-log-repository.port';
import { INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { InMemoryNotificationLogRepository } from '../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';

const PLATFORM_KEY = 'reminder-integration-test-key-xxxxxxxxxx';

describe('Reminder handlers (event bus → handler → use case) integration', () => {
  let app: INestApplication;
  let dispatcher: InMemoryNotificationDispatcher;
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let eventBus: IEventBus;
  let tenantId: string;
  let adminEmail: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] =
      'reminder-integration-test-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxx';

    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();

    ({ app, eventBus } = await createNotificationIntegrationApp({
      dispatcher,
      withRequestInterceptor: true,
      configure: (builder) =>
        builder
          .overrideProvider(NOTIFICATION_LOG_REPOSITORY)
          .useValue(logRepo)
          .overrideProvider(INBOX_REPOSITORY)
          .useValue(inboxRepo),
    }));

    const slug = `reminder-${Date.now()}`;
    adminEmail = `admin-reminder-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: 'Reminder Integration',
        slug,
        adminEmail,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);

    tenantId = body.tenantId as string;
    // RoutingInMemoryEventBus is synchronous — staff-invitation is already in logRepo when 201 returns.
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['JWT_SECRET'];
  });

  afterEach(() => {
    dispatcher.clear();
    logRepo.clear();
    inboxRepo.clear();
  });

  it('BookingReminderDue → writes log and dispatches day-before email', async () => {
    const event = new BookingReminderDueCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withBookingId(uuidv7())
      .withCustomerId(uuidv7())
      .withLines([{ serviceId: uuidv7(), serviceName: 'Lavagem Completa' }])
      .build();

    await eventBus.publish(event);

    expect(
      logRepo.all.some(
        (l) => l.eventId === event.eventId && l.notificationType === 'booking-reminder-due',
      ),
    ).toBe(true);
    expect(
      dispatcher.dispatched.some(
        (m) => m.to === 'joao@example.com' && m.subject.includes('amanhã'),
      ),
    ).toBe(true);
  });

  it('BookingReminderDueToday → writes log and dispatches day-of email', async () => {
    const event = new BookingReminderDueTodayCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withBookingId(uuidv7())
      .withLines([{ serviceId: uuidv7(), serviceName: 'Polimento' }])
      .build();

    await eventBus.publish(event);

    expect(
      logRepo.all.some(
        (l) => l.eventId === event.eventId && l.notificationType === 'booking-reminder-due-today',
      ),
    ).toBe(true);
    expect(
      dispatcher.dispatched.some((m) => m.to === 'maria@example.com' && m.subject.includes('hoje')),
    ).toBe(true);
  });

  it('AdminDailyScheduleReminder → writes log and dispatches to manager email', async () => {
    const event = new AdminDailyScheduleReminderCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withBookingsToday([
        {
          bookingId: uuidv7(),
          customerName: 'Carlos Mendes',
          customerPhone: '+5531988880000',
          lines: [{ serviceId: uuidv7(), serviceName: 'Lavagem Completa' }],
          appointmentSlot: {
            startTime: '2026-07-02T13:00:00.000Z',
            endTime: '2026-07-02T14:00:00.000Z',
          },
          adminNotes: null,
        },
      ])
      .build();

    await eventBus.publish(event);

    expect(
      logRepo.all.some(
        (l) =>
          l.eventId === event.eventId && l.notificationType === 'admin-daily-schedule-reminder',
      ),
    ).toBe(true);
    expect(
      dispatcher.dispatched.some((m) => m.to === adminEmail && m.subject.includes('Agenda do dia')),
    ).toBe(true);
  });

  it('BookingReminderDue dispatch failure → FAILED log written; explicit retry delivers email', async () => {
    const event = new BookingReminderDueCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withBookingId(uuidv7())
      .withCustomerId(uuidv7())
      .withRecipientEmail('fail-test@example.com')
      .withCustomerName('Fail Test')
      .withScheduledAt('2026-07-05T10:00:00.000Z')
      .withAppointmentSlot({
        startTime: '2026-07-05T10:00:00.000Z',
        endTime: '2026-07-05T11:00:00.000Z',
      })
      .withLines([{ serviceId: uuidv7(), serviceName: 'Lavagem' }])
      .withLocalDate('2026-07-05')
      .build();

    // First delivery: dispatch fails → use case writes FAILED log, processedEvent NOT saved.
    // RoutingInMemoryEventBus swallows the handler rethrow (mirrors Pub/Sub fire-and-forget).
    dispatcher.failNext(new Error('SMTP connection refused'));
    await eventBus.publish(event);

    expect(logRepo.all.some((l) => l.eventId === event.eventId && l.status === 'FAILED')).toBe(
      true,
    );

    // Second delivery (explicit retry, deterministic): no failNext → dispatch succeeds.
    // tryClaim succeeds again (the earlier claim was unclaimed on failure) → not a duplicate → retries.
    await eventBus.publish(event);

    const sentLog = logRepo.all.find((l) => l.eventId === event.eventId && l.status === 'SENT');
    expect(sentLog).toBeDefined();
    expect(sentLog!.notificationType).toBe('booking-reminder-due');
    expect(dispatcher.dispatched.some((m) => m.to === 'fail-test@example.com')).toBe(true);
  });

  it('tenant isolation: BookingReminderDue for Tenant A does not write log for Tenant B', async () => {
    const tenantBSlug = `reminder-b-${Date.now()}`;
    const tenantBAdminEmail = `admin-reminder-b-${Date.now()}@lavacar.com.br`;
    const { body: bodyB } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: 'Reminder B',
        slug: tenantBSlug,
        adminEmail: tenantBAdminEmail,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);
    const tenantBId = bodyB.tenantId as string;

    // Tenant B provisioned synchronously — clear noise before the assertion.
    logRepo.clear();
    inboxRepo.clear();
    dispatcher.clear();

    const event = new BookingReminderDueCommandBuilder()
      .withTenantId(tenantId)
      .withCorrelationId(uuidv7())
      .withBookingId(uuidv7())
      .withCustomerId(uuidv7())
      .withRecipientEmail('tenant-a-customer@example.com')
      .withCustomerName('Tenant A Customer')
      .withScheduledAt('2026-07-05T10:00:00.000Z')
      .withAppointmentSlot({
        startTime: '2026-07-05T10:00:00.000Z',
        endTime: '2026-07-05T11:00:00.000Z',
      })
      .withLines([{ serviceId: uuidv7(), serviceName: 'Lavagem' }])
      .withLocalDate('2026-07-05')
      .build();

    await eventBus.publish(event);

    expect(dispatcher.dispatched.some((m) => m.to === 'tenant-a-customer@example.com')).toBe(true);
    expect(dispatcher.dispatched.some((m) => m.to === tenantBAdminEmail)).toBe(false);

    const tenantBLogs = logRepo.all.filter(
      (l) => l.tenantId === tenantBId && l.eventId === event.eventId,
    );
    expect(tenantBLogs).toHaveLength(0);
  });
});
