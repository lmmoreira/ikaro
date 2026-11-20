import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { utcDateString } from '../../../../shared/utils/calendar-date';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import { BILLING_JOB_PAGE_SIZE } from '../../domain/billing-constants';
import {
  CHARGE_REPOSITORY,
  IChargeRepository,
  OverdueChargeRef,
} from '../ports/charge-repository.port';
import {
  IProviderHealthRepository,
  PROVIDER_HEALTH_REPOSITORY,
} from '../ports/provider-health-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
  SweepDueRef,
} from '../ports/subscription-repository.port';
import type { RecoveryPriceCache } from '../services/recovery-charge-planner.service';
import type { SweepStep } from '../services/subscription-sweep-rules.service';
import {
  type SweepOneOutcome,
  SweepOneSubscriptionUseCase,
} from '../use-cases/sweep-one-subscription.use-case';

export interface SweepSubscriptionStatusesJobInput {
  correlationId: string;
}

export interface SweepSubscriptionStatusesJobResult {
  /** The distinct subscriptions the five selections returned and the sweep visited. */
  selected: number;
  outcomes: Partial<Record<SweepOneOutcome, number>>;
  /** What the run changed, per transition. */
  steps: Partial<Record<SweepStep, number>>;
  /** Suspensions that were due but waited for a provider answer. */
  deferred: number;
}

/** One selection page: a `tenantId` and whatever the next page's keyset needs. */
type Fetch<T extends { tenantId: string }> = (after?: T) => Promise<T[]>;

/** One run's state: what it selects with, what it already did and every failure it kept going past. */
interface SweepRun {
  readonly input: SweepSubscriptionStatusesJobInput;
  readonly frozenProfileKeys: ReadonlySet<string>;
  readonly priceCache: RecoveryPriceCache;
  /** Tenants already swept in this run: one selected by two rules is swept once. */
  readonly visited: Set<string>;
  readonly result: SweepSubscriptionStatusesJobResult;
  readonly failures: unknown[];
}

/**
 * UC-115, the hourly job: it selects its own subscriptions (no tenant id in the trigger) through
 * five selections, each served by its own standalone index (overdue charges, trials that ended,
 * subscriptions past their grace, subscriptions whose `cancelAt` is reached), pages each by keyset
 * until none is left, and sweeps every tenant it finds once, in its own transaction. A subscription
 * the sweep leaves as it is (a trial inside its margin, a frozen profile) stays selected, so asking
 * for the head of a selection again would starve the rows behind it. The suspension freeze rows are
 * read once for the run, and so is the price lookup the recovery charges share. One subscription's
 * failure never stops the others: every unit is tried, the run logs its one
 * `billing_status_sweep_run` line (S36's alerts read it) and then rethrows the first failure, so
 * the trigger message is nacked and redelivered.
 */
@Injectable()
export class SweepSubscriptionStatusesJob {
  private readonly logger = new AppLogger(SweepSubscriptionStatusesJob.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(PROVIDER_HEALTH_REPOSITORY) private readonly health: IProviderHealthRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly sweepOne: SweepOneSubscriptionUseCase,
  ) {}

  async run(input: SweepSubscriptionStatusesJobInput): Promise<SweepSubscriptionStatusesJobResult> {
    const now = this.clock.now();
    const sweep: SweepRun = {
      input,
      // A freeze that cannot be read fails the run: suspending on a guess is the one wrong answer.
      frozenProfileKeys: new Set(await this.health.listFrozenKeys()),
      priceCache: new Map(),
      visited: new Set(),
      result: { selected: 0, outcomes: {}, steps: {}, deferred: 0 },
      failures: [],
    };
    // Charges are due in each subscription's own zone, so the selection takes the UTC date and
    // each subscription re-checks its local date (a charge due today UTC can still be a day ahead).
    const utcToday = utcDateString(now);
    await this.sweepSelection<OverdueChargeRef>(sweep, (after) =>
      this.charges.listOverdueCandidatesForJob(utcToday, BILLING_JOB_PAGE_SIZE, after),
    );
    await this.sweepSelection<SweepDueRef>(sweep, (after) =>
      this.subscriptions.findCancelDueForJob(now, BILLING_JOB_PAGE_SIZE, after),
    );
    await this.sweepSelection<SweepDueRef>(sweep, (after) =>
      this.subscriptions.findTrialEndedForJob(now, BILLING_JOB_PAGE_SIZE, after),
    );
    await this.sweepSelection<SweepDueRef>(sweep, (after) =>
      this.subscriptions.findGraceExpiredForJob(now, BILLING_JOB_PAGE_SIZE, after),
    );
    this.logger.log('billing_status_sweep_run', {
      correlationId: input.correlationId,
      ...sweep.result,
      failed: sweep.failures.length,
    });
    if (sweep.failures.length > 0) throw sweep.failures[0];
    return sweep.result;
  }

  // Page by page from the last row it was given. A page's failure is kept and the next page still runs.
  private async sweepSelection<T extends { tenantId: string }>(
    sweep: SweepRun,
    fetch: Fetch<T>,
    after?: T,
  ): Promise<void> {
    const page = await fetch(after).catch((err: unknown) => {
      sweep.failures.push(err);
      return null;
    });
    if (page === null) return;
    await this.sweepPage(sweep, page).catch((err: unknown) => {
      sweep.failures.push(err);
    });
    const last = page.at(-1);
    if (page.length < BILLING_JOB_PAGE_SIZE || last === undefined) return;
    await this.sweepSelection(sweep, fetch, last);
  }

  private async sweepPage(sweep: SweepRun, page: readonly { tenantId: string }[]): Promise<void> {
    const tenantIds = [...new Set(page.map((ref) => ref.tenantId))].filter(
      (tenantId) => !sweep.visited.has(tenantId),
    );
    await mapSequentiallyIsolated(
      tenantIds,
      async (tenantId) => {
        sweep.visited.add(tenantId);
        const swept = await this.sweepOne.execute({
          tenantId,
          correlationId: sweep.input.correlationId,
          frozenProfileKeys: sweep.frozenProfileKeys,
          priceCache: sweep.priceCache,
        });
        this.tally(sweep.result, swept);
      },
      {
        onFailure: (tenantId, err) =>
          this.logger.error('billing_sweep_failed', undefined, {
            tenantId,
            correlationId: sweep.input.correlationId,
            error: err instanceof Error ? err.message : String(err),
          }),
        summarize: (failed) => `${failed.length} subscriptions failed to sweep`,
      },
    );
  }

  private tally(
    result: SweepSubscriptionStatusesJobResult,
    swept: { outcome: SweepOneOutcome; steps: readonly SweepStep[]; deferred: boolean },
  ): void {
    result.selected += 1;
    result.outcomes[swept.outcome] = (result.outcomes[swept.outcome] ?? 0) + 1;
    for (const step of swept.steps) result.steps[step] = (result.steps[step] ?? 0) + 1;
    if (swept.deferred) result.deferred += 1;
  }
}
