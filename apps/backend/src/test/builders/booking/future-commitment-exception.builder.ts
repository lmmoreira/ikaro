import { uuidv7 } from '../../../shared/domain/uuid-v7';
import {
  FutureCommitmentAlternative,
  FutureCommitmentException,
} from '../../../contexts/booking/domain/future-commitment-exception.aggregate';

// Builds an OPEN entry through the real raise() factory, so the aggregate carries its pending
// FutureCommitmentExceptionRaised event exactly as production code would.
export class FutureCommitmentExceptionBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private sourceId = uuidv7();
  private affectedId = uuidv7();
  private alternatives: FutureCommitmentAlternative[] = [];
  private correlationId = 'corr-fce-1';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withSourceId(sourceId: string): this {
    this.sourceId = sourceId;
    return this;
  }

  withAffectedId(affectedId: string): this {
    this.affectedId = affectedId;
    return this;
  }

  withAlternatives(alternatives: FutureCommitmentAlternative[]): this {
    this.alternatives = alternatives;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  build(): FutureCommitmentException {
    return FutureCommitmentException.raise({
      tenantId: this.tenantId,
      sourceType: 'RESOURCE_DEACTIVATION',
      sourceId: this.sourceId,
      affectedType: 'BOOKING',
      affectedId: this.affectedId,
      alternatives: this.alternatives,
      correlationId: this.correlationId,
    });
  }
}
