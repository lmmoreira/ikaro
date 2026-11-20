import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { addDaysUTC, utcDateString } from '../../../../shared/utils/calendar-date';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import {
  BILLING_ISSUE_JOB_BATCH_LIMIT,
  CHARGE_ISSUE_LEAD_DAYS,
} from '../../domain/billing-constants';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import {
  type IssueChargeOutcome,
  IssueChargeForSubscriptionUseCase,
} from '../use-cases/issue-charge-for-subscription.use-case';
import { RetryPendingChargeCreationUseCase } from '../use-cases/retry-pending-charge-creation.use-case';

export interface IssueNextChargesJobInput {
  correlationId: string;
}

export interface IssueNextChargesJobResult {
  /** The subscriptions the selection returned. */
  selected: number;
  /** Per outcome, how many of them ended that way. */
  outcomes: Partial<Record<IssueChargeOutcome, number>>;
  /** The charges the creation retry selected, and how many of them became payable. */
  retrySelected: number;
  retryReady: number;
}

type IssueStats = Pick<IssueNextChargesJobResult, 'selected' | 'outcomes'>;

/**
 * UC-113, the daily job: it selects its own subscriptions (no tenant id in the trigger) through the
 * standalone partial index on `next_due_date`, with the UTC date plus the lead plus one day of
 * slack because each due date is in its subscription's own zone (each subscription re-checks it
 * there), issues each in its own transactions, then runs the creation retry. One subscription's
 * failure never stops the others and a phase's failure never skips the next one: every unit is
 * tried, the run logs its one `billing_issue_charges_run` line (S36's alerts read it) and then
 * rethrows the first failure, so the trigger message is nacked and redelivered.
 */
@Injectable()
export class IssueNextChargesJob {
  private readonly logger = new AppLogger(IssueNextChargesJob.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly issueOne: IssueChargeForSubscriptionUseCase,
    private readonly retry: RetryPendingChargeCreationUseCase,
  ) {}

  async run(input: IssueNextChargesJobInput): Promise<IssueNextChargesJobResult> {
    const failures: unknown[] = [];
    const stats: IssueStats = { selected: 0, outcomes: {} };
    await this.issueAll(input, stats).catch((err: unknown) => {
      failures.push(err);
    });
    const retried = await this.retry.execute(input).catch((err: unknown) => {
      failures.push(err);
      return { selected: 0, ready: 0 };
    });
    this.logger.log('billing_issue_charges_run', {
      correlationId: input.correlationId,
      ...stats,
      retrySelected: retried.selected,
      retryReady: retried.ready,
      failed: failures.length,
    });
    if (failures.length > 0) throw failures[0];
    return { ...stats, retrySelected: retried.selected, retryReady: retried.ready };
  }

  private async issueAll(input: IssueNextChargesJobInput, stats: IssueStats): Promise<void> {
    const dueOnOrBefore = addDaysUTC(utcDateString(this.clock.now()), CHARGE_ISSUE_LEAD_DAYS + 1);
    const tenantIds = await this.subscriptions.findDueForIssueForJob(
      dueOnOrBefore,
      BILLING_ISSUE_JOB_BATCH_LIMIT,
    );
    stats.selected = tenantIds.length;
    if (tenantIds.length >= BILLING_ISSUE_JOB_BATCH_LIMIT) {
      this.logger.warn('billing_issue_batch_full: the rest wait for the next run', {
        limit: BILLING_ISSUE_JOB_BATCH_LIMIT,
      });
    }
    await mapSequentiallyIsolated(
      tenantIds,
      async (tenantId) => {
        const { outcome } = await this.issueOne.execute({
          tenantId,
          correlationId: input.correlationId,
        });
        stats.outcomes[outcome] = (stats.outcomes[outcome] ?? 0) + 1;
      },
      {
        onFailure: (tenantId, err) =>
          this.logger.error('billing_issue_failed', undefined, {
            tenantId,
            correlationId: input.correlationId,
            error: err instanceof Error ? err.message : String(err),
          }),
        summarize: (failed) => `${failed.length} subscriptions failed to issue`,
      },
    );
  }
}
