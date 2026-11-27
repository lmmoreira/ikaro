import type {
  BillingChargeHistoryItemDto,
  BillingOpenChargeDto,
  BillingSummaryItemDto,
  BillingSummaryReadyResponse,
  BillingUpcomingPriceChangeDto,
} from '@ikaro/types';
import type { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { Charge } from '../../domain/charge.aggregate';
import type { FeaturePrice } from '../../domain/feature-price.aggregate';
import type { SelectionEntry } from '../../domain/plan-selection';
import type { Subscription } from '../../domain/subscription.aggregate';

/** A priced selection entry: the price aggregate it was read from and the amount in force (or none). */
export interface PricedEntry {
  readonly entry: SelectionEntry;
  readonly price: FeaturePrice | null;
  readonly amountMinor: number | null;
}

export const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

/** The list price in force on `date`, or `null` when the price or a started version is missing. */
export function priceEntry(
  entry: SelectionEntry,
  price: FeaturePrice | null,
  date: CalendarDate,
): PricedEntry {
  const version = price?.versionInForceAt(date) ?? null;
  return { entry, price, amountMinor: version?.amount.amountMinor ?? null };
}

export function toSummaryItems(priced: readonly PricedEntry[]): BillingSummaryItemDto[] {
  return priced.map(({ entry, amountMinor }) => ({
    featureKey: entry.featureKey,
    tier: entry.tier,
    unitPriceMinor: amountMinor,
  }));
}

/** The sum of the display prices, or `null` when any item has no price (a partial total would mislead). */
export function sumTotal(priced: readonly PricedEntry[]): number | null {
  let total = 0;
  for (const { amountMinor } of priced) {
    if (amountMinor === null) return null;
    total += amountMinor;
  }
  return total;
}

/**
 * Dated list-price changes the tenant was told about (UC-117): a version that starts after `date`,
 * whose fan-out has run (`announcedAt` set) and that no newer version replaced. A version the
 * operator only created, or a superseded one, is never shown.
 */
export function upcomingChanges(
  priced: readonly PricedEntry[],
  date: CalendarDate,
): BillingUpcomingPriceChangeDto[] {
  const changes: BillingUpcomingPriceChangeDto[] = [];
  for (const { entry, price, amountMinor } of priced) {
    if (price === null || amountMinor === null) continue;
    for (const version of price.announcedVersionsAfter(date)) {
      changes.push({
        featureKey: entry.featureKey,
        tier: entry.tier,
        currentAmountMinor: amountMinor,
        newAmountMinor: version.amount.amountMinor,
        effectiveFrom: version.effectiveFrom.value,
      });
    }
  }
  return changes.sort(
    (a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom) || a.featureKey.localeCompare(b.featureKey),
  );
}

/**
 * The open charge as the page shows it. The use case result has no URL field at all: it only says
 * whether a usable link exists at `now` (`POST …/payment-link` is the one place that returns it).
 */
export function toOpenCharge(charge: Charge, now: Date): BillingOpenChargeDto {
  const expiresAt = charge.paymentUrlExpiresAt;
  return {
    id: charge.id,
    kind: charge.kind,
    dueDate: charge.dueDate.value,
    subtotalMinor: charge.subtotal.amountMinor,
    taxMinor: 0,
    amountMinor: charge.amount.amountMinor,
    status: charge.status,
    hasPaymentLink:
      charge.paymentUrl !== null && (expiresAt === null || expiresAt.getTime() > now.getTime()),
    paymentLinkExpiresAt: iso(expiresAt),
  };
}

/** What the use case read besides the subscription row itself. */
export interface SummaryParts {
  readonly priced: readonly PricedEntry[];
  readonly upcoming: BillingUpcomingPriceChangeDto[];
  readonly openCharge: Charge | null;
  readonly firstChargePaid: boolean;
  readonly addressRequired: boolean;
  readonly now: Date;
}

/**
 * The full summary of a subscription. `suspendsAt`, `purgeAt` and the plan confirmation come from
 * the aggregate (never recomputed here); an exempt tenant lists nothing and owes nothing.
 */
export function toReadySummary(
  subscription: Subscription,
  parts: SummaryParts,
): BillingSummaryReadyResponse {
  const { priced, openCharge, now } = parts;
  return {
    provisioning: false,
    status: subscription.status,
    exempt: subscription.exempt,
    suspensionReason: subscription.suspensionReason,
    currency: subscription.currency,
    countryCode: subscription.countryCode.value,
    timezone: subscription.timezone.value,
    cycle: subscription.cycle,
    nextCycle: null,
    nextCycleFrom: null,
    trialEndsAt: iso(subscription.trialEndsAt),
    nextDueDate: subscription.nextDueDate?.value ?? null,
    pastDueSince: iso(subscription.pastDueSince),
    suspendsAt: iso(subscription.suspendsAt),
    cancelAt: iso(subscription.cancelAt),
    purgeAt: iso(subscription.purgeAt),
    planConfirmationRequired: subscription.planConfirmationRequired,
    planConfirmationFallbackAt: subscription.planConfirmationFallbackDate,
    canDiscard: false,
    firstChargePaid: parts.firstChargePaid,
    addressRequired: parts.addressRequired,
    items: toSummaryItems(priced),
    totalMinor: subscription.exempt ? 0 : sumTotal(priced),
    openCharge: openCharge ? toOpenCharge(openCharge, now) : null,
    autoBilling: { mode: 'NONE', status: 'INACTIVE', label: null },
    paymentConfirmationPending: openCharge?.paymentConfirmationPending === true,
    upcomingPriceChanges: parts.upcoming,
  };
}

export function toHistoryItem(charge: Charge): BillingChargeHistoryItemDto {
  return {
    id: charge.id,
    kind: charge.kind,
    periodStart: charge.periodStart?.value ?? null,
    periodEnd: charge.periodEnd?.value ?? null,
    dueDate: charge.dueDate.value,
    subtotalMinor: charge.subtotal.amountMinor,
    taxMinor: 0,
    amountMinor: charge.amount.amountMinor,
    currency: charge.amount.currency,
    status: charge.status,
    method: charge.method,
    paidAt: iso(charge.paidAt),
    receiptUrl: charge.receiptUrl,
    lines: charge.lines.map((line) => ({
      featureKey: line.featureKey,
      tier: line.tier,
      unitPriceMinor: line.unitPriceMinor,
    })),
    taxLines: [],
  };
}
