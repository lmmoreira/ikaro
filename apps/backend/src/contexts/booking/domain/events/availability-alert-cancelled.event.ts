import { DomainEvent } from '../../../../shared/domain/domain-event';

interface AvailabilityAlertCancelledData extends Record<string, unknown> {
  alertId: string;
  customerId: string;
  serviceId: string;
}

// docs/03-DOMAIN_EVENTS.md § AvailabilityAlertCancelled (UC-072 A2 / UC-076) — audit-log consumer only (M23-S06).
export class AvailabilityAlertCancelled extends DomainEvent<AvailabilityAlertCancelledData> {
  readonly eventVersion = 1;
  readonly data: AvailabilityAlertCancelledData;

  constructor(tenantId: string, correlationId: string, data: AvailabilityAlertCancelledData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
