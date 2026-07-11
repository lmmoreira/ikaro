import { PointsExpiringSoon } from '../../../contexts/loyalty/domain/commands/points-expiring-soon.command';

export class PointsExpiringSoonCommandBuilder {
  private tenantId = 'aaaaaaaa-0020-4000-8000-000000001604';
  private correlationId = 'corr-expiring-soon-1';
  private customerId = 'cccccccc-0001-4000-8000-000000001604';
  private pointsExpiringSoon = 20;
  private earliestExpiresAt = '2026-06-09T00:00:00.000Z';
  private runDate = '2026-06-02';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withPointsExpiringSoon(pointsExpiringSoon: number): this {
    this.pointsExpiringSoon = pointsExpiringSoon;
    return this;
  }

  withEarliestExpiresAt(earliestExpiresAt: string): this {
    this.earliestExpiresAt = earliestExpiresAt;
    return this;
  }

  withRunDate(runDate: string): this {
    this.runDate = runDate;
    return this;
  }

  build(): PointsExpiringSoon {
    return new PointsExpiringSoon(
      this.tenantId,
      this.correlationId,
      {
        customerId: this.customerId,
        pointsExpiringSoon: this.pointsExpiringSoon,
        earliestExpiresAt: this.earliestExpiresAt,
      },
      this.runDate,
    );
  }
}
