import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { ServiceEntity } from '../entities/service.entity';
import { TenantEntityBuilder } from '../../../../test/builders/platform/tenant-entity.builder';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { BookingReminderJob } from '../../application/jobs/booking-reminder.job';
import { AdminScheduleReminderJob } from '../../application/jobs/admin-schedule-reminder.job';

// Inline tenant UUID to avoid count cross-contamination
const TENANT_IN = '00000000-1104-7000-8000-000000000001';
const TENANT_OUT = '00000000-1104-7000-8000-000000000002';
const SERVICE_ID_IN = '00000000-1104-7000-8000-000000000011';
const SERVICE_ID_OUT = '00000000-1104-7000-8000-000000000012';

// 06:15 UTC — in window for UTC-timezone tenant
const NOW_IN = new Date('2026-06-01T06:15:00.000Z');
// 10:00 UTC — outside window
const NOW_OUT = new Date('2026-06-01T10:00:00.000Z');
// Tomorrow at 09:00 UTC relative to NOW_IN
const TOMORROW = new Date('2026-06-02T09:00:00.000Z');

describe('CronBookingController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: RoutingInMemoryEventBus;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = 'test-cron-key-xxxxxxxxxxxxxxxx';
    ({ app, ds, eventBus } = await createBookingIntegrationApp());

    // Seed tenants directly
    const inWindowTenant = new TenantEntityBuilder()
      .withId(TENANT_IN)
      .withSlug('cron-in-window')
      .build();
    inWindowTenant.settings = TenantSettings.default('UTC').toJSON();

    const outWindowTenant = new TenantEntityBuilder()
      .withId(TENANT_OUT)
      .withSlug('cron-out-window')
      .build();
    outWindowTenant.settings = TenantSettings.default('UTC').toJSON();

    await ds.getRepository(TenantEntity).save([inWindowTenant, outWindowTenant]);

    // Seed one service per tenant so booking_lines FK (tenant_id, service_id) → services is satisfied
    await ds
      .getRepository(ServiceEntity)
      .save([
        new ServiceEntityBuilder().withId(SERVICE_ID_IN).withTenantId(TENANT_IN).build(),
        new ServiceEntityBuilder().withId(SERVICE_ID_OUT).withTenantId(TENANT_OUT).build(),
      ]);
  });

  afterAll(async () => {
    await ds.getRepository(BookingLineEntity).delete({ tenantId: TENANT_IN });
    await ds.getRepository(BookingLineEntity).delete({ tenantId: TENANT_OUT });
    await ds.getRepository(BookingEntity).delete({ tenantId: TENANT_IN });
    await ds.getRepository(BookingEntity).delete({ tenantId: TENANT_OUT });
    await ds.getRepository(ServiceEntity).delete({ tenantId: TENANT_IN });
    await ds.getRepository(ServiceEntity).delete({ tenantId: TENANT_OUT });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_IN });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_OUT });
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  afterEach(async () => {
    eventBus.clear();
    await ds.getRepository(BookingLineEntity).delete({ tenantId: TENANT_IN });
    await ds.getRepository(BookingLineEntity).delete({ tenantId: TENANT_OUT });
    await ds.getRepository(BookingEntity).delete({ tenantId: TENANT_IN });
    await ds.getRepository(BookingEntity).delete({ tenantId: TENANT_OUT });
  });

  it('POST /cron/reminders returns 200 { ok: true }', async () => {
    const { body } = await request(app.getHttpServer()).post('/cron/reminders').expect(200);
    expect(body.ok).toBe(true);
  });

  it('POST /cron/reminders publishes the cron-reminders trigger, dispatched to both reminder handlers', async () => {
    // Proves the new wiring end-to-end (controller -> publishTrigger -> both trigger handlers ->
    // both jobs' run()) — window-matching / event-emission logic is covered by the jobs' own
    // unit specs, so this only asserts dispatch happened, not on emitted domain events.
    const bookingReminderJob = app.get(BookingReminderJob);
    const adminScheduleReminderJob = app.get(AdminScheduleReminderJob);
    const bookingRunSpy = jest.spyOn(bookingReminderJob, 'run');
    const adminRunSpy = jest.spyOn(adminScheduleReminderJob, 'run');

    await request(app.getHttpServer()).post('/cron/reminders').expect(200);

    expect(bookingRunSpy).toHaveBeenCalledTimes(1);
    expect(adminRunSpy).toHaveBeenCalledTimes(1);
  });

  it('emits BookingReminderDue for in-window tenant with APPROVED booking tomorrow', async () => {
    const bookingEntity = new BookingEntityBuilder()
      .withTenantId(TENANT_IN)
      .withStatus('APPROVED')
      .withScheduledAt(TOMORROW)
      .withContactEmail('cron-test@example.com')
      .withContactName('Cron Test User')
      .build();
    await ds.getRepository(BookingEntity).save(bookingEntity);

    const lineEntity = new BookingLineEntityBuilder()
      .withTenantId(TENANT_IN)
      .withBookingId(bookingEntity.id)
      .withServiceId(SERVICE_ID_IN)
      .withServiceNameAtBooking('Lavagem Completa')
      .build();
    await ds.getRepository(BookingLineEntity).save(lineEntity);

    const bookingReminderJob = app.get(BookingReminderJob);
    await bookingReminderJob.run(NOW_IN);

    const events = eventBus.published.filter((e) => e.eventName === 'BookingReminderDue');
    expect(events).toHaveLength(1);
    expect(events[0].data.bookingId).toBe(bookingEntity.id);
    expect(events[0].tenantId).toBe(TENANT_IN);
  });

  it('does not emit BookingReminderDue for out-of-window tenant', async () => {
    const bookingEntity = new BookingEntityBuilder()
      .withTenantId(TENANT_OUT)
      .withStatus('APPROVED')
      .withScheduledAt(TOMORROW)
      .build();
    await ds.getRepository(BookingEntity).save(bookingEntity);

    const lineEntity = new BookingLineEntityBuilder()
      .withTenantId(TENANT_OUT)
      .withBookingId(bookingEntity.id)
      .withServiceId(SERVICE_ID_OUT)
      .build();
    await ds.getRepository(BookingLineEntity).save(lineEntity);

    const bookingReminderJob = app.get(BookingReminderJob);
    await bookingReminderJob.run(NOW_OUT);

    const events = eventBus.published.filter(
      (e) => e.eventName === 'BookingReminderDue' && e.tenantId === TENANT_OUT,
    );
    expect(events).toHaveLength(0);
  });

  it('emits AdminDailyScheduleReminder with empty digest when no bookings today', async () => {
    const adminJob = app.get(AdminScheduleReminderJob);
    await adminJob.run(NOW_IN);

    const events = eventBus.published.filter(
      (e) => e.eventName === 'AdminDailyScheduleReminder' && e.tenantId === TENANT_IN,
    );
    expect(events).toHaveLength(1);
    expect(events[0].data.totalBookingsToday).toBe(0);
  });

  it('tenant isolation: TENANT_IN booking does not appear in TENANT_OUT events', async () => {
    const bookingEntity = new BookingEntityBuilder()
      .withTenantId(TENANT_IN)
      .withStatus('APPROVED')
      .withScheduledAt(TOMORROW)
      .build();
    await ds.getRepository(BookingEntity).save(bookingEntity);

    const lineEntity = new BookingLineEntityBuilder()
      .withTenantId(TENANT_IN)
      .withBookingId(bookingEntity.id)
      .withServiceId(SERVICE_ID_IN)
      .build();
    await ds.getRepository(BookingLineEntity).save(lineEntity);

    const bookingReminderJob = app.get(BookingReminderJob);
    await bookingReminderJob.run(NOW_IN);

    const tenantOutEvents = eventBus.published.filter(
      (e) => e.eventName === 'BookingReminderDue' && e.tenantId === TENANT_OUT,
    );
    expect(tenantOutEvents).toHaveLength(0);
  });
});
