import { DomainEvent } from '../../../../shared/domain/domain-event';
import {
  FutureCommitmentExceptionAffectedType,
  FutureCommitmentExceptionResolutionType,
} from '../future-commitment-exception.types';

interface FutureCommitmentExceptionResolvedData extends Record<string, unknown> {
  exceptionId: string;
  resolutionType: FutureCommitmentExceptionResolutionType;
  resolvedByStaffId: string;
  affectedType: FutureCommitmentExceptionAffectedType;
  affectedId: string;
}

// docs/03-DOMAIN_EVENTS.md § FutureCommitmentExceptionResolved (UC-077) — audit-log consumer only.
export class FutureCommitmentExceptionResolved extends DomainEvent<FutureCommitmentExceptionResolvedData> {
  readonly eventVersion = 1;
  readonly data: FutureCommitmentExceptionResolvedData;

  constructor(
    tenantId: string,
    correlationId: string,
    data: FutureCommitmentExceptionResolvedData,
  ) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
