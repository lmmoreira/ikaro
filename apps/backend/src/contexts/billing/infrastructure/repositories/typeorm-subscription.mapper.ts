import type { FeatureKey } from '@ikaro/validation';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import type { FeatureTier } from '../../domain/feature-price.aggregate';
import {
  Subscription,
  type SubscriptionCycle,
  type SubscriptionStatus,
  type SuspensionReason,
} from '../../domain/subscription.aggregate';
import { SubscriptionItem } from '../../domain/subscription-item';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';

export function itemToDomain(row: SubscriptionItemEntity): SubscriptionItem {
  return SubscriptionItem.reconstitute({
    id: row.id,
    featureKey: row.featureKey as FeatureKey,
    tier: row.tier as FeatureTier,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdBy: row.createdBy,
  });
}

export function subscriptionToDomain(
  entity: SubscriptionEntity,
  items: SubscriptionItemEntity[],
): Subscription {
  return Subscription.reconstitute({
    id: entity.id,
    tenantId: entity.tenantId,
    status: entity.status as SubscriptionStatus,
    suspensionReason: entity.suspensionReason as SuspensionReason | null,
    // CHAR(n) columns come back space-padded when shorter; these are exactly 2 and 3 wide.
    countryCode: CountryCode.reconstitute(entity.countryCode.trim()),
    currency: entity.currency.trim(),
    timezone: Timezone.create(entity.timezone),
    merchantProfileKey: entity.merchantProfileKey,
    cycle: entity.cycle as SubscriptionCycle,
    anchorDay: entity.anchorDay,
    trialEndsAt: entity.trialEndsAt,
    currentPeriodStart: entity.currentPeriodStart,
    currentPeriodEnd: entity.currentPeriodEnd,
    nextDueDate: entity.nextDueDate === null ? null : CalendarDate.reconstitute(entity.nextDueDate),
    pastDueSince: entity.pastDueSince,
    graceUntil: entity.graceUntil,
    cancelAt: entity.cancelAt,
    planConfirmedAt: entity.planConfirmedAt,
    suspendedAt: entity.suspendedAt,
    purgeWarning30SentAt: entity.purgeWarning30SentAt,
    purgeWarning7SentAt: entity.purgeWarning7SentAt,
    hasEverPaid: entity.hasEverPaid,
    exempt: entity.exempt,
    items: items.map(itemToDomain),
    version: entity.version,
  });
}

/** The full row; `version` is set by the repository, which owns the optimistic lock. */
export function subscriptionToEntity(
  subscription: Subscription,
  version: number,
): SubscriptionEntity {
  const entity = new SubscriptionEntity();
  entity.id = subscription.id;
  entity.tenantId = subscription.tenantId;
  entity.status = subscription.status;
  entity.suspensionReason = subscription.suspensionReason;
  entity.countryCode = subscription.countryCode.value;
  entity.currency = subscription.currency;
  entity.timezone = subscription.timezone.value;
  entity.merchantProfileKey = subscription.merchantProfileKey;
  entity.cycle = subscription.cycle;
  entity.anchorDay = subscription.anchorDay;
  entity.trialEndsAt = subscription.trialEndsAt;
  entity.currentPeriodStart = subscription.currentPeriodStart;
  entity.currentPeriodEnd = subscription.currentPeriodEnd;
  entity.nextDueDate = subscription.nextDueDate?.value ?? null;
  entity.pastDueSince = subscription.pastDueSince;
  entity.graceUntil = subscription.graceUntil;
  entity.cancelAt = subscription.cancelAt;
  entity.planConfirmedAt = subscription.planConfirmedAt;
  entity.suspendedAt = subscription.suspendedAt;
  entity.purgeWarning30SentAt = subscription.purgeWarning30SentAt;
  entity.purgeWarning7SentAt = subscription.purgeWarning7SentAt;
  entity.hasEverPaid = subscription.hasEverPaid;
  entity.exempt = subscription.exempt;
  entity.version = version;
  entity.updatedAt = new Date();
  return entity;
}

/**
 * The columns an UPDATE may change. The identity (id, tenant), the country, currency, timezone,
 * merchant profile key and cycle are fixed at creation and never written again.
 */
export function subscriptionUpdateSet(entity: SubscriptionEntity): Partial<SubscriptionEntity> {
  return {
    status: entity.status,
    suspensionReason: entity.suspensionReason,
    anchorDay: entity.anchorDay,
    trialEndsAt: entity.trialEndsAt,
    currentPeriodStart: entity.currentPeriodStart,
    currentPeriodEnd: entity.currentPeriodEnd,
    nextDueDate: entity.nextDueDate,
    pastDueSince: entity.pastDueSince,
    graceUntil: entity.graceUntil,
    cancelAt: entity.cancelAt,
    planConfirmedAt: entity.planConfirmedAt,
    suspendedAt: entity.suspendedAt,
    purgeWarning30SentAt: entity.purgeWarning30SentAt,
    purgeWarning7SentAt: entity.purgeWarning7SentAt,
    hasEverPaid: entity.hasEverPaid,
    exempt: entity.exempt,
    version: entity.version,
    updatedAt: entity.updatedAt,
  };
}

export function itemToEntity(item: SubscriptionItem, tenantId: string, subscriptionId: string) {
  const row = new SubscriptionItemEntity();
  row.id = item.id;
  row.tenantId = tenantId;
  row.subscriptionId = subscriptionId;
  row.featureKey = item.featureKey;
  row.tier = item.tier;
  row.startsAt = item.startsAt;
  row.endsAt = item.endsAt;
  row.createdBy = item.createdBy;
  return row;
}
