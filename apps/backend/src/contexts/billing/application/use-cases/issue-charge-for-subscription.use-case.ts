import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { todayInTimezone } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { Charge } from '../../domain/charge.aggregate';
import { chargePriceKey } from '../../domain/charge-price-key';
import { FeaturePriceNotFoundError } from '../../domain/errors/billing-domain.error';
import { ChargeAlreadyExistsError } from '../../domain/errors/charge-already-exists.error';
import { PeriodChargeFactory } from '../../domain/period-charge.factory';
import type { SelectionEntry } from '../../domain/plan-selection';
import type { Subscription } from '../../domain/subscription.aggregate';
import type { MinorAmount } from '../../domain/value-objects/minor-amount.vo';
import { findFeaturePriceInForce } from '../helpers/feature-price-lookup.helper';
import { loadSubscriptionForUpdate } from '../helpers/operator-billing.helpers';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  FEATURE_PRICE_REPOSITORY,
  IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import {
  type ProviderChargeCreationResult,
  ProviderChargeCreationService,
} from '../services/provider-charge-creation.service';

export interface IssueChargeForSubscriptionUseCaseInput {
  tenantId: string;
  correlationId: string;
}

export type IssueChargeOutcome =
  | 'ISSUED'
  | 'NOT_DUE'
  | 'NOT_FOUND'
  | 'TENANT_INACTIVE'
  | 'PROVIDER_UNSUPPORTED'
  | 'HELD'
  | 'PRICE_MISSING'
  | 'DUPLICATE';

/** What planning found: a charge to insert, or the reason there is none. */
type PeriodPlan =
  | { outcome: 'PLANNED'; charge: Charge; subscription: Subscription }
  | { outcome: 'NOT_DUE' | 'HELD' | 'PRICE_MISSING' };

export interface IssueChargeForSubscriptionUseCaseResult {
  outcome: IssueChargeOutcome;
  /** What the creation attempt after the insert became; set only when a charge was issued. */
  creation?: ProviderChargeCreationResult;
}

/**
 * UC-113 for one subscription. Transaction 1 (B-R1 first): re-check it is due in its own zone,
 * resolve every price at the period's start date, insert the `PERIOD` charge `PENDING` with its
 * lines and advance `next_due_date`, all or nothing. Then, outside any transaction, the shared
 * creation step makes the charge payable at the provider. A held identity (A8 / A9), a missing
 * price (A6), a deactivated tenant (A11) and a profile with no adapter yet insert nothing and leave
 * the subscription due, so the next run picks it up when the cause is gone.
 */
@Injectable()
export class IssueChargeForSubscriptionUseCase {
  private readonly logger = new AppLogger(IssueChargeForSubscriptionUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(FEATURE_PRICE_REPOSITORY) private readonly prices: IFeaturePriceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly creation: ProviderChargeCreationService,
  ) {}

  async execute(
    input: IssueChargeForSubscriptionUseCaseInput,
  ): Promise<IssueChargeForSubscriptionUseCaseResult> {
    const { tenantId } = input;
    const subscription = await this.subscriptions.findByTenantId(tenantId);
    if (subscription === null) return { outcome: 'NOT_FOUND' };
    if (!(await this.creation.tenantIsActive(tenantId))) return { outcome: 'TENANT_INACTIVE' };
    if (!this.creation.supportsProfile(subscription.merchantProfileKey, tenantId)) {
      return { outcome: 'PROVIDER_UNSUPPORTED' };
    }

    const inserted = await this.insertPeriodCharge(tenantId);
    if (!('chargeId' in inserted)) return { outcome: inserted.outcome };
    const creation = await this.creation.execute({
      tenantId,
      chargeId: inserted.chargeId,
      correlationId: input.correlationId,
    });
    return { outcome: 'ISSUED', creation };
  }

  private async insertPeriodCharge(
    tenantId: string,
  ): Promise<{ outcome: 'ISSUED'; chargeId: string } | { outcome: IssueChargeOutcome }> {
    try {
      // The saves stay inline in this callback (the `transactional-save` rule); the reads and the
      // building are in `planPeriodCharge`.
      return await this.txManager.run(async () => {
        const plan = await this.planPeriodCharge(tenantId);
        if (plan.outcome !== 'PLANNED') return { outcome: plan.outcome };
        await this.charges.save(plan.charge);
        await this.subscriptions.save(plan.subscription);
        return { outcome: 'ISSUED' as const, chargeId: plan.charge.id };
      });
    } catch (err) {
      // UQ_billing_charges_period: another writer already issued this period.
      if (err instanceof ChargeAlreadyExistsError) return { outcome: 'DUPLICATE' };
      throw err;
    }
  }

  // B-R1 first (docs/LOCK_CATALOG.md): the subscription row, then the charge insert (no B-C1: the
  // insert takes no lock, its unique index is the backstop). Reads and builds only, no provider I/O.
  private async planPeriodCharge(tenantId: string): Promise<PeriodPlan> {
    const subscription = await loadSubscriptionForUpdate(this.subscriptions, tenantId);
    const today = CalendarDate.create(
      todayInTimezone(subscription.timezone.value, this.clock.now()),
    );
    if (!subscription.isDueForIssue(today) || subscription.nextDueDate === null) {
      return { outcome: 'NOT_DUE' };
    }

    const account = await this.accounts.findByTenantId(tenantId);
    if (!account?.hasBillableIdentity()) {
      this.logger.log('billing_issue_held: no valid tax id or billing address', { tenantId });
      return { outcome: 'HELD' };
    }

    const items = subscription.selection;
    const prices = await this.pricesAtPeriodStart(subscription, items, subscription.nextDueDate);
    if (prices === null) return { outcome: 'PRICE_MISSING' };

    const window = subscription.advanceToNextPeriod();
    const charge = PeriodChargeFactory.build({ subscription, items, prices, window });
    return { outcome: 'PLANNED', charge, subscription };
  }

  // Each item's amount from the version in force on the period's start date. A price that is not
  // there is never a zero and never a boot failure: the subscription stays due and the job goes on.
  private async pricesAtPeriodStart(
    subscription: Subscription,
    items: readonly SelectionEntry[],
    periodStart: CalendarDate,
  ): Promise<ReadonlyMap<string, MinorAmount> | null> {
    try {
      // One transaction connection: the reads queue anyway, so they run one after another.
      const amounts = await mapSequentially(items, async (item) => {
        const { version } = await findFeaturePriceInForce(
          this.prices,
          item.featureKey,
          subscription.countryCode,
          item.tier,
          'MONTHLY',
          periodStart,
        );
        return [chargePriceKey(item.featureKey, item.tier), version.amount] as const;
      });
      return new Map(amounts);
    } catch (err) {
      if (!(err instanceof FeaturePriceNotFoundError)) throw err;
      this.logger.error('billing_price_missing', undefined, {
        tenantId: subscription.tenantId,
        message: err.message,
      });
      return null;
    }
  }
}
