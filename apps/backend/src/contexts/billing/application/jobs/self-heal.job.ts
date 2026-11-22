import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { ProviderAccountsService } from '../services/provider-accounts.service';
import {
  CheckProviderHealthUseCase,
  type CheckProviderHealthUseCaseResult,
} from '../use-cases/check-provider-health.use-case';
import {
  EvaluateSuspensionFreezeUseCase,
  type EvaluateSuspensionFreezeUseCaseResult,
} from '../use-cases/evaluate-suspension-freeze.use-case';
import {
  RepairMissingSubscriptionsStep,
  type RepairMissingSubscriptionsStepResult,
} from './repair-missing-subscriptions.helpers';
import {
  ReleaseStaleSignupRegistrationsUseCase,
  type ReleaseStaleSignupRegistrationsUseCaseResult,
} from '../use-cases/release-stale-signup-registrations.use-case';

export interface SelfHealJobInput {
  correlationId: string;
}

/** One step's outcome: its result, or `failed` when it threw (the others still ran). */
export type StepOutcome<T> = { ok: true; value: T } | { ok: false };

export interface SelfHealJobResult {
  repair: StepOutcome<Omit<RepairMissingSubscriptionsStepResult, 'failures'>>;
  release: StepOutcome<ReleaseStaleSignupRegistrationsUseCaseResult>;
  health: StepOutcome<CheckProviderHealthUseCaseResult[]>;
  freeze: StepOutcome<EvaluateSuspensionFreezeUseCaseResult[]>;
}

/**
 * UC-140, the hourly job: four small independent steps (its own selection each, no operational
 * status filter) — (1) provisioning repair, (1b) stale registration release, (2) provider health,
 * (3) suspension freeze. A step's failure never stops the others; the run logs its one
 * `billing_self_heal_run` line with the four step results (S36's alerts read it), then rethrows the
 * first failure, so the trigger message is nacked and redelivered (every step is idempotent).
 * Provider accounts are the keys `ProviderAccountsService` serves (reconcile's too): a key no adapter serves yet is skipped and logged, never a failed step.
 *
 * Nothing here raises a domain event: a repaired trial raises nothing new.
 */
@Injectable()
export class SelfHealJob {
  private readonly logger = new AppLogger(SelfHealJob.name);

  constructor(
    private readonly providerAccounts: ProviderAccountsService,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly repair: RepairMissingSubscriptionsStep,
    private readonly release: ReleaseStaleSignupRegistrationsUseCase,
    private readonly checkHealth: CheckProviderHealthUseCase,
    private readonly evaluateFreeze: EvaluateSuspensionFreezeUseCase,
  ) {}

  async run(input: SelfHealJobInput): Promise<SelfHealJobResult> {
    const now = this.clock.now();
    const { correlationId } = input;
    const failures: unknown[] = [];
    const attempt = <T>(step: string, work: () => Promise<T>): Promise<StepOutcome<T>> =>
      this.attempt({ correlationId, failures }, step, work);

    const repair = await attempt('repair', async () => {
      const { failures: repairFailures, ...counts } = await this.repair.execute({
        now,
        correlationId,
      });
      // The per-tenant failures were logged with their tenant ids; the step still counts as failed.
      if (repairFailures.length > 0) failures.push(repairFailures[0]);
      return counts;
    });
    const release = await attempt('release', () => this.release.execute({ now }));
    const keys = await attempt('provider-accounts', () => this.providerAccounts.listServed());
    const accounts = keys.ok ? keys.value : [];
    const health = keys.ok
      ? await attempt('health', () =>
          this.perKey(accounts, (key) =>
            this.checkHealth.execute({ merchantProfileKey: key, now, correlationId }),
          ),
        )
      : ({ ok: false } as const);
    const freeze = keys.ok
      ? await attempt('freeze', () =>
          this.perKey(accounts, (key) =>
            this.evaluateFreeze.execute({ merchantProfileKey: key, now, correlationId }),
          ),
        )
      : ({ ok: false } as const);

    const result: SelfHealJobResult = { repair, release, health, freeze };
    this.logger.log('billing_self_heal_run', { correlationId, ...result });
    if (failures.length > 0) throw failures[0];
    return result;
  }

  // A step's failure is kept and logged, never thrown here: the other steps still run.
  private async attempt<T>(
    run: { correlationId: string; failures: unknown[] },
    step: string,
    work: () => Promise<T>,
  ): Promise<StepOutcome<T>> {
    try {
      return { ok: true, value: await work() };
    } catch (err) {
      run.failures.push(err);
      this.logger.error('billing_self_heal_step_failed', undefined, {
        step,
        correlationId: run.correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    }
  }

  // One provider account's failure must not hide the others: every account is tried, then the
  // step throws the first failure.
  private async perKey<T>(
    keys: readonly string[],
    work: (key: string) => Promise<T>,
  ): Promise<T[]> {
    const errors: unknown[] = [];
    const values = await mapSequentially(keys, async (key) => {
      try {
        return [await work(key)];
      } catch (err) {
        errors.push(err);
        return [];
      }
    });
    if (errors.length > 0) throw errors[0];
    return values.flat();
  }
}
