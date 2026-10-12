import { RecurringScheduleRenewalDue } from '../../../contexts/booking/domain/commands/recurring-schedule-renewal-due.command';

export class RecurringScheduleRenewalDueCommandBuilder {
  private tenantId = 'aaaaaaaa-0021-4000-8000-000000000001';
  private correlationId = 'corr-renewal-due-1';
  private recurringScheduleId = 'bbbbbbbb-0021-4000-8000-000000000001';
  private customerId = 'cccccccc-0021-4000-8000-000000000001';
  private serviceId = 'ssssssss-0021-4000-8000-000000000001';
  private readonly daysOfWeek = ['tuesday', 'thursday'];
  private readonly startTime = '10:00';
  private readonly startsOn = '2026-08-01';
  private readonly endsOn = '2026-10-19';
  private localDate = '2026-10-12';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withRecurringScheduleId(recurringScheduleId: string): this {
    this.recurringScheduleId = recurringScheduleId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withServiceId(serviceId: string): this {
    this.serviceId = serviceId;
    return this;
  }

  withLocalDate(localDate: string): this {
    this.localDate = localDate;
    return this;
  }

  build(): RecurringScheduleRenewalDue {
    return new RecurringScheduleRenewalDue(
      this.tenantId,
      this.correlationId,
      {
        recurringScheduleId: this.recurringScheduleId,
        customerId: this.customerId,
        serviceId: this.serviceId,
        daysOfWeek: this.daysOfWeek,
        startTime: this.startTime,
        startsOn: this.startsOn,
        endsOn: this.endsOn,
      },
      this.localDate,
    );
  }
}
