import { DomainEvent } from '../../../../shared/domain/domain-event';

interface AvailabilityAlertUpdatedData extends Record<string, unknown> {
  alertId: string;
  customerId: string;
  serviceId: string;
}

// docs/03-DOMAIN_EVENTS.md § AvailabilityAlertUpdated (UC-076) — audit-log consumer only (M23-S06).
export class AvailabilityAlertUpdated extends DomainEvent<AvailabilityAlertUpdatedData> {
  readonly eventVersion = 1;
  readonly data: AvailabilityAlertUpdatedData;

  constructor(tenantId: string, correlationId: string, data: AvailabilityAlertUpdatedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
