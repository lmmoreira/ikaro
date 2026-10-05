import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { AvailabilityAlertMatched } from '../../../contexts/booking/domain/events/availability-alert-matched.event';

export class AvailabilityAlertMatchedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-1';
  private alertId = uuidv7();
  private readonly customerId = uuidv7();
  private readonly serviceId = uuidv7();
  private readonly resourceId: string | null = null;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withAlertId(alertId: string): this {
    this.alertId = alertId;
    return this;
  }

  build(): AvailabilityAlertMatched {
    return new AvailabilityAlertMatched(this.tenantId, this.correlationId, {
      alertId: this.alertId,
      customerId: this.customerId,
      serviceId: this.serviceId,
      matchingWindowStart: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      matchingWindowEnd: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(),
      resourceId: this.resourceId,
    });
  }
}
