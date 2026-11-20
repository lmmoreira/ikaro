import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import { BILLING_ISSUE_JOB_BATCH_LIMIT } from '../../domain/billing-constants';
import {
  CHARGE_REPOSITORY,
  type ChargeRef,
  IChargeRepository,
} from '../ports/charge-repository.port';
import {
  type ProviderChargeCreationResult,
  ProviderChargeCreationService,
} from '../services/provider-charge-creation.service';

export interface RetryPendingChargeCreationUseCaseInput {
  correlationId: string;
}

export interface RetryPendingChargeCreationUseCaseResult {
  /** The charges the retry query selected (`PENDING` at the provider, lease free). */
  selected: number;
  /** How many of them are payable now. */
  ready: number;
}

/**
 * UC-113 A2: re-attempts the provider creation of every open charge still `PENDING` there, through
 * the same lease and the same idempotent `createCharge` as the first attempt, so it can never insert a
 * second period charge or create a second provider charge. It reaches a `SUSPENDED` tenant's
 * recovery charge too (the selection has no status filter). A charge held for lack of identity or
 * a profile with no adapter is selected every run and costs nothing: no provider call, no attempt.
 */
@Injectable()
export class RetryPendingChargeCreationUseCase {
  private readonly logger = new AppLogger(RetryPendingChargeCreationUseCase.name);

  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly creation: ProviderChargeCreationService,
  ) {}

  async execute(
    input: RetryPendingChargeCreationUseCaseInput,
  ): Promise<RetryPendingChargeCreationUseCaseResult> {
    const refs = await this.charges.listPendingCreationForJob(
      this.clock.now(),
      BILLING_ISSUE_JOB_BATCH_LIMIT,
    );
    if (refs.length >= BILLING_ISSUE_JOB_BATCH_LIMIT) {
      this.logger.warn('billing_retry_batch_full: the rest wait for the next run', {
        limit: BILLING_ISSUE_JOB_BATCH_LIMIT,
      });
    }
    const results = await mapSequentiallyIsolated<ChargeRef, ProviderChargeCreationResult>(
      refs,
      (ref) =>
        this.creation.execute({
          tenantId: ref.tenantId,
          chargeId: ref.id,
          correlationId: input.correlationId,
        }),
      {
        onFailure: (ref, err) =>
          this.logger.error('billing_charge_creation_retry_failed', undefined, {
            tenantId: ref.tenantId,
            chargeId: ref.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        summarize: (failed) => `${failed.length} charge creation retries failed`,
      },
    );
    return { selected: refs.length, ready: results.filter((r) => r === 'READY').length };
  }
}
