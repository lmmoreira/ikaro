import { Inject, Injectable } from '@nestjs/common';
import type { BillingSummaryResponse, BillingUpcomingPriceChangeDto } from '@ikaro/types';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { todayInTimezone } from '../../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { Charge } from '../../domain/charge.aggregate';
import type { SelectionEntry } from '../../domain/plan-selection';
import type { Subscription } from '../../domain/subscription.aggregate';
import {
  BILLING_ACCOUNT_REPOSITORY,
  type IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import { CHARGE_REPOSITORY, type IChargeRepository } from '../ports/charge-repository.port';
import {
  FEATURE_PRICE_REPOSITORY,
  type IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import {
  type PricedEntry,
  priceEntry,
  toReadySummary,
  upcomingChanges,
} from '../helpers/billing-summary.helper';

export interface GetBillingSummaryUseCaseInput {
  tenantId: string;
}

export type GetBillingSummaryUseCaseResult = BillingSummaryResponse;

/**
 * UC-117: the billing page's one read. It reads the committed subscription row (never the cached
 * copy: the page polls while a payment settles), the open charge and the display prices, and
 * decides nothing a Billing aggregate already decides (`suspendsAt`, `purgeAt`, the plan
 * confirmation). A tenant with no subscription row is the provisioning answer, not an error.
 * The result carries no URL: whether a usable payment link exists is a flag, the link itself is
 * only ever returned by the payment-link route.
 */
@Injectable()
export class GetBillingSummaryUseCase {
  private readonly logger = new AppLogger(GetBillingSummaryUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(FEATURE_PRICE_REPOSITORY) private readonly prices: IFeaturePriceRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: GetBillingSummaryUseCaseInput): Promise<GetBillingSummaryUseCaseResult> {
    const { tenantId } = input;
    const subscription = await this.subscriptions.findFreshByTenantId(tenantId);
    if (!subscription) {
      this.logger.warn(`Billing summary for tenant '${tenantId}' has no subscription yet`);
      return { provisioning: true };
    }

    const now = this.clock.now();
    const today = todayInTimezone(subscription.timezone.value, now);
    const [priced, openCharge, firstChargePaid, addressRequired] = await Promise.all([
      this.priceItems(subscription, now, today),
      this.readOpenCharge(subscription),
      this.readFirstChargePaid(subscription),
      this.readAddressRequired(subscription),
    ]);

    return toReadySummary(subscription, {
      priced: priced.entries,
      upcoming: priced.upcoming,
      openCharge,
      firstChargePaid,
      addressRequired,
      now,
    });
  }

  /** The plan the page lists and the version date it is priced at, per status (UC-117, UC-134). */
  private planFor(
    subscription: Subscription,
    now: Date,
    today: string,
  ): { entries: SelectionEntry[]; pricedOn: string } {
    if (subscription.exempt) return { entries: [], pricedOn: today };
    switch (subscription.status) {
      case 'TRIALING':
        // The plan invoiced first, at the version in force on that period's start (what UC-113 charges).
        return {
          entries: subscription.selection,
          pricedOn: subscription.firstInvoiceFrom ?? today,
        };
      case 'SUSPENDED':
        // The plan that paying brings back: the reactivation plan, priced today.
        return { entries: subscription.selection, pricedOn: today };
      default:
        return { entries: subscription.entitledAt(now), pricedOn: today };
    }
  }

  private async priceItems(
    subscription: Subscription,
    now: Date,
    today: string,
  ): Promise<{ entries: PricedEntry[]; upcoming: BillingUpcomingPriceChangeDto[] }> {
    const { entries, pricedOn } = this.planFor(subscription, now, today);
    const date = CalendarDate.create(pricedOn);
    const priced = await Promise.all(
      entries.map(async (entry) => {
        const price = await this.prices.findByNaturalKey(
          entry.featureKey,
          subscription.countryCode,
          entry.tier,
          subscription.cycle,
        );
        const result = priceEntry(entry, price, date);
        if (result.amountMinor === null) {
          this.logger.error(
            `No price in force for ${entry.featureKey}/${entry.tier} on ${pricedOn} ` +
              `(tenant '${subscription.tenantId}', country ${subscription.countryCode.value})`,
          );
        }
        return result;
      }),
    );
    return { entries: priced, upcoming: upcomingChanges(priced, date) };
  }

  /** The charge the manager can pay: the recovery charge while suspended, else the oldest open period charge. */
  private async readOpenCharge(subscription: Subscription): Promise<Charge | null> {
    if (subscription.exempt) return null;
    if (subscription.status === 'SUSPENDED') {
      return this.charges.findOpenRecoveryBySubscription(subscription.tenantId, subscription.id);
    }
    const open = await this.charges.findOpenByTenant(subscription.tenantId);
    return open.find((charge) => charge.kind === 'PERIOD') ?? null;
  }

  /** Whether the current trial's first invoice is paid. Not `has_ever_paid`: a re-trial after an exemption keeps that flag. */
  private async readFirstChargePaid(subscription: Subscription): Promise<boolean> {
    const firstInvoiceFrom = subscription.firstInvoiceFrom;
    if (subscription.exempt || firstInvoiceFrom === null) return false;
    const first = await this.charges.findFirstPeriodCharge(
      subscription.tenantId,
      subscription.id,
      firstInvoiceFrom,
    );
    return first?.status === 'PAID';
  }

  private async readAddressRequired(subscription: Subscription): Promise<boolean> {
    if (subscription.exempt) return false;
    const account = await this.accounts.findByTenantId(subscription.tenantId);
    return account === null || account.address === null;
  }
}
