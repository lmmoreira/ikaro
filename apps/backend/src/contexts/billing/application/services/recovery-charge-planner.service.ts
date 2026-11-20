import { Inject, Injectable } from '@nestjs/common';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { Charge } from '../../domain/charge.aggregate';
import { chargePriceKey } from '../../domain/charge-price-key';
import { RecoveryChargeFactory } from '../../domain/recovery-charge.factory';
import type { SelectionEntry } from '../../domain/plan-selection';
import type { Subscription } from '../../domain/subscription.aggregate';
import type { MinorAmount } from '../../domain/value-objects/minor-amount.vo';
import { findFeaturePriceInForce } from '../helpers/feature-price-lookup.helper';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  FEATURE_PRICE_REPOSITORY,
  IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';

/**
 * The unit prices one job run already looked up, by feature × tier × country × date. A run that
 * suspends many tenants on one day asks the price list once per distinct item, not once per
 * tenant. It lives for one run only, so a price change never outlives it.
 */
export type RecoveryPriceCache = Map<string, MinorAmount>;

/**
 * Builds the `RECOVERY` charge a suspension makes necessary (UC-134): one month of the selected
 * plan, each unit price resolved for the subscription-timezone date of `now`, the lines and due
 * date set by `RecoveryChargeFactory`. It is the one place the webhook (a `PAYMENT_REVERSED`
 * suspension), the status sweep (`NON_PAYMENT`) and the reactivation stories turn a plan into a
 * charge, so the three can never price it differently. It reads and builds only: the caller inserts
 * the charge inside its own transaction, and the price reads are why it may run inside one.
 */
@Injectable()
export class RecoveryChargePlanner {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(FEATURE_PRICE_REPOSITORY) private readonly prices: IFeaturePriceRepository,
  ) {}

  /**
   * The recovery charge to insert, or `null` when the subscription already has an open one
   * (`UQ_billing_charges_open_recovery`: at most one, so a second suspension path adds nothing).
   * A missing price or version is a typed `FeaturePriceNotFoundError`, never a zero price.
   */
  async plan(
    subscription: Subscription,
    now: Date,
    cache?: RecoveryPriceCache,
  ): Promise<Charge | null> {
    const existing = await this.charges.findOpenRecoveryBySubscription(
      subscription.tenantId,
      subscription.id,
    );
    if (existing !== null) return null;
    const today = CalendarDate.create(utcDateToLocalDate(now, subscription.timezone.value));
    const items = subscription.selection;
    // One transaction connection when the caller is inside one: the reads queue anyway, so they run
    // one after another.
    const amounts = await mapSequentially(
      items,
      async (item) =>
        [
          chargePriceKey(item.featureKey, item.tier),
          await this.unitPrice(subscription, item, today, cache),
        ] as const,
    );
    return RecoveryChargeFactory.build({
      subscription,
      items,
      prices: new Map<string, MinorAmount>(amounts),
      today,
    });
  }

  private async unitPrice(
    subscription: Subscription,
    item: SelectionEntry,
    today: CalendarDate,
    cache?: RecoveryPriceCache,
  ): Promise<MinorAmount> {
    const cacheKey = `${item.featureKey}|${item.tier}|${subscription.countryCode.value}|${today.value}`;
    const cached = cache?.get(cacheKey);
    if (cached !== undefined) return cached;
    const { version } = await findFeaturePriceInForce(
      this.prices,
      item.featureKey,
      subscription.countryCode,
      item.tier,
      'MONTHLY',
      today,
    );
    cache?.set(cacheKey, version.amount);
    return version.amount;
  }
}
