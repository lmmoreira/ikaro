import { Injectable } from '@nestjs/common';
import { RecordAvailabilityAlertOutcomeUseCase } from '../../../booking/application/use-cases/record-availability-alert-outcome.use-case';
import {
  AvailabilityAlertOutcomeReport,
  IAvailabilityAlertOutcomePort,
} from '../../application/ports/availability-alert-outcome.port';

@Injectable()
export class NotificationAvailabilityAlertOutcomeAdapter implements IAvailabilityAlertOutcomePort {
  constructor(private readonly recordAttemptOutcome: RecordAvailabilityAlertOutcomeUseCase) {}

  async recordOutcome(report: AvailabilityAlertOutcomeReport): Promise<void> {
    await this.recordAttemptOutcome.execute(report);
  }
}
