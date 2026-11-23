import type { ReminderSubscription } from '../../../contexts/billing/domain/reminder-schedule';
import type {
  SubscriptionStatus,
  SuspensionReason,
} from '../../../contexts/billing/domain/subscription.types';

/** What `ReminderSchedule` reads of a subscription: a trialing, non-exempt one with the plan unconfirmed. */
export class ReminderSubscriptionBuilder {
  private status: SubscriptionStatus = 'TRIALING';
  private suspensionReason: SuspensionReason | null = null;
  private exempt = false;
  private planConfirmed = false;
  private trialEndsOn: string | null = null;

  withStatus(status: SubscriptionStatus): this {
    this.status = status;
    return this;
  }

  withSuspensionReason(suspensionReason: SuspensionReason | null): this {
    this.suspensionReason = suspensionReason;
    return this;
  }

  withExempt(exempt: boolean): this {
    this.exempt = exempt;
    return this;
  }

  withPlanConfirmed(planConfirmed: boolean): this {
    this.planConfirmed = planConfirmed;
    return this;
  }

  withTrialEndsOn(trialEndsOn: string | null): this {
    this.trialEndsOn = trialEndsOn;
    return this;
  }

  build(): ReminderSubscription {
    return {
      status: this.status,
      suspensionReason: this.suspensionReason,
      exempt: this.exempt,
      planConfirmed: this.planConfirmed,
      trialEndsOn: this.trialEndsOn,
    };
  }
}
