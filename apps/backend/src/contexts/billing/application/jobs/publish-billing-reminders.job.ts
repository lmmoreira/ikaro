import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { addDaysUTC, utcDateString } from '../../../../shared/utils/calendar-date';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import { BILLING_JOB_PAGE_SIZE } from '../../domain/billing-constants';
import type { BillingReminderKind } from '../../domain/commands/billing-reminder-due.command';
import {
  CHARGE_WINDOW_AHEAD_DAYS,
  CHARGE_WINDOW_BEHIND_DAYS,
  TRIAL_WINDOW_AHEAD_DAYS,
  TRIAL_WINDOW_BEHIND_DAYS,
} from '../../domain/reminder-schedule';
import {
  CHARGE_REPOSITORY,
  DueChargeRef,
  IChargeRepository,
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
import {
  type PublishSubscriptionRemindersOutcome,
  PublishSubscriptionRemindersUseCase,
} from '../use-cases/publish-subscription-reminders.use-case';

export interface PublishBillingRemindersJobInput {
  correlationId: string;
}

export interface PublishBillingRemindersJobResult {
  /** The distinct subscriptions the two selections returned and the job visited. */
  selected: number;
  outcomes: Partial<Record<PublishSubscriptionRemindersOutcome, number>>;
  /** Reminders written, per kind. */
  published: Partial<Record<BillingReminderKind, number>>;
  /** Day-12 overdue reminders withheld because the provider account is frozen. */
  skippedFrozen: number;
  /** The subscriptions whose reminders threw (a failed selection page is counted apart, in the run log). */
  failed: number;
}

type Fetch<T extends { tenantId: string }> = (after?: T) => Promise<T[]>;

interface ReminderRun {
  readonly input: PublishBillingRemindersJobInput;
  readonly frozenProfileKeys: ReadonlySet<string>;
  /** Tenants already visited in this run: one reached by both selections is visited once. */
  readonly visited: Set<string>;
  readonly result: PublishBillingRemindersJobResult;
  readonly failures: unknown[];
  selectionFailures: number;
}

const DAY_MS = 86_400_000;

/**
 * UC-139, the daily job: it selects its own subscriptions (no tenant id in the trigger) through two
 * selections, each served by its own standalone index (trials ending in a window, open charges due
 * in a window), pages each by keyset until none is left, and visits every tenant it finds once. The
 * windows are as wide as the reminder offsets need, so a charge that is never paid leaves them once
 * its last reminder has passed; what falls on today's exact day is decided per subscription, in its
 * own timezone, by the use case. The suspension-freeze rows are read once for the run, and a read
 * that fails fails the run before anything is published. One subscription's failure never stops the
 * others: every unit is tried, the run logs its one `billing_reminders_run` line and then rethrows
 * the first failure, so the trigger message is nacked and redelivered (the outbox `dedup_key` makes
 * the rerun write only what is still missing).
 */
@Injectable()
export class PublishBillingRemindersJob {
  private readonly logger = new AppLogger(PublishBillingRemindersJob.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(PROVIDER_HEALTH_REPOSITORY) private readonly health: IProviderHealthRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly publishOne: PublishSubscriptionRemindersUseCase,
  ) {}

  async run(input: PublishBillingRemindersJobInput): Promise<PublishBillingRemindersJobResult> {
    const now = this.clock.now();
    const run: ReminderRun = {
      input,
      // A freeze that cannot be read fails the run: a "you will be suspended on …" warning sent on
      // a guess is the one wrong answer.
      frozenProfileKeys: new Set(await this.health.listFrozenKeys()),
      visited: new Set(),
      result: { selected: 0, outcomes: {}, published: {}, skippedFrozen: 0, failed: 0 },
      failures: [],
      selectionFailures: 0,
    };

    const trialFrom = new Date(now.getTime() - TRIAL_WINDOW_BEHIND_DAYS * DAY_MS);
    const trialTo = new Date(now.getTime() + TRIAL_WINDOW_AHEAD_DAYS * DAY_MS);
    await this.visitSelection<SweepDueRef>(run, (after) =>
      this.subscriptions.findTrialEndingForJob(trialFrom, trialTo, BILLING_JOB_PAGE_SIZE, after),
    );
    // A charge is due in its subscription's own zone, so the UTC dates are a superset: the use case
    // re-checks the local date.
    const utcToday = utcDateString(now);
    const dueFrom = addDaysUTC(utcToday, -CHARGE_WINDOW_BEHIND_DAYS);
    const dueTo = addDaysUTC(utcToday, CHARGE_WINDOW_AHEAD_DAYS);
    await this.visitSelection<DueChargeRef>(run, (after) =>
      this.charges.listOpenDueBetweenForJob(dueFrom, dueTo, BILLING_JOB_PAGE_SIZE, after),
    );

    this.logger.log('billing_reminders_run', {
      correlationId: input.correlationId,
      ...run.result,
      selectionFailed: run.selectionFailures,
    });
    if (run.failures.length > 0) throw run.failures[0];
    return run.result;
  }

  // Page by page from the last row it was given. A page's failure is kept and the next page still runs.
  private async visitSelection<T extends { tenantId: string }>(
    run: ReminderRun,
    fetch: Fetch<T>,
    after?: T,
  ): Promise<void> {
    const page = await fetch(after).catch((err: unknown) => {
      run.failures.push(err);
      run.selectionFailures += 1;
      return null;
    });
    if (page === null) return;
    await this.visitPage(run, page).catch((err: unknown) => {
      run.failures.push(err);
    });
    const last = page.at(-1);
    if (page.length < BILLING_JOB_PAGE_SIZE || last === undefined) return;
    await this.visitSelection(run, fetch, last);
  }

  private async visitPage(run: ReminderRun, page: readonly { tenantId: string }[]): Promise<void> {
    const tenantIds = [...new Set(page.map((ref) => ref.tenantId))].filter(
      (tenantId) => !run.visited.has(tenantId),
    );
    await mapSequentiallyIsolated(
      tenantIds,
      async (tenantId) => {
        run.visited.add(tenantId);
        run.result.selected += 1;
        const result = await this.publishOne.execute({
          tenantId,
          correlationId: run.input.correlationId,
          frozenProfileKeys: run.frozenProfileKeys,
        });
        const { outcomes, published } = run.result;
        outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
        for (const kind of result.published) published[kind] = (published[kind] ?? 0) + 1;
        run.result.skippedFrozen += result.skippedFrozen;
      },
      {
        onFailure: (tenantId, err) => {
          run.result.failed += 1;
          this.logger.error('billing_reminders_failed', undefined, {
            tenantId,
            correlationId: run.input.correlationId,
            error: err instanceof Error ? err.message : String(err),
          });
        },
        summarize: (failed) => `${failed.length} subscriptions failed to publish reminders`,
      },
    );
  }
}
