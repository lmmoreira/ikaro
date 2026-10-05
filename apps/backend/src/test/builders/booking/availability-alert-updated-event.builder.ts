import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { AvailabilityAlertUpdated } from '../../../contexts/booking/domain/events/availability-alert-updated.event';

export class AvailabilityAlertUpdatedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-1';
  private alertId = uuidv7();
  private readonly customerId = uuidv7();
  private readonly serviceId = uuidv7();

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

  build(): AvailabilityAlertUpdated {
    return new AvailabilityAlertUpdated(this.tenantId, this.correlationId, {
      alertId: this.alertId,
      customerId: this.customerId,
      serviceId: this.serviceId,
    });
  }
}
