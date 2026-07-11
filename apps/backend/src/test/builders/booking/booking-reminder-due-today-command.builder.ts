import { BookingReminderDueToday } from '../../../contexts/booking/domain/commands/booking-reminder-due-today.command';

export class BookingReminderDueTodayCommandBuilder {
  private tenantId = 'aaaaaaaa-0010-4000-8000-000000000001';
  private correlationId = 'corr-reminder-today-1';
  private bookingId = 'bbbbbbbb-0002-4000-8000-000000000001';
  private customerId: string | null = null;
  private recipientEmail = 'maria@example.com';
  private customerName = 'Maria Costa';
  private scheduledAt = '2026-07-02T09:00:00.000Z';
  private appointmentSlot = {
    startTime: '2026-07-02T09:00:00.000Z',
    endTime: '2026-07-02T10:00:00.000Z',
  };
  private lines = [{ serviceId: 'ssss-0002', serviceName: 'Polimento' }];
  private localDate = '2026-07-02';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withBookingId(bookingId: string): this {
    this.bookingId = bookingId;
    return this;
  }

  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }

  withRecipientEmail(recipientEmail: string): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  withCustomerName(customerName: string): this {
    this.customerName = customerName;
    return this;
  }

  withScheduledAt(scheduledAt: string): this {
    this.scheduledAt = scheduledAt;
    return this;
  }

  withAppointmentSlot(appointmentSlot: { startTime: string; endTime: string }): this {
    this.appointmentSlot = appointmentSlot;
    return this;
  }

  withLines(lines: { serviceId: string; serviceName: string }[]): this {
    this.lines = lines;
    return this;
  }

  withLocalDate(localDate: string): this {
    this.localDate = localDate;
    return this;
  }

  build(): BookingReminderDueToday {
    return new BookingReminderDueToday(
      this.tenantId,
      this.correlationId,
      {
        bookingId: this.bookingId,
        customerId: this.customerId,
        recipientEmail: this.recipientEmail,
        customerName: this.customerName,
        scheduledAt: this.scheduledAt,
        appointmentSlot: this.appointmentSlot,
        lines: this.lines,
      },
      this.localDate,
    );
  }
}
