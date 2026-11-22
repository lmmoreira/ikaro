import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  SUSPENSION_FREEZE_FAILED_HEALTH_READS,
  SUSPENSION_FREEZE_RECONCILE_STALE_HOURS,
} from '../../domain/billing-constants';
import type { ProviderHealth } from '../../domain/provider-health';
import {
  IProviderHealthRepository,
  PROVIDER_HEALTH_REPOSITORY,
} from '../ports/provider-health-repository.port';

export interface EvaluateSuspensionFreezeUseCaseInput {
  merchantProfileKey: string;
  now: Date;
  correlationId: string;
}

export type FreezeChange = 'SET' | 'CLEARED' | 'NONE';
export type FreezeReason = 'RECONCILE_STALE' | 'HEALTH_READS_FAILED';

export interface EvaluateSuspensionFreezeUseCaseResult {
  merchantProfileKey: string;
  frozen: boolean;
  change: FreezeChange;
  reason: FreezeReason | null;
}

/**
 * UC-140 step 3, for one provider account: whether the status sweep may suspend for non-payment.
 * The freeze is *set* when the account's `last_reconcile_ok_at` is older than 24 hours, or its
 * provider health read failed on two consecutive runs (`health_read_failures`, written by the
 * health step); it is *cleared* only when `last_reconcile_ok_at` is newer than the freeze start
 * and the latest health read succeeded. Reconcile advances `last_reconcile_ok_at` only after a real
 * provider call, so an empty reconcile cannot clear it. A key with no `provider_health` row is not
 * frozen (a fresh environment is never frozen by an absent row); a row whose
 * `last_reconcile_ok_at` is NULL counts from `updated_at`.
 *
 * The state is read from and written to the row alone (the job is stateless between runs), and
 * `freeze_active` and `freeze_since` change in one statement (`CHK_billing_provider_health_freeze`).
 */
@Injectable()
export class EvaluateSuspensionFreezeUseCase {
  private readonly logger = new AppLogger(EvaluateSuspensionFreezeUseCase.name);

  constructor(
    @Inject(PROVIDER_HEALTH_REPOSITORY) private readonly health: IProviderHealthRepository,
  ) {}

  async execute(
    input: EvaluateSuspensionFreezeUseCaseInput,
  ): Promise<EvaluateSuspensionFreezeUseCaseResult> {
    const { merchantProfileKey, now } = input;
    const row = await this.health.findByKey(merchantProfileKey);
    if (row === null) return this.result(merchantProfileKey, false, 'NONE', null);

    if (!row.freezeActive) {
      const reason = this.setReason(row, now);
      if (reason === null) return this.result(merchantProfileKey, false, 'NONE', null);
      const changed = await this.health.setFreeze(merchantProfileKey, now);
      return this.logged(
        input,
        this.result(merchantProfileKey, true, changed ? 'SET' : 'NONE', reason),
      );
    }

    if (this.canClear(row)) {
      const changed = await this.health.setFreeze(merchantProfileKey, null);
      return this.result(merchantProfileKey, !changed, changed ? 'CLEARED' : 'NONE', null);
    }
    // S36's alert reads this line on every hourly run while the freeze is on.
    return this.logged(input, this.result(merchantProfileKey, true, 'NONE', null));
  }

  private setReason(row: ProviderHealth, now: Date): FreezeReason | null {
    const reference = row.lastReconcileOkAt ?? row.updatedAt;
    const staleBefore = now.getTime() - SUSPENSION_FREEZE_RECONCILE_STALE_HOURS * 3_600_000;
    if (reference.getTime() < staleBefore) return 'RECONCILE_STALE';
    if (row.healthReadFailures >= SUSPENSION_FREEZE_FAILED_HEALTH_READS) {
      return 'HEALTH_READS_FAILED';
    }
    return null;
  }

  private canClear(row: ProviderHealth): boolean {
    return (
      row.freezeSince !== null &&
      row.lastReconcileOkAt !== null &&
      row.lastReconcileOkAt.getTime() > row.freezeSince.getTime() &&
      row.healthReadFailures === 0
    );
  }

  private logged(
    input: EvaluateSuspensionFreezeUseCaseInput,
    result: EvaluateSuspensionFreezeUseCaseResult,
  ): EvaluateSuspensionFreezeUseCaseResult {
    this.logger.warn('billing_suspension_freeze', {
      ...result,
      correlationId: input.correlationId,
    });
    return result;
  }

  private result(
    merchantProfileKey: string,
    frozen: boolean,
    change: FreezeChange,
    reason: FreezeReason | null,
  ): EvaluateSuspensionFreezeUseCaseResult {
    return { merchantProfileKey, frozen, change, reason };
  }
}
