import {
  AvailabilityAlertOutcomeReport,
  IAvailabilityAlertOutcomePort,
} from '../../contexts/notification/application/ports/availability-alert-outcome.port';

export class InMemoryAvailabilityAlertOutcomePort implements IAvailabilityAlertOutcomePort {
  readonly reports: AvailabilityAlertOutcomeReport[] = [];
  private failWith?: Error;

  async recordOutcome(report: AvailabilityAlertOutcomeReport): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.reports.push(report);
  }

  // Every following report throws, to prove a lost report never masks the real result.
  failAlways(error: Error): void {
    this.failWith = error;
  }
}
