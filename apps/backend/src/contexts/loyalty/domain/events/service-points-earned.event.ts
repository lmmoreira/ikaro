import { DomainEvent } from '../../../../shared/domain/domain-event';

export interface ServicePointsEarnedLine {
  entryId: string;
  serviceId: string;
  pointsEarned: number;
  expiresAt: string;
}

interface ServicePointsEarnedData extends Record<string, unknown> {
  customerId: string;
  bookingId: string;
  totalPointsEarned: number;
  earnedAt: string;
  lines: ServicePointsEarnedLine[];
  currentBalance: number;
}

export class ServicePointsEarned extends DomainEvent<ServicePointsEarnedData> {
  readonly eventVersion = 2;
  readonly data: ServicePointsEarnedData;

  constructor(tenantId: string, correlationId: string, data: ServicePointsEarnedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
