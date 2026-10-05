import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { AvailabilityAlertCreated } from '../../../contexts/booking/domain/events/availability-alert-created.event';

export class AvailabilityAlertCreatedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-1';
  private alertId = uuidv7();
  private readonly customerId = uuidv7();
  private readonly serviceId = uuidv7();
  private readonly criteriaType = 'ONE_TIME_RANGE' as const;
  private readonly expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

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

  build(): AvailabilityAlertCreated {
    return new AvailabilityAlertCreated(this.tenantId, this.correlationId, {
      alertId: this.alertId,
      customerId: this.customerId,
      serviceId: this.serviceId,
      criteriaType: this.criteriaType,
      expiresAt: this.expiresAt,
    });
  }
}
