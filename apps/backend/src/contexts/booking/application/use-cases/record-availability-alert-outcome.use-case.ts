import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { AvailabilityAlertAttemptOutcome } from '../../domain/availability-alert.types';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';

export interface RecordAvailabilityAlertOutcomeUseCaseInput {
  tenantId: string;
  alertId: string;
  correlationId: string;
  // ISO-8601 UTC instants of the half-open window the match was recorded for (the event's
  // matchingWindowStart / matchingWindowEnd).
  matchingWindowStart: string;
  matchingWindowEnd: string;
  outcome: Exclude<AvailabilityAlertAttemptOutcome, 'PENDING'>;
  // The redacted reason of a failed try; ignored for SENT.
  errorMessage: string | null;
}

export interface RecordAvailabilityAlertOutcomeUseCaseResult {
  recorded: boolean;
}

// M23-S38: the Notification context reports how the availability-alert email went. The alert
// itself stays NOTIFIED whatever the outcome (it is never matched twice); only the attempt row
// changes. A row that no longer exists (retention purged the alert) is logged, not an error.
@Injectable()
export class RecordAvailabilityAlertOutcomeUseCase {
  private readonly logger = new AppLogger(RecordAvailabilityAlertOutcomeUseCase.name);

  constructor(
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: RecordAvailabilityAlertOutcomeUseCaseInput,
  ): Promise<RecordAvailabilityAlertOutcomeUseCaseResult> {
    const recorded = await this.txManager.run(() =>
      this.alertRepo.recordAttemptOutcome(
        input.tenantId,
        input.alertId,
        {
          startsAt: new Date(input.matchingWindowStart),
          endsAt: new Date(input.matchingWindowEnd),
        },
        input.outcome,
        input.outcome === 'FAILED' ? input.errorMessage : null,
      ),
    );
    if (!recorded) {
      this.logger.warn('Availability alert attempt not found — outcome not recorded', {
        tenantId: input.tenantId,
        alertId: input.alertId,
        correlationId: input.correlationId,
      });
    }
    return { recorded };
  }
}
