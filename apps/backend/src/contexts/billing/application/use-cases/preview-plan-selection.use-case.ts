import { Inject, Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import type { BillingPlanPreviewResponse } from '@ikaro/types';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { todayInTimezone } from '../../../../shared/utils/calendar-date';
import {
  BillingTenantNotFoundError,
  NoPriceForCountryError,
} from '../../domain/errors/billing-domain.error';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { SelectionEntry } from '../../domain/plan-selection';
import type { Subscription } from '../../domain/subscription.aggregate';
import { readNextPeriodPaid } from '../helpers/plan-timing.helper';
import { priceSelection } from '../helpers/priced-selection.helper';
import { CHARGE_REPOSITORY, type IChargeRepository } from '../ports/charge-repository.port';
import {
  FEATURE_PRICE_REPOSITORY,
  type IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface PreviewPlanSelectionUseCaseInput {
  tenantId: string;
  /** The proposed FINAL selection, already shape-checked by `PlanPreviewSchema`. */
  items: SelectionEntry[];
}

export type PreviewPlanSelectionUseCaseResult = BillingPlanPreviewResponse;

/**
 * UC-136 main flow 2: what saving a proposed selection would change, when each change takes effect
 * and what the plan then costs. Nothing is saved, and the BOOKING-removal guard is not run (it is
 * checked at save only). The aggregate validates the selection (a dependency unmet, dependents
 * still active, an empty plan) and dates it; this use case prices it on the day the change takes
 * effect. A tier that is newly picked must have a *selectable* price in force; one the tenant
 * already holds keeps pricing at the version in force even if it was hidden since (a hidden price
 * still renews). Either missing is `BILLING_NO_PRICE_FOR_COUNTRY`, never a zero.
 * An exempt subscription has no paid period: its dates are `null` and its total is `0`.
 */
@Injectable()
export class PreviewPlanSelectionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(FEATURE_PRICE_REPOSITORY) private readonly prices: IFeaturePriceRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: PreviewPlanSelectionUseCaseInput,
  ): Promise<PreviewPlanSelectionUseCaseResult> {
    const subscription = await this.subscriptions.findFreshByTenantId(input.tenantId);
    if (!subscription) throw new BillingTenantNotFoundError(input.tenantId);

    const today = todayInTimezone(subscription.timezone.value, this.clock.now());
    const nextPeriodPaid = await readNextPeriodPaid(this.charges, subscription, today);
    const preview = subscription.previewSelection(input.items, nextPeriodPaid);
    const newTotalMinor = subscription.exempt
      ? 0
      : await this.priceAt(
          subscription,
          input.items,
          new Set(preview.changes.filter((c) => c.kind !== 'REMOVE').map((c) => c.featureKey)),
          preview.effectiveFrom ?? CalendarDate.create(today),
        );

    return {
      changes: preview.changes.map((change) => ({
        featureKey: change.featureKey,
        kind: change.kind,
        fromTier: change.fromTier,
        toTier: change.toTier,
        effectiveFrom: change.effectiveFrom?.value ?? null,
      })),
      newTotalMinor,
      effectiveFrom: preview.effectiveFrom?.value ?? null,
      deferredBecauseNextInvoicePaid: nextPeriodPaid && preview.effectiveFrom !== null,
    };
  }

  /** The total of `items` on `pricedOn`; a missing price, or a hidden one on a newly picked tier, is refused. */
  private async priceAt(
    subscription: Subscription,
    items: readonly SelectionEntry[],
    newlyPicked: ReadonlySet<FeatureKey>,
    pricedOn: CalendarDate,
  ): Promise<number> {
    const priced = await priceSelection(
      this.prices,
      items,
      subscription.countryCode,
      subscription.cycle,
      pricedOn,
    );
    let total = 0;
    for (const { entry, price, amountMinor } of priced) {
      const hidden = newlyPicked.has(entry.featureKey) && price?.selectable !== true;
      if (amountMinor === null || hidden) {
        throw new NoPriceForCountryError(entry.featureKey, entry.tier);
      }
      total += amountMinor;
    }
    return total;
  }
}
