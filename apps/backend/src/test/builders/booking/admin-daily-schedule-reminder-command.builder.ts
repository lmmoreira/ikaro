import { AdminDailyScheduleReminder } from '../../../contexts/booking/domain/commands/admin-daily-schedule-reminder.command';

interface DigestBooking {
  bookingId: string;
  customerName: string;
  customerPhone: string | null;
  lines: { serviceId: string; serviceName: string }[];
  appointmentSlot: { startTime: string; endTime: string };
  adminNotes: string | null;
}

export class AdminDailyScheduleReminderCommandBuilder {
  private tenantId = 'aaaaaaaa-0012-4000-8000-000000000001';
  private correlationId = 'corr-admin-schedule-1';
  private localDate = '2026-07-02';
  private bookingsToday: DigestBooking[] = [
    {
      bookingId: 'bbbbbbbb-0003-4000-8000-000000000001',
      customerName: 'Carlos Mendes',
      customerPhone: '+5531988880000',
      lines: [{ serviceId: 'ssss-0001', serviceName: 'Lavagem Completa' }],
      appointmentSlot: {
        startTime: '2026-07-02T13:00:00.000Z',
        endTime: '2026-07-02T14:00:00.000Z',
      },
      adminNotes: null,
    },
  ];
  private totalBookingsToday = 1;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withLocalDate(localDate: string): this {
    this.localDate = localDate;
    return this;
  }

  withBookingsToday(bookingsToday: DigestBooking[]): this {
    this.bookingsToday = bookingsToday;
    this.totalBookingsToday = bookingsToday.length;
    return this;
  }

  withTotalBookingsToday(totalBookingsToday: number): this {
    this.totalBookingsToday = totalBookingsToday;
    return this;
  }

  build(): AdminDailyScheduleReminder {
    return new AdminDailyScheduleReminder(this.tenantId, this.correlationId, {
      localDate: this.localDate,
      bookingsToday: this.bookingsToday,
      totalBookingsToday: this.totalBookingsToday,
    });
  }
}
