import { DomainEvent } from '../../../../shared/domain/domain-event';
import {
  FutureCommitmentExceptionAffectedType,
  FutureCommitmentExceptionSourceType,
} from '../future-commitment-exception.types';

interface FutureCommitmentExceptionRaisedData extends Record<string, unknown> {
  exceptionId: string;
  sourceType: FutureCommitmentExceptionSourceType;
  sourceId: string;
  affectedType: FutureCommitmentExceptionAffectedType;
  affectedId: string;
  ownerStaffId: string | null;
}

// docs/03-DOMAIN_EVENTS.md § FutureCommitmentExceptionRaised (UC-073) — audit-log consumer only.
export class FutureCommitmentExceptionRaised extends DomainEvent<FutureCommitmentExceptionRaisedData> {
  readonly eventVersion = 1;
  readonly data: FutureCommitmentExceptionRaisedData;

  constructor(tenantId: string, correlationId: string, data: FutureCommitmentExceptionRaisedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
