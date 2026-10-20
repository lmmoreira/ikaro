export interface FutureCommitmentExceptionResolutionOutcome {
  exceptionId: string;
  outcome: 'RESOLVED' | 'STILL_OPEN';
  errorCode?: string;
}
