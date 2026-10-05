import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { AvailabilityAlertNotFoundError } from '../../domain/errors/availability-alert.error';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';

export interface CancelAvailabilityAlertUseCaseInput {
  alertId: string;
  tenantId: string;
  correlationId: string;
  customerId: string;
}

export interface CancelAvailabilityAlertUseCaseResult {
  id: string;
  status: 'CANCELLED';
}

// UC-072 A2 / UC-076: the customer withdraws their own alert. Cancelling an already-cancelled
// alert is a no-op success; a notified or expired one is read-only history.
@Injectable()
export class CancelAvailabilityAlertUseCase {
  constructor(
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: CancelAvailabilityAlertUseCaseInput,
  ): Promise<CancelAvailabilityAlertUseCaseResult> {
    // Another customer's alert (same tenant) reads as not found, exactly like another tenant's.
    const alert = await this.alertRepo.findById(input.alertId, input.tenantId);
    if (alert?.customerId !== input.customerId) {
      throw new AvailabilityAlertNotFoundError(input.alertId);
    }
    if (alert.cancel(input.correlationId)) {
      await this.txManager.run(() => this.alertRepo.save(alert));
    }
    return { id: alert.id, status: 'CANCELLED' };
  }
}
