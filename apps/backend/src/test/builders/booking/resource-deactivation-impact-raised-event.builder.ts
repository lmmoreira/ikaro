import { ResourceDeactivationImpactRaised } from '../../../contexts/booking/domain/events/resource-deactivation-impact-raised.event';

export class ResourceDeactivationImpactRaisedEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-impact-1';
  private resourceId = 'bbbbbbbb-0000-4000-8000-000000000001';
  private resourceName = 'Sala 1';
  private affectedCount = 3;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withResourceId(resourceId: string): this {
    this.resourceId = resourceId;
    return this;
  }

  withResourceName(resourceName: string): this {
    this.resourceName = resourceName;
    return this;
  }

  withAffectedCount(affectedCount: number): this {
    this.affectedCount = affectedCount;
    return this;
  }

  build(): ResourceDeactivationImpactRaised {
    return new ResourceDeactivationImpactRaised(this.tenantId, this.correlationId, {
      resourceId: this.resourceId,
      resourceName: this.resourceName,
      affectedCount: this.affectedCount,
    });
  }
}
