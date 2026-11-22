import { Injectable } from '@nestjs/common';
import {
  type CancelProviderChargesResult,
  ProviderChargeCancellationService,
} from '../services/provider-charge-cancellation.service';

export interface RetryProviderChargeCancelUseCaseInput {
  tenantId: string;
  chargeId: string;
  correlationId: string;
}

export type RetryProviderChargeCancelUseCaseResult = CancelProviderChargesResult;

/**
 * UC-116's third step, one charge: a charge that was cancelled locally and flagged
 * `provider_cancel_pending` (the provider cancel did not go through the first time) is cancelled at
 * the provider now and the flag cleared; if the provider says it was just paid, that charge is the
 * payment and goes through the shared apply. The service never throws: a cancel that fails again
 * leaves the flag for the next run.
 */
@Injectable()
export class RetryProviderChargeCancelUseCase {
  constructor(private readonly cancellation: ProviderChargeCancellationService) {}

  execute(
    input: RetryProviderChargeCancelUseCaseInput,
  ): Promise<RetryProviderChargeCancelUseCaseResult> {
    return this.cancellation.execute({
      tenantId: input.tenantId,
      chargeIds: [input.chargeId],
      correlationId: input.correlationId,
    });
  }
}
