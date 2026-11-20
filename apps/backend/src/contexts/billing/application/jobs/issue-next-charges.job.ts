import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { addDaysUTC, utcDateString } from '../../../../shared/utils/calendar-date';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import { BILLING_JOB_PAGE_SIZE, CHARGE_ISSUE_LEAD_DAYS } from '../../domain/billing-constants';
import {
  type DueIssueRef,
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

/** One run's state: what it selects with, what it counted and every failure it kept going past. */
interface IssueRun {
  readonly input: IssueNextChargesJobInput;
  readonly dueOnOrBefore: string;
  readonly stats: IssueStats;
  readonly failures: unknown[];
}

/**
 * UC-113, the daily job: it selects its own subscriptions (no tenant id in the trigger) through the
 * standalone partial index on `next_due_date`, with the UTC date plus the lead plus one day of
 * slack because each due date is in its subscription's own zone (each subscription re-checks it
 * there), issues each in its own transactions, page by page until none is left, then runs the
 * creation retry. One subscription's
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
    const issue: IssueRun = {
      input,
      dueOnOrBefore: addDaysUTC(utcDateString(this.clock.now()), CHARGE_ISSUE_LEAD_DAYS + 1),
      stats: { selected: 0, outcomes: {} },
      failures: [],
    };
    await this.issueFrom(issue).catch((err: unknown) => {
      issue.failures.push(err);
    });
    const retried = await this.retry.execute(input).catch((err: unknown) => {
      issue.failures.push(err);
      return { selected: 0, ready: 0 };
    });
    this.logger.log('billing_issue_charges_run', {
      correlationId: input.correlationId,
      ...issue.stats,
      retrySelected: retried.selected,
      retryReady: retried.ready,
      failed: issue.failures.length,
    });
    if (issue.failures.length > 0) throw issue.failures[0];
    return { ...issue.stats, retrySelected: retried.selected, retryReady: retried.ready };
  }

  // Page by page from the last row it was given: a subscription the job skips stays due, so asking
  // for the head again would never get past the skipped ones. A page's failure is kept and the next
  // page still runs.
  private async issueFrom(issue: IssueRun, after?: DueIssueRef): Promise<void> {
    const page = await this.subscriptions.findDueForIssueForJob(
      issue.dueOnOrBefore,
      BILLING_JOB_PAGE_SIZE,
      after,
    );
    issue.stats.selected += page.length;
    await this.issuePage(issue, page).catch((err: unknown) => {
      issue.failures.push(err);
    });
    if (page.length < BILLING_JOB_PAGE_SIZE) return;
    await this.issueFrom(issue, page[page.length - 1]);
  }

  private async issuePage(issue: IssueRun, page: readonly DueIssueRef[]): Promise<void> {
    await mapSequentiallyIsolated(
      page,
      async ({ tenantId }) => {
        const { outcome } = await this.issueOne.execute({
          tenantId,
          correlationId: issue.input.correlationId,
        });
        issue.stats.outcomes[outcome] = (issue.stats.outcomes[outcome] ?? 0) + 1;
      },
      {
        onFailure: ({ tenantId }, err) =>
          this.logger.error('billing_issue_failed', undefined, {
            tenantId,
            correlationId: issue.input.correlationId,
            error: err instanceof Error ? err.message : String(err),
          }),
        summarize: (failed) => `${failed.length} subscriptions failed to issue`,
      },
    );
  }
}
