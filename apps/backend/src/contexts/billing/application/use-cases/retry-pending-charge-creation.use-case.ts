import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import { BILLING_JOB_PAGE_SIZE } from '../../domain/billing-constants';
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
/** One run's state: the instant its lease cutoff is read at, what it counted and what failed. */
interface RetryRun {
  readonly input: RetryPendingChargeCreationUseCaseInput;
  readonly now: Date;
  selected: number;
  ready: number;
  readonly failures: unknown[];
}

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
    const retry: RetryRun = { input, now: this.clock.now(), selected: 0, ready: 0, failures: [] };
    await this.retryFrom(retry);
    if (retry.failures.length > 0) throw retry.failures[0];
    return { selected: retry.selected, ready: retry.ready };
  }

  // Page by page from the last id it was given: a charge the retry skips stays selected, so asking
  // for the head again would never get past the skipped ones. A page's failure is kept and the next
  // page still runs.
  private async retryFrom(retry: RetryRun, afterId?: string): Promise<void> {
    const page = await this.charges.listPendingCreationForJob(
      retry.now,
      BILLING_JOB_PAGE_SIZE,
      afterId,
    );
    retry.selected += page.length;
    await this.retryPage(retry, page).catch((err: unknown) => {
      retry.failures.push(err);
    });
    if (page.length < BILLING_JOB_PAGE_SIZE) return;
    await this.retryFrom(retry, page[page.length - 1].id);
  }

  private async retryPage(retry: RetryRun, page: readonly ChargeRef[]): Promise<void> {
    const results = await mapSequentiallyIsolated<ChargeRef, ProviderChargeCreationResult>(
      page,
      (ref) =>
        this.creation.execute({
          tenantId: ref.tenantId,
          chargeId: ref.id,
          correlationId: retry.input.correlationId,
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
    retry.ready += results.filter((result) => result === 'READY').length;
  }
}
