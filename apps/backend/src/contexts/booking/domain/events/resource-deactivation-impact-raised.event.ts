import { DomainEvent } from '../../../../shared/domain/domain-event';

interface ResourceDeactivationImpactRaisedData extends Record<string, unknown> {
  resourceId: string;
  resourceName: string;
  affectedCount: number;
}

// UC-073 — one summary per resource deactivation that affects at least one future booking, so the
// managers get a single alert instead of one per FutureCommitmentExceptionRaised. Not aggregate
// driven: the raise use case publishes it through the outbox inside the deactivation transaction.
export class ResourceDeactivationImpactRaised extends DomainEvent<ResourceDeactivationImpactRaisedData> {
  readonly eventVersion = 1;
  readonly data: ResourceDeactivationImpactRaisedData;

  constructor(tenantId: string, correlationId: string, data: ResourceDeactivationImpactRaisedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
