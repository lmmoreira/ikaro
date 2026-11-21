import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { utcDateString } from '../../../../shared/utils/calendar-date';
import { mapConcurrentlyIsolated } from '../../../../shared/utils/concurrent-isolated';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import {
  BILLING_JOB_PAGE_SIZE,
  FULL_RECONCILE_HOUR_UTC,
  FULL_RECONCILE_INTERVAL_HOURS,
  RECONCILE_AT_RISK_TRIAL_DAYS,
  RECONCILE_CONCURRENCY,
  RECONCILE_PAID_WINDOW_DAYS,
  RECONCILE_RUN_BUDGET_MS,
  RECONCILE_RUN_LIMIT,
} from '../../domain/billing-constants';
import {
  CHARGE_REPOSITORY,
  ChargeRef,
  DueChargeRef,
  IChargeRepository,
  PaidChargeRef,
  RecoveryChargeRef,
} from '../ports/charge-repository.port';
import {
  IProviderHealthRepository,
  PROVIDER_HEALTH_REPOSITORY,
} from '../ports/provider-health-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import { ReconcileOneChargeUseCase } from '../use-cases/reconcile-one-charge.use-case';
import { RecordReconcilePassUseCase } from '../use-cases/record-reconcile-pass.use-case';
import { RetryProviderChargeCancelUseCase } from '../use-cases/retry-provider-charge-cancel.use-case';

export interface ReconcileChargesJobInput {
  correlationId: string;
}

export type ReconcileScope = 'AT_RISK' | 'FULL';

export interface ReconcileChargesJobResult {
  scope: ReconcileScope;
  /** The distinct charges read at the provider (the cancel retries are counted apart). */
  checked: number;
  /** Charges whose local state differed from the provider's and was fixed. */
  drifted: number;
  /** Charges whose read or apply threw (a failed selection page is counted apart). */
  failed: number;
  selectionFailed: number;
  /** The run hit `RECONCILE_RUN_LIMIT` before it had paged every selection: it advanced nothing. */
  truncated: boolean;
  outcomes: Record<string, number>;
  cancelRetries: number;
  /** The provider accounts whose `last_reconcile_ok_at` this run advanced. */
  advanced: number;
}

// An instant `days` whole days away (24 h each: these bound a selection, not a calendar day).
const instantAfterDays = (from: Date, days: number): Date =>
  new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

type Fetch<T extends ChargeRef> = (after?: T) => Promise<T[]>;

/** One run's state: what it may still read, what it already read and every failure it kept going past. */
interface Run {
  readonly input: ReconcileChargesJobInput;
  readonly result: ReconcileChargesJobResult;
  /** Charge ids already worked in this run: a charge two selections return is read once. */
  readonly visited: Set<string>;
  /** The provider accounts a read succeeded for. */
  readonly okKeys: Set<string>;
  readonly failures: unknown[];
  /** The instant (ms) after which the run starts no further read. */
  readonly deadline: number;
  remaining: number;
}

/**
 * UC-116, the hourly job. Every run reconciles the at-risk set (open charges due today or earlier,
 * the open `RECOVERY` charges, and the open charges of trials ending within 14 days) and retries the
 * provider cancels still pending; a run in or after `FULL_RECONCILE_HOUR_UTC` whose last complete
 * full pass is older than 24 h widens it to every open charge and every charge paid in the last 35
 * days. It selects its own charges (no tenant in the trigger): each selection is served by its own
 * index and paged by keyset, because a charge the pass leaves open stays selected and the head of a
 * selection asked for again would starve the rows behind it. At most `RECONCILE_RUN_LIMIT` charges
 * are read per run, `RECONCILE_CONCURRENCY` at a time, and none is started after
 * `RECONCILE_RUN_BUDGET_MS`, so a run ends well inside the push subscription's ack deadline whatever
 * the provider's latency; a run that hits either bound is truncated and advances nothing (no cursor:
 * the next run re-selects, oldest first). `last_reconcile_ok_at` advances per provider account only on a
 * run that was not truncated and in which that account answered; `last_full_reconcile_at` only when
 * the full pass also read every charge and every selection page without a failure. One charge's failure never stops the others: every
 * charge is tried, the run logs its one `billing_reconcile_run` line (S36's alerts read it) and then
 * rethrows the first failure, so the trigger message is nacked and redelivered.
 */
@Injectable()
export class ReconcileChargesJob {
  private readonly logger = new AppLogger(ReconcileChargesJob.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(PROVIDER_HEALTH_REPOSITORY) private readonly health: IProviderHealthRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly reconcileOne: ReconcileOneChargeUseCase,
    private readonly retryCancel: RetryProviderChargeCancelUseCase,
    private readonly recordPass: RecordReconcilePassUseCase,
  ) {}

  async run(input: ReconcileChargesJobInput): Promise<ReconcileChargesJobResult> {
    const now = this.clock.now();
    const keys = await this.subscriptions.listMerchantProfileKeys();
    const scope = await this.scopeOf(now, keys);
    const run: Run = {
      input,
      result: {
        scope,
        checked: 0,
        drifted: 0,
        failed: 0,
        selectionFailed: 0,
        truncated: false,
        outcomes: {},
        cancelRetries: 0,
        advanced: 0,
      },
      visited: new Set(),
      okKeys: new Set(),
      failures: [],
      deadline: now.getTime() + RECONCILE_RUN_BUDGET_MS,
      remaining: RECONCILE_RUN_LIMIT,
    };
    // The pending provider cancels go first: they are few, and a truncated read pass would otherwise
    // starve them (a cancelled charge no read selection returns), though one may already be paid.
    await this.page<DueChargeRef>(
      run,
      (after) => this.charges.listProviderCancelPendingForJob(BILLING_JOB_PAGE_SIZE, after),
      (ref) => this.cancelUnit(run, ref),
    );
    await this.readSelections(run, now, scope);
    if (!run.result.truncated) await this.advance(run, keys, now);
    this.logger.log('billing_reconcile_run', { correlationId: input.correlationId, ...run.result });
    if (run.failures.length > 0) throw run.failures[0];
    return run.result;
  }

  // The full pass is due when it is at or past the daily hour and some provider account has no
  // complete full pass in the last 24 h (including a redelivery after the hour, and a new account).
  private async scopeOf(now: Date, keys: readonly string[]): Promise<ReconcileScope> {
    if (now.getUTCHours() < FULL_RECONCILE_HOUR_UTC) return 'AT_RISK';
    const staleBefore = now.getTime() - FULL_RECONCILE_INTERVAL_HOURS * 3_600_000;
    const rows = await mapSequentially(keys, (key) => this.health.findByKey(key));
    const due = rows.some(
      (row) => row?.lastFullReconcileAt == null || row.lastFullReconcileAt.getTime() <= staleBefore,
    );
    return due ? 'FULL' : 'AT_RISK';
  }

  private async readSelections(run: Run, now: Date, scope: ReconcileScope): Promise<void> {
    const size = BILLING_JOB_PAGE_SIZE;
    const read = (ref: ChargeRef): Promise<void> => this.reconcileUnit(run, ref);
    // Charges are due in each subscription's own zone: the UTC date is a superset, and the sync reads
    // the provider's truth either way.
    const today = utcDateString(now);
    await this.page<DueChargeRef>(
      run,
      (after) => this.charges.listOpenDueForJob(today, size, after),
      read,
    );
    await this.page<RecoveryChargeRef>(
      run,
      (after) => this.charges.listOpenRecoveryForJob(size, after),
      read,
    );
    const trialCutoff = instantAfterDays(now, RECONCILE_AT_RISK_TRIAL_DAYS);
    await this.page<DueChargeRef>(
      run,
      (after) => this.charges.listOpenTrialChargesForJob(trialCutoff, size, after),
      read,
    );
    if (scope === 'AT_RISK') return;
    await this.page<DueChargeRef>(run, (after) => this.charges.listOpenForJob(size, after), read);
    const paidSince = instantAfterDays(now, -RECONCILE_PAID_WINDOW_DAYS);
    await this.page<PaidChargeRef>(
      run,
      (after) => this.charges.listRecentlyPaidForJob(paidSince, size, after),
      read,
    );
  }

  // Page by page from the last row it was given, within the run's budget: a row past the budget
  // makes the run truncated and ends every selection.
  private async page<T extends ChargeRef>(
    run: Run,
    fetch: Fetch<T>,
    work: (ref: T) => Promise<void>,
    after?: T,
  ): Promise<void> {
    if (run.result.truncated) return;
    const rows = await fetch(after).catch((err: unknown) => {
      run.failures.push(err);
      run.result.selectionFailed += 1;
      return null;
    });
    if (rows === null) return;
    const fresh = rows.filter((row) => !run.visited.has(row.id));
    const take = fresh.slice(0, run.remaining);
    if (take.length < fresh.length) run.result.truncated = true;
    for (const row of take) run.visited.add(row.id);
    run.remaining -= take.length;
    await mapConcurrentlyIsolated(
      take,
      RECONCILE_CONCURRENCY,
      (row) => this.inBudget(run, row, work),
      {
        onFailure: (row, err) => this.noteChargeFailure(run, row, err),
        summarize: (failed) => `${failed.length} charges failed to reconcile`,
      },
    ).catch(() => undefined);
    const last = rows.at(-1);
    if (run.result.truncated || rows.length < BILLING_JOB_PAGE_SIZE || last === undefined) return;
    await this.page(run, fetch, work, last);
  }

  // The count limit does not bound the time (a slow provider makes 1,500 reads outlast the ack
  // deadline): past the run's deadline a charge is not started, and the run is truncated.
  private async inBudget<T extends ChargeRef>(
    run: Run,
    row: T,
    work: (ref: T) => Promise<void>,
  ): Promise<void> {
    if (this.clock.now().getTime() >= run.deadline) {
      run.result.truncated = true;
      return;
    }
    await work(row);
  }

  private async reconcileUnit(run: Run, ref: ChargeRef): Promise<void> {
    run.result.checked += 1;
    const read = await this.reconcileOne.execute({
      tenantId: ref.tenantId,
      chargeId: ref.id,
      correlationId: run.input.correlationId,
    });
    run.result.outcomes[read.outcome] = (run.result.outcomes[read.outcome] ?? 0) + 1;
    if (read.outcome === 'APPLIED') run.result.drifted += 1;
    if (read.merchantProfileKey !== null) run.okKeys.add(read.merchantProfileKey);
  }

  private async cancelUnit(run: Run, ref: ChargeRef): Promise<void> {
    run.result.cancelRetries += 1;
    await this.retryCancel.execute({
      tenantId: ref.tenantId,
      chargeId: ref.id,
      correlationId: run.input.correlationId,
    });
  }

  // A full pass counts as done only when every charge was read and every selection page was
  // fetched: a failed read leaves the rest of the day without it otherwise, since the redelivery
  // would run as the at-risk scope. (`last_reconcile_ok_at` only says the account answered.)
  private fullPassComplete(run: Run): boolean {
    const { scope, failed, selectionFailed } = run.result;
    return scope === 'FULL' && failed === 0 && selectionFailed === 0;
  }

  // A run that was not truncated stamps each provider account that answered; an account with no charge to read is
  // asked for its health first. An account that fails stays unstamped and fails the run.
  private async advance(run: Run, keys: readonly string[], now: Date): Promise<void> {
    await mapSequentiallyIsolated(
      keys,
      async (key) => {
        await this.recordPass.execute({
          merchantProfileKey: key,
          at: now,
          fullPass: this.fullPassComplete(run),
          providerReadSucceeded: run.okKeys.has(key),
        });
        run.result.advanced += 1;
      },
      {
        onFailure: (key, err) => this.noteKeyFailure(run, key, err),
        summarize: (failed) => `${failed.length} provider accounts could not be reconciled`,
      },
    ).catch(() => undefined);
  }

  private noteChargeFailure(run: Run, ref: ChargeRef, err: unknown): void {
    run.result.failed += 1;
    this.logFailure(run, { tenantId: ref.tenantId, chargeId: ref.id }, err);
  }

  private noteKeyFailure(run: Run, merchantProfileKey: string, err: unknown): void {
    this.logFailure(run, { merchantProfileKey }, err);
  }

  private logFailure(run: Run, subject: Record<string, string>, err: unknown): void {
    run.failures.push(err);
    this.logger.error('billing_reconcile_failed', undefined, {
      ...subject,
      correlationId: run.input.correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
