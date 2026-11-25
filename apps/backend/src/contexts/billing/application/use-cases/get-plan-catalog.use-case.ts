import { Inject, Injectable } from '@nestjs/common';
import type { BillingPlanResponse } from '@ikaro/types';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { todayInTimezone } from '../../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { sumTotal } from '../helpers/billing-summary.helper';
import { toCatalogFeatures, toPlanView } from '../helpers/plan-view.helper';
import { pricingDate, readNextPeriodPaid } from '../helpers/plan-timing.helper';
import { priceSelection } from '../helpers/priced-selection.helper';
import { projectSelectablePrices } from '../helpers/selectable-prices.helper';
import { CHARGE_REPOSITORY, type IChargeRepository } from '../ports/charge-repository.port';
import {
  FEATURE_PRICE_REPOSITORY,
  type IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface GetPlanCatalogUseCaseInput {
  tenantId: string;
}

export type GetPlanCatalogUseCaseResult = BillingPlanResponse;

/**
 * UC-136 main flow 1: the Plano tab's one read. Every selectable feature with the tier prices in
 * force today (and an announced next price), the plan now, what is queued, why the tab is
 * read-only if it is, and the total of the plan going forward priced where it takes effect (so a
 * no-op preview answers the same total). It reads the committed subscription row, never the cached
 * copy, and decides nothing the aggregate already decides (`planReadOnlyReason`, `nextPeriodStart`).
 * A tenant with no subscription row is the provisioning answer, as for the summary.
 */
@Injectable()
export class GetPlanCatalogUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(FEATURE_PRICE_REPOSITORY) private readonly prices: IFeaturePriceRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: GetPlanCatalogUseCaseInput): Promise<GetPlanCatalogUseCaseResult> {
    const subscription = await this.subscriptions.findFreshByTenantId(input.tenantId);
    if (!subscription) return { provisioning: true };

    const now = this.clock.now();
    const today = todayInTimezone(subscription.timezone.value, now);
    const nextPeriodPaid = await readNextPeriodPaid(this.charges, subscription, today);
    const pricedOn = pricingDate(subscription, nextPeriodPaid, today);
    const [selectable, priced] = await Promise.all([
      this.prices.listSelectableByCountry(subscription.countryCode),
      subscription.exempt
        ? Promise.resolve([])
        : priceSelection(
            this.prices,
            subscription.selection,
            subscription.countryCode,
            subscription.cycle,
            pricedOn,
          ),
    ]);
    const readOnlyReason = subscription.planReadOnlyReason;

    return {
      provisioning: false,
      countryCode: subscription.countryCode.value,
      currency: subscription.currency,
      readOnly: readOnlyReason === null ? null : { reason: readOnlyReason },
      trial: {
        active: subscription.status === 'TRIALING',
        planConfirmed: subscription.planConfirmedAt !== null,
      },
      features: toCatalogFeatures(projectSelectablePrices(selectable, CalendarDate.create(today))),
      ...toPlanView(subscription, now),
      totalMinor: subscription.exempt ? 0 : sumTotal(priced),
    };
  }
}
