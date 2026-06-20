import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingReminderJob } from './booking-reminder.job';

interface ReminderDueData {
  bookingId: string;
  recipientEmail: string;
  customerName: string;
  lines: { serviceId: string; serviceName: string }[];
  appointmentSlot: { startTime: string; endTime: string };
}

const TENANT_IN = '00000000-0000-7000-8000-000000000001';
const TENANT_OUT = '00000000-0000-7000-8000-000000000002';
const SERVICE_ID = 'ssssssss-0000-7000-8000-000000000001';
const CUSTOMER_ID = 'cccccccc-0000-7000-8000-000000000001';

// 06:15 UTC — in window for UTC timezone tenant
const NOW_IN = new Date('2026-06-01T06:15:00.000Z');
// 10:00 UTC — outside window
const NOW_OUT = new Date('2026-06-01T10:00:00.000Z');
// Tomorrow 09:00 UTC (falls within 2026-06-02 UTC day)
const TOMORROW = new Date('2026-06-02T09:00:00.000Z');
// Today 09:00 UTC (falls within 2026-06-01 UTC day)
const TODAY = new Date('2026-06-01T09:00:00.000Z');

describe('BookingReminderJob', () => {
  let tenantPort: InMemoryBookingPlatformPort;
  let bookingRepo: InMemoryBookingRepository;
  let customerProfilePort: InMemoryBookingCustomerPort;
  let eventBus: InMemoryEventBus;
  let job: BookingReminderJob;

  beforeEach(() => {
    tenantPort = new InMemoryBookingPlatformPort();
    bookingRepo = new InMemoryBookingRepository();
    customerProfilePort = new InMemoryBookingCustomerPort();
    eventBus = new InMemoryEventBus();
    job = new BookingReminderJob(tenantPort, bookingRepo, customerProfilePort, eventBus);
  });

  afterEach(() => jest.resetAllMocks());

  it('emits BookingReminderDue for APPROVED booking scheduled tomorrow', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withLines([new BookingLineBuilder().withServiceId(SERVICE_ID).build()])
      .build();
    await bookingRepo.save(booking);

    await job.run(NOW_IN);

    const events = eventBus.published.filter((e) => e.eventName === 'BookingReminderDue');
    expect(events).toHaveLength(1);
    expect((events[0].data as unknown as ReminderDueData).bookingId).toBe(booking.id);
    expect(events[0].tenantId).toBe(TENANT_IN);
  });

  it('emits BookingReminderDueToday for APPROVED booking scheduled today', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TODAY)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(booking);

    await job.run(NOW_IN);

    const events = eventBus.published.filter((e) => e.eventName === 'BookingReminderDueToday');
    expect(events).toHaveLength(1);
    expect((events[0].data as unknown as ReminderDueData).bookingId).toBe(booking.id);
  });

  it('uses guest email and name for guest bookings', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withContactEmail('maria@example.com')
      .withContactName('Maria Silva')
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(booking);

    await job.run(NOW_IN);

    const event = eventBus.published.find((e) => e.eventName === 'BookingReminderDue');
    expect((event?.data as unknown as ReminderDueData).recipientEmail).toBe('maria@example.com');
    expect((event?.data as unknown as ReminderDueData).customerName).toBe('Maria Silva');
  });

  it('uses customer profile email and name for authenticated bookings', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withCustomerId(CUSTOMER_ID)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(booking);
    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'auth@example.com',
      name: 'Auth User',
      phone: '+5531999999999',
      defaultAddress: null,
    });

    await job.run(NOW_IN);

    const event = eventBus.published.find((e) => e.eventName === 'BookingReminderDue');
    expect((event?.data as unknown as ReminderDueData).recipientEmail).toBe('auth@example.com');
    expect((event?.data as unknown as ReminderDueData).customerName).toBe('Auth User');
  });

  it('falls back to guest fields when customer profile not found', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withCustomerId(CUSTOMER_ID)
      .withContactEmail('guest@fallback.com')
      .withContactName('Fallback Name')
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(booking);
    // profile not seeded — findById returns null

    await job.run(NOW_IN);

    const event = eventBus.published.find((e) => e.eventName === 'BookingReminderDue');
    expect((event?.data as unknown as ReminderDueData).recipientEmail).toBe('guest@fallback.com');
    expect((event?.data as unknown as ReminderDueData).customerName).toBe('Fallback Name');
  });

  it('does not emit events for tenant outside 06:00–06:29 window', async () => {
    tenantPort.seed([{ id: TENANT_OUT, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_OUT)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(booking);

    await job.run(NOW_OUT);

    expect(eventBus.published).toHaveLength(0);
  });

  it('emits no events when tenant has no APPROVED bookings', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);

    await job.run(NOW_IN);

    expect(eventBus.published).toHaveLength(0);
  });

  it('includes serviceName and correct appointmentSlot in event payload', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withTotalDurationMins(60)
      .withLines([
        new BookingLineBuilder()
          .withServiceId(SERVICE_ID)
          .withServiceNameAtBooking('Polimento')
          .withDurationMinsAtBooking(60)
          .build(),
      ])
      .build();
    await bookingRepo.save(booking);

    await job.run(NOW_IN);

    const event = eventBus.published.find((e) => e.eventName === 'BookingReminderDue');
    const data = event?.data as unknown as ReminderDueData;
    expect(data.lines[0].serviceName).toBe('Polimento');
    expect(data.appointmentSlot.startTime).toBe(TOMORROW.toISOString());
    const expectedEnd = new Date(TOMORROW.getTime() + 60 * 60_000).toISOString();
    expect(data.appointmentSlot.endTime).toBe(expectedEnd);
  });

  it('tenant isolation: Tenant A bookings do not appear in Tenant B events', async () => {
    tenantPort.seed([
      { id: TENANT_IN, timezone: 'UTC' },
      { id: TENANT_OUT, timezone: 'UTC' },
    ]);
    const bookingA = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(bookingA);

    await job.run(NOW_IN);

    const tenantBEvents = eventBus.published.filter(
      (e) => e.eventName === 'BookingReminderDue' && e.tenantId === TENANT_OUT,
    );
    expect(tenantBEvents).toHaveLength(0);
  });

  it('uses a fresh correlationId per tenant iteration', async () => {
    tenantPort.seed([
      { id: TENANT_IN, timezone: 'UTC' },
      { id: TENANT_OUT, timezone: 'UTC' },
    ]);
    const bookingA = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withLines([new BookingLineBuilder().build()])
      .build();
    const bookingB = new BookingBuilder()
      .withTenantId(TENANT_OUT)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TOMORROW)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(bookingA);
    await bookingRepo.save(bookingB);

    await job.run(NOW_IN);

    const eventsA = eventBus.published.filter(
      (e) => e.eventName === 'BookingReminderDue' && e.tenantId === TENANT_IN,
    );
    const eventsB = eventBus.published.filter(
      (e) => e.eventName === 'BookingReminderDue' && e.tenantId === TENANT_OUT,
    );
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(1);
    expect(eventsA[0].correlationId).not.toBe(eventsB[0].correlationId);
  });
});
