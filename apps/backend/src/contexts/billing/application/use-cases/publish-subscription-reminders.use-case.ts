import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import type { Charge } from '../../domain/charge.aggregate';
import {
  BillingReminderDue,
  type BillingReminderKind,
} from '../../domain/commands/billing-reminder-due.command';
import {
  type ReminderMilestone,
  remindersDueToday,
  SUSPENSION_DATE_OFFSET,
} from '../../domain/reminder-schedule';
import { graceEndsAt } from '../../domain/subscription-sweep-window';
import type { Subscription } from '../../domain/subscription.aggregate';
import { resolveBillingRecipientEmail } from '../helpers/billing-recipient-email.helper';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface PublishSubscriptionRemindersUseCaseInput {
  tenantId: string;
  correlationId: string;
  /** The merchant profile keys whose suspension freeze is on, read once by the job for the whole run. */
  frozenProfileKeys: ReadonlySet<string>;
}

export type PublishSubscriptionRemindersOutcome = 'NOT_FOUND' | 'EXEMPT' | 'NONE' | 'PUBLISHED';

export interface PublishSubscriptionRemindersUseCaseResult {
  outcome: PublishSubscriptionRemindersOutcome;
  /** The kinds written to the outbox (a duplicate of an earlier run is a no-op row, still counted here). */
  published: readonly BillingReminderKind[];
  /** The day-12 overdue reminder withheld because the subscription's provider account is frozen. */
  skippedFrozen: number;
}

interface Evaluation {
  subscription: Subscription;
  charges: readonly Charge[];
  milestones: readonly ReminderMilestone[];
}

/**
 * UC-139 for one subscription: the reminders whose milestone is today in the subscription's own
 * timezone. Freshness is Billing's job (R3): Notification has no Billing read port, so the
 * subscription and its open charges are read again **in the transaction that writes the outbox
 * rows**, and nothing is published for an exempt subscription or a charge that is no longer open.
 * No lock (`findByTenantIdForUpdate` is not taken): a reminder is an advisory message that moves no
 * money or access, UC-139 accepts a small stale window and the copy is tolerant. A rerun of the
 * same day writes nothing more: the command's business `dedup_key` is `UNIQUE` in `shared.outbox`.
 * No provider I/O.
 */
@Injectable()
export class PublishSubscriptionRemindersUseCase {
  private readonly logger = new AppLogger(PublishSubscriptionRemindersUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(OUTBOX_PUBLISHER) private readonly outbox: IOutboxPublisher,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: PublishSubscriptionRemindersUseCaseInput,
  ): Promise<PublishSubscriptionRemindersUseCaseResult> {
    const now = this.clock.now();
    // Most subscriptions have nothing today: decide that without opening a transaction.
    const first = await this.evaluate(input.tenantId, now);
    if (first.kind !== 'EVALUATED') return { outcome: first.kind, published: [], skippedFrozen: 0 };
    if (first.evaluation.milestones.length === 0) {
      return { outcome: 'NONE', published: [], skippedFrozen: 0 };
    }
    return this.txManager.run(() => this.publish(input, now));
  }

  // The re-check: everything is read again here, immediately before the outbox rows are written.
  private async publish(
    input: PublishSubscriptionRemindersUseCaseInput,
    now: Date,
  ): Promise<PublishSubscriptionRemindersUseCaseResult> {
    const fresh = await this.evaluate(input.tenantId, now);
    if (fresh.kind !== 'EVALUATED') return { outcome: fresh.kind, published: [], skippedFrozen: 0 };
    const { subscription, charges, milestones } = fresh.evaluation;

    const frozen = input.frozenProfileKeys.has(subscription.merchantProfileKey);
    const due = milestones.filter(
      (milestone) => !(frozen && this.isSuspensionDateReminder(milestone)),
    );
    const skippedFrozen = milestones.length - due.length;
    if (due.length === 0) return { outcome: 'NONE', published: [], skippedFrozen };

    const account = await this.accounts.findByTenantId(input.tenantId);
    const recipientEmail = resolveBillingRecipientEmail(subscription.exempt, account);
    if (recipientEmail === null) {
      // No billing email: Notification falls back to the managers; the dashboard banner remains (A2).
      this.logger.log('billing_reminder_no_billing_email', {
        tenantId: input.tenantId,
        correlationId: input.correlationId,
      });
    }
    // TRIAL_ENDING shows the first invoice when one is open; it is the current trial's own charge,
    // not any open one (a re-trialled subscription keeps its history).
    const firstInvoice = due.some((milestone) => milestone.kind === 'TRIAL_ENDING')
      ? await this.findOpenFirstInvoice(subscription)
      : null;
    const commands = due.map((milestone) =>
      this.toCommand(
        input,
        subscription,
        this.chargeOf(milestone, charges, firstInvoice),
        milestone,
        recipientEmail,
      ),
    );
    await mapSequentially(commands, (command) => this.outbox.publish(command));
    return {
      outcome: 'PUBLISHED',
      published: due.map((milestone) => milestone.kind),
      skippedFrozen,
    };
  }

  private async evaluate(
    tenantId: string,
    now: Date,
  ): Promise<{ kind: 'NOT_FOUND' | 'EXEMPT' } | { kind: 'EVALUATED'; evaluation: Evaluation }> {
    const subscription = await this.subscriptions.findFreshByTenantId(tenantId);
    if (!subscription) return { kind: 'NOT_FOUND' };
    if (subscription.exempt) return { kind: 'EXEMPT' };

    const timezone = subscription.timezone.value;
    const charges = await this.charges.findOpenByTenant(tenantId);
    const milestones = remindersDueToday({
      localToday: utcDateToLocalDate(now, timezone),
      subscription: {
        status: subscription.status,
        suspensionReason: subscription.suspensionReason,
        exempt: subscription.exempt,
        planConfirmed: subscription.planConfirmedAt !== null,
        trialEndsOn:
          subscription.trialEndsAt === null
            ? null
            : utcDateToLocalDate(subscription.trialEndsAt, timezone),
      },
      charges: charges.map((charge) => ({
        id: charge.id,
        kind: charge.kind,
        status: charge.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING',
        dueDate: charge.dueDate.value,
      })),
    });
    return { kind: 'EVALUATED', evaluation: { subscription, charges, milestones } };
  }

  // The last overdue reminder names the suspension date; a frozen provider suspends nobody, so it
  // would be a false warning (UC-139, UC-140).
  private isSuspensionDateReminder(milestone: ReminderMilestone): boolean {
    return milestone.kind === 'CHARGE_OVERDUE' && milestone.daysOffset === SUSPENSION_DATE_OFFSET;
  }

  private async findOpenFirstInvoice(subscription: Subscription): Promise<Charge | null> {
    const from = subscription.firstInvoiceFrom;
    if (from === null) return null;
    const first = await this.charges.findFirstPeriodCharge(
      subscription.tenantId,
      subscription.id,
      from,
    );
    return first?.open ? first : null;
  }

  // The charge a reminder is about: the one its milestone names, or, for the trial-ending one that
  // names none, the current trial's open first invoice.
  private chargeOf(
    milestone: ReminderMilestone,
    charges: readonly Charge[],
    firstInvoice: Charge | null,
  ): Charge | null {
    if (milestone.chargeId !== null) {
      return charges.find((charge) => charge.id === milestone.chargeId) ?? null;
    }
    return milestone.kind === 'TRIAL_ENDING' ? firstInvoice : null;
  }

  private toCommand(
    input: PublishSubscriptionRemindersUseCaseInput,
    subscription: Subscription,
    charge: Charge | null,
    milestone: ReminderMilestone,
    recipientEmail: string | null,
  ): BillingReminderDue {
    const timezone = subscription.timezone.value;
    const trialEndsOn =
      subscription.trialEndsAt === null
        ? null
        : utcDateToLocalDate(subscription.trialEndsAt, timezone);
    const isTrialKind = milestone.kind === 'PLAN_CONFIRMATION' || milestone.kind === 'TRIAL_ENDING';

    return new BillingReminderDue(input.tenantId, input.correlationId, {
      subscriptionId: subscription.id,
      kind: milestone.kind,
      daysOffset: milestone.daysOffset,
      chargeId: milestone.chargeId,
      paymentUrl: charge?.paymentUrl ?? null,
      recipientEmail,
      dueDate: charge?.dueDate.value ?? null,
      trialEndsOn: isTrialKind ? trialEndsOn : null,
      suspendsOn: this.suspensionDate(subscription, milestone, timezone),
      amountMinor: charge?.amount.amountMinor ?? null,
      currency: charge?.amount.currency ?? null,
    });
  }

  private suspensionDate(
    subscription: Subscription,
    milestone: ReminderMilestone,
    timezone: string,
  ): string | null {
    if (!this.isSuspensionDateReminder(milestone) || subscription.pastDueSince === null) {
      return null;
    }
    return utcDateToLocalDate(
      graceEndsAt(subscription.pastDueSince, subscription.graceUntil),
      timezone,
    );
  }
}
