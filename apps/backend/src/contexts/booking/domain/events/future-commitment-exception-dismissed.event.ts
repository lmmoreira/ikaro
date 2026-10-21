import { DomainEvent } from '../../../../shared/domain/domain-event';

interface FutureCommitmentExceptionDismissedData extends Record<string, unknown> {
  exceptionId: string;
  resolvedByStaffId: string | null;
  resolutionReason: string;
}

// docs/DOMAIN_EVENTS.md § FutureCommitmentExceptionDismissed (UC-077 A2) — audit-log consumer
// only. resolvedByStaffId is null when the system closed the entry (M23-S48).
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
