import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryReminderTenantPort } from '../../../../test/infrastructure/in-memory-reminder-tenant.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryCustomerProfilePort } from '../../../../test/infrastructure/in-memory-customer-profile.port';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import { AdminScheduleReminderJob } from './admin-schedule-reminder.job';

interface DigestBooking {
  bookingId: string;
  customerName: string;
  customerPhone: string | null;
  lines: { serviceId: string; serviceName: string }[];
  appointmentSlot: { startTime: string; endTime: string };
  adminNotes: string | null;
}

interface DigestEventData {
  localDate: string;
  bookingsToday: DigestBooking[];
  totalBookingsToday: number;
}

const TENANT_IN = '00000000-0000-7000-8000-000000000001';
const TENANT_OUT = '00000000-0000-7000-8000-000000000002';
const CUSTOMER_ID = 'cccccccc-0000-7000-8000-000000000001';

const NOW_IN = new Date('2026-06-01T06:15:00.000Z');
const NOW_OUT = new Date('2026-06-01T10:00:00.000Z');
const TODAY = new Date('2026-06-01T09:00:00.000Z');

describe('AdminScheduleReminderJob', () => {
  let tenantPort: InMemoryReminderTenantPort;
  let bookingRepo: InMemoryBookingRepository;
  let customerProfilePort: InMemoryCustomerProfilePort;
  let eventBus: InMemoryEventBus;
  let job: AdminScheduleReminderJob;

  beforeEach(() => {
    tenantPort = new InMemoryReminderTenantPort();
    bookingRepo = new InMemoryBookingRepository();
    customerProfilePort = new InMemoryCustomerProfilePort();
    eventBus = new InMemoryEventBus();
    job = new AdminScheduleReminderJob(tenantPort, bookingRepo, customerProfilePort, eventBus);
  });

  afterEach(() => jest.resetAllMocks());

  it('emits AdminDailyScheduleReminder once per eligible tenant', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);

    await job.run(NOW_IN);

    const events = eventBus.published.filter((e) => e.eventName === 'AdminDailyScheduleReminder');
    expect(events).toHaveLength(1);
    expect(events[0].tenantId).toBe(TENANT_IN);
  });

  it('emits with empty bookingsToday when no APPROVED bookings today', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);

    await job.run(NOW_IN);

    const event = eventBus.published.find((e) => e.eventName === 'AdminDailyScheduleReminder');
    expect((event?.data as unknown as DigestEventData).totalBookingsToday).toBe(0);
    expect((event?.data as unknown as DigestEventData).bookingsToday).toEqual([]);
  });

  it('includes today bookings in digest with correct fields', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TODAY)
      .withContactName('Carlos Mendes')
      .withContactPhone('31988888888')
      .withTotalDurationMins(45)
      .withLines([
        new BookingLineBuilder()
          .withServiceNameAtBooking('Lavagem Premium')
          .withDurationMinsAtBooking(45)
          .build(),
      ])
      .build();
    await bookingRepo.save(booking);

    await job.run(NOW_IN);

    const event = eventBus.published.find((e) => e.eventName === 'AdminDailyScheduleReminder');
    const data = event?.data as unknown as DigestEventData;
    expect(data.totalBookingsToday).toBe(1);
    const digest = data.bookingsToday[0];
    expect(digest.customerName).toBe('Carlos Mendes');
    expect(digest.customerPhone).toBe('31988888888');
    expect(digest.lines[0].serviceName).toBe('Lavagem Premium');
    expect(digest.appointmentSlot.startTime).toBe(TODAY.toISOString());
    const expectedEnd = new Date(TODAY.getTime() + 45 * 60_000).toISOString();
    expect(digest.appointmentSlot.endTime).toBe(expectedEnd);
  });

  it('uses customer profile name and phone for authenticated bookings', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TODAY)
      .withCustomerId(CUSTOMER_ID)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(booking);
    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'auth@example.com',
      name: 'Ana Paula',
      phone: '31977777777',
      defaultAddress: null,
    });

    await job.run(NOW_IN);

    const event = eventBus.published.find((e) => e.eventName === 'AdminDailyScheduleReminder');
    const digest = (event?.data as unknown as DigestEventData).bookingsToday[0];
    expect(digest.customerName).toBe('Ana Paula');
    expect(digest.customerPhone).toBe('31977777777');
  });

  it('does not emit events for tenant outside 06:00–06:29 window', async () => {
    tenantPort.seed([{ id: TENANT_OUT, timezone: 'UTC' }]);
    await job.run(NOW_OUT);
    expect(eventBus.published).toHaveLength(0);
  });

  it('includes localDate in YYYY-MM-DD format in tenant timezone', async () => {
    tenantPort.seed([{ id: TENANT_IN, timezone: 'UTC' }]);

    await job.run(NOW_IN);

    const event = eventBus.published.find((e) => e.eventName === 'AdminDailyScheduleReminder');
    expect((event?.data as unknown as DigestEventData).localDate).toBe('2026-06-01');
  });

  it('tenant isolation: Tenant A bookings do not appear in Tenant B digest', async () => {
    tenantPort.seed([
      { id: TENANT_IN, timezone: 'UTC' },
      { id: TENANT_OUT, timezone: 'UTC' },
    ]);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_IN)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(TODAY)
      .withLines([new BookingLineBuilder().build()])
      .build();
    await bookingRepo.save(booking);

    await job.run(NOW_IN);

    const tenantBEvent = eventBus.published.find(
      (e) => e.eventName === 'AdminDailyScheduleReminder' && e.tenantId === TENANT_OUT,
    );
    expect((tenantBEvent?.data as unknown as DigestEventData).totalBookingsToday).toBe(0);
  });
});
