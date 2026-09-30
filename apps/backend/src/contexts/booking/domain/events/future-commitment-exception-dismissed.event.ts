import { DomainEvent } from '../../../../shared/domain/domain-event';

interface FutureCommitmentExceptionDismissedData extends Record<string, unknown> {
  exceptionId: string;
  resolvedByStaffId: string;
  resolutionReason: string;
}

// docs/03-DOMAIN_EVENTS.md § FutureCommitmentExceptionDismissed (UC-077 A2) — audit-log consumer
// only.
export class FutureCommitmentExceptionDismissed extends DomainEvent<FutureCommitmentExceptionDismissedData> {
  readonly eventVersion = 1;
  readonly data: FutureCommitmentExceptionDismissedData;

  constructor(
    tenantId: string,
    correlationId: string,
    data: FutureCommitmentExceptionDismissedData,
  ) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
