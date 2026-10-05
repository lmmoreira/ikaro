import { DomainEvent } from '../../../../shared/domain/domain-event';

interface AvailabilityAlertExpiredData extends Record<string, unknown> {
  alertId: string;
  customerId: string;
  serviceId: string;
}

// docs/03-DOMAIN_EVENTS.md § AvailabilityAlertExpired (system, expiresAt passed) — audit-log consumer only (M23-S06).
export class AvailabilityAlertExpired extends DomainEvent<AvailabilityAlertExpiredData> {
  readonly eventVersion = 1;
  readonly data: AvailabilityAlertExpiredData;

  constructor(tenantId: string, correlationId: string, data: AvailabilityAlertExpiredData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
