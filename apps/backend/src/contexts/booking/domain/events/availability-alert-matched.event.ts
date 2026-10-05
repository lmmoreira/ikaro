import { DomainEvent } from '../../../../shared/domain/domain-event';

interface AvailabilityAlertMatchedData extends Record<string, unknown> {
  alertId: string;
  customerId: string;
  serviceId: string;
  matchingWindowStart: string;
  matchingWindowEnd: string;
  resourceId: string | null;
}

// docs/03-DOMAIN_EVENTS.md § AvailabilityAlertMatched — a slot matching an ACTIVE alert's criteria
// became bookable (UC-072 step 3). Audit-log consumer only for now (M23-S07); the Notification
// context's email consumer is a later story.
export class AvailabilityAlertMatched extends DomainEvent<AvailabilityAlertMatchedData> {
  readonly eventVersion = 1;
  readonly data: AvailabilityAlertMatchedData;

  constructor(tenantId: string, correlationId: string, data: AvailabilityAlertMatchedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
