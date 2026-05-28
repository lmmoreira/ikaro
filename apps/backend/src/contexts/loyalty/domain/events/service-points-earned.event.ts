import { DomainEvent } from '../../../../shared/domain/domain-event';

interface ServicePointsEarnedData extends Record<string, unknown> {
  entryId: string;
  customerId: string;
  bookingId: string;
  bookingLineId: string;
  serviceId: string;
  pointsEarned: number;
  earnedAt: string;
  expiresAt: string;
}

export class ServicePointsEarned extends DomainEvent<ServicePointsEarnedData> {
  readonly eventName = 'ServicePointsEarned';
  readonly eventVersion = 1;
  readonly data: ServicePointsEarnedData;

  constructor(tenantId: string, correlationId: string, data: ServicePointsEarnedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
