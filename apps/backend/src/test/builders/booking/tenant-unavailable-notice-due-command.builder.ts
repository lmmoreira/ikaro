import { TenantUnavailableNoticeDue } from '../../../contexts/booking/domain/commands/tenant-unavailable-notice-due.command';

export class TenantUnavailableNoticeDueCommandBuilder {
  private tenantId = 'aaaaaaaa-0028-4000-8000-000000000001';
  private correlationId = 'corr-tenant-unavailable-1';
  private customerId = 'cccccccc-0028-4000-8000-000000000001';
  private suspensionEventId = 'eeeeeeee-0028-4000-8000-000000000001';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withSuspensionEventId(suspensionEventId: string): this {
    this.suspensionEventId = suspensionEventId;
    return this;
  }

  build(): TenantUnavailableNoticeDue {
    return new TenantUnavailableNoticeDue(
      this.tenantId,
      this.correlationId,
      { customerId: this.customerId },
      this.suspensionEventId,
    );
  }
}
