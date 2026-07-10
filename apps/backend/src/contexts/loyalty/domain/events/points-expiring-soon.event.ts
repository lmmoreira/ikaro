import { DomainEvent } from '../../../../shared/domain/domain-event';

interface PointsExpiringSoonData extends Record<string, unknown> {
  customerId: string;
  pointsExpiringSoon: number;
  earliestExpiresAt: string;
}

export class PointsExpiringSoon extends DomainEvent<PointsExpiringSoonData> {
  readonly eventVersion = 1;
  readonly data: PointsExpiringSoonData;

  constructor(tenantId: string, correlationId: string, data: PointsExpiringSoonData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
