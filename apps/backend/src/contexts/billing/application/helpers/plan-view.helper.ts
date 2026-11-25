import { FEATURE_KEYS, type FeatureKey } from '@ikaro/validation';
import type {
  BillingPlanCurrentItemDto,
  BillingPlanFeatureDto,
  BillingPlanScheduledItemDto,
  BillingPlanTierDto,
} from '@ikaro/types';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import {
  FEATURE_REQUIREMENTS,
  type SelectionEntry,
  tiersSoldFor,
} from '../../domain/plan-selection';
import type { Subscription } from '../../domain/subscription.aggregate';
import type { SelectablePriceItem } from './selectable-prices.helper';

/** What the Plano tab shows as the plan now and what is queued (UC-136 main flow 1). */
export interface PlanView {
  current: BillingPlanCurrentItemDto[];
  scheduled: BillingPlanScheduledItemDto[] | null;
}

const byFeatureOrder = (a: { featureKey: FeatureKey }, b: { featureKey: FeatureKey }): number =>
  FEATURE_KEYS.indexOf(a.featureKey) - FEATURE_KEYS.indexOf(b.featureKey);

/** Every feature in catalogue order with each tier it is sold in; a tier with no selectable price is unavailable. */
export function toCatalogFeatures(
  selectable: readonly SelectablePriceItem[],
): BillingPlanFeatureDto[] {
  return FEATURE_KEYS.map((featureKey) => ({
    featureKey,
    requires: [...FEATURE_REQUIREMENTS[featureKey]],
    tiers: tiersSoldFor(featureKey).map((tier): BillingPlanTierDto => {
      const price = selectable.find((item) => item.featureKey === featureKey && item.tier === tier);
      return {
        tier,
        unitPriceMinor: price?.amountMinor ?? null,
        available: price !== undefined,
        ...(price?.upcoming && { upcoming: price.upcoming }),
      };
    }),
  }));
}

function asCurrent(entries: readonly SelectionEntry[]): BillingPlanCurrentItemDto[] {
  return entries
    .map((entry) => ({ featureKey: entry.featureKey, tier: entry.tier, endsAt: null }))
    .sort(byFeatureOrder);
}

/**
 * A trial entitles every feature; the manager's selection only decides the first paid period, so
 * what differs from the entitled set is what starts (or stops) on the trial's end day.
 */
function trialView(subscription: Subscription, now: Date): PlanView {
  const entitled = new Map(subscription.entitledAt(now).map((e) => [e.featureKey, e.tier]));
  const selected = new Map(subscription.selection.map((e) => [e.featureKey, e.tier]));
  const startsAt = subscription.firstInvoiceFrom;
  const scheduled: BillingPlanScheduledItemDto[] = [];
  for (const featureKey of FEATURE_KEYS) {
    const before = entitled.get(featureKey);
    const after = selected.get(featureKey) ?? null;
    if (before === (after ?? undefined) || startsAt === null) continue;
    scheduled.push({ featureKey, tier: after, startsAt });
  }
  return {
    current: asCurrent([...entitled].map(([featureKey, tier]) => ({ featureKey, tier }))),
    scheduled: scheduled.length > 0 ? scheduled : null,
  };
}

/**
 * Dates are the tenant-local date of the item's instant. `current` is every item active now, with
 * `endsAt` set while a removal or tier change is pending; `scheduled` is every item that starts
 * later, plus `tier: null` for a feature that leaves with no replacement. While suspended nothing
 * is entitled, so `current` is the plan that paying restores and nothing is scheduled (UC-136 A14).
 */
export function toPlanView(subscription: Subscription, now: Date): PlanView {
  if (subscription.status === 'TRIALING') return trialView(subscription, now);
  if (subscription.status === 'SUSPENDED') {
    return { current: asCurrent(subscription.selection), scheduled: null };
  }
  const zone = subscription.timezone.value;
  const local = (instant: Date): string => utcDateToLocalDate(instant, zone);
  const active = subscription.items.filter((item) => item.isActiveAt(now));
  const later = subscription.items.filter((item) => item.startsAfter(now));
  const replaced = new Set(later.map((item) => item.featureKey));

  const scheduled: BillingPlanScheduledItemDto[] = [
    ...later.map((item) => ({
      featureKey: item.featureKey,
      tier: item.tier,
      startsAt: local(item.startsAt),
    })),
    ...active
      .filter((item) => item.endsAt !== null && !replaced.has(item.featureKey))
      .map((item) => ({
        featureKey: item.featureKey,
        tier: null,
        startsAt: local(item.endsAt as Date),
      })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || byFeatureOrder(a, b));

  return {
    current: active
      .map((item) => ({
        featureKey: item.featureKey,
        tier: item.tier,
        endsAt: item.endsAt === null ? null : local(item.endsAt),
      }))
      .sort(byFeatureOrder),
    scheduled: scheduled.length > 0 ? scheduled : null,
  };
}
