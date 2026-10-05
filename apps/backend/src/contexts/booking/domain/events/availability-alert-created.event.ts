import { DomainEvent } from '../../../../shared/domain/domain-event';

interface AvailabilityAlertCreatedData extends Record<string, unknown> {
  alertId: string;
  customerId: string;
  serviceId: string;
  criteriaType: 'ONE_TIME_RANGE' | 'WEEKLY_PREFERENCE';
  expiresAt: string;
}

// docs/03-DOMAIN_EVENTS.md § AvailabilityAlertCreated (UC-072) — audit-log consumer only (M23-S06).
export class AvailabilityAlertCreated extends DomainEvent<AvailabilityAlertCreatedData> {
  readonly eventVersion = 1;
  readonly data: AvailabilityAlertCreatedData;

  constructor(tenantId: string, correlationId: string, data: AvailabilityAlertCreatedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
