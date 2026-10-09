export const AVAILABILITY_ALERT_OUTCOME_PORT = Symbol('IAvailabilityAlertOutcomePort');

export interface AvailabilityAlertOutcomeReport {
  tenantId: string;
  alertId: string;
  correlationId: string;
  // ISO-8601 UTC instants of the matching window the email was sent for.
  matchingWindowStart: string;
  matchingWindowEnd: string;
  outcome: 'SENT' | 'FAILED';
  // The redacted reason of a failed try; null for SENT.
  errorMessage: string | null;
}

// M23-S38: how the availability-alert email went, reported to the Booking context, which owns
// the attempt row. A port rather than an outcome event: no new topic for one status column.
export interface IAvailabilityAlertOutcomePort {
  recordOutcome(report: AvailabilityAlertOutcomeReport): Promise<void>;
}
