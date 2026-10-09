import {
  AvailabilityAlertOutcomeReport,
  IAvailabilityAlertOutcomePort,
} from '../../contexts/notification/application/ports/availability-alert-outcome.port';

export class InMemoryAvailabilityAlertOutcomePort implements IAvailabilityAlertOutcomePort {
  readonly reports: AvailabilityAlertOutcomeReport[] = [];
  private failWith?: Error;

  recordOutcome(report: AvailabilityAlertOutcomeReport): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.reports.push(report);
    return Promise.resolve();
  }

  // Every following report throws, to prove a lost report never masks the real result.
  failAlways(error: Error): void {
    this.failWith = error;
  }
}
