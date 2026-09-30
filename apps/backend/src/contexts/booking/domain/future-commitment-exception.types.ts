export type FutureCommitmentExceptionStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

// Closed value sets, defined once — every later story that raises an entry (M23-S05's approval-time
// occurrence conflicts, an hours-reduction trigger) extends these instead of inventing strings.
export type FutureCommitmentExceptionSourceType = 'RESOURCE_DEACTIVATION';
export type FutureCommitmentExceptionAffectedType = 'BOOKING';

export type FutureCommitmentExceptionResolutionType = 'KEEP' | 'REASSIGN' | 'RESCHEDULE' | 'CANCEL';

// Advisory only: computed at raise time, always revalidated when the manager resolves.
export interface FutureCommitmentAlternative {
  resourceId: string;
  resourceName: string;
}

export interface FutureCommitmentExceptionProps {
  id: string;
  tenantId: string;
  sourceType: FutureCommitmentExceptionSourceType;
  sourceId: string;
  affectedType: FutureCommitmentExceptionAffectedType;
  affectedId: string;
  status: FutureCommitmentExceptionStatus;
  ownerStaffId: string | null;
  resolutionType: FutureCommitmentExceptionResolutionType | null;
  resolutionReason: string | null;
  resolvedByStaffId: string | null;
  resolvedAt: Date | null;
  notificationOutcome: string | null;
  alternatives: FutureCommitmentAlternative[];
  createdAt: Date;
}

export interface RaiseFutureCommitmentExceptionOptions {
  tenantId: string;
  sourceType: FutureCommitmentExceptionSourceType;
  sourceId: string;
  affectedType: FutureCommitmentExceptionAffectedType;
  affectedId: string;
  alternatives: FutureCommitmentAlternative[];
  correlationId: string;
}
