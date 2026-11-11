import type { FeatureKey } from '@ikaro/validation';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { Timezone } from '../../../shared/value-objects/timezone.vo';
import type { FeatureTier } from '../../../contexts/billing/domain/feature-price.aggregate';
import {
  Subscription,
  type SubscriptionStatus,
  type SuspensionReason,
} from '../../../contexts/billing/domain/subscription.aggregate';
import { SubscriptionItem } from '../../../contexts/billing/domain/subscription-item';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CURRENCY_BY_COUNTRY: Record<string, string> = { BR: 'BRL', US: 'USD' };

export class SubscriptionItemBuilder {
  private readonly id = uuidv7();
  private featureKey: FeatureKey = 'HOTSITE';
  private tier: FeatureTier = 'STANDARD';
  // Relative to now, never a calendar date: a fixed one ages into the past and flips `isActiveAt`.
  private startsAt = new Date(Date.now() - DAY_MS);
  private endsAt: Date | null = null;
  private createdBy = 'SYSTEM';

  withFeatureKey(featureKey: FeatureKey): this {
    this.featureKey = featureKey;
    return this;
  }

  withTier(tier: FeatureTier): this {
    this.tier = tier;
    return this;
  }

  withStartsAt(startsAt: Date): this {
    this.startsAt = startsAt;
    return this;
  }

  withEndsAt(endsAt: Date | null): this {
    this.endsAt = endsAt;
    return this;
  }

  withCreatedBy(createdBy: string): this {
    this.createdBy = createdBy;
    return this;
  }

  build(): SubscriptionItem {
    return SubscriptionItem.reconstitute({
      id: this.id,
      featureKey: this.featureKey,
      tier: this.tier,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      createdBy: this.createdBy,
    });
  }
}

/** A persisted-looking subscription (`reconstitute`): `TRIALING`, trial ending a week from now. */
export class SubscriptionBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private status: SubscriptionStatus = 'TRIALING';
  private suspensionReason: SuspensionReason | null = null;
  private countryCode = 'BR';
  private currency: string | null = null;
  private timezone = 'America/Sao_Paulo';
  private readonly merchantProfileKey = 'BRL_FAKE';
  private readonly anchorDay = 15;
  private trialEndsAt: Date | null = new Date(Date.now() + 7 * DAY_MS);
  private currentPeriodStart: Date | null = null;
  private currentPeriodEnd: Date | null = null;
  private nextDueDate: CalendarDate | null = null;
  private pastDueSince: Date | null = null;
  private graceUntil: Date | null = null;
  private readonly cancelAt: Date | null = null;
  private readonly planConfirmedAt: Date | null = null;
  private suspendedAt: Date | null = null;
  private purgeWarning30SentAt: Date | null = null;
  private purgeWarning7SentAt: Date | null = null;
  private hasEverPaid = false;
  private exempt = false;
  private items: SubscriptionItem[] = [];
  private version: number | undefined = 0;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withStatus(status: SubscriptionStatus): this {
    this.status = status;
    return this;
  }

  withSuspension(reason: SuspensionReason, suspendedAt: Date): this {
    this.status = 'SUSPENDED';
    this.suspensionReason = reason;
    this.suspendedAt = suspendedAt;
    return this;
  }

  withCountryCode(countryCode: string): this {
    this.countryCode = countryCode;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withTimezone(timezone: string): this {
    this.timezone = timezone;
    return this;
  }

  withTrialEndsAt(trialEndsAt: Date | null): this {
    this.trialEndsAt = trialEndsAt;
    return this;
  }

  withCurrentPeriod(start: Date | null, end: Date | null): this {
    this.currentPeriodStart = start;
    this.currentPeriodEnd = end;
    return this;
  }

  withNextDueDate(nextDueDate: string | null): this {
    this.nextDueDate = nextDueDate === null ? null : CalendarDate.create(nextDueDate);
    return this;
  }

  withPastDueSince(pastDueSince: Date | null): this {
    this.pastDueSince = pastDueSince;
    return this;
  }

  withGraceUntil(graceUntil: Date | null): this {
    this.graceUntil = graceUntil;
    return this;
  }

  withPurgeWarnings(sent30At: Date | null, sent7At: Date | null): this {
    this.purgeWarning30SentAt = sent30At;
    this.purgeWarning7SentAt = sent7At;
    return this;
  }

  withHasEverPaid(hasEverPaid: boolean): this {
    this.hasEverPaid = hasEverPaid;
    return this;
  }

  withExempt(exempt: boolean): this {
    this.exempt = exempt;
    return this;
  }

  withItems(items: SubscriptionItem[]): this {
    this.items = items;
    return this;
  }

  /** `undefined` builds a never-persisted aggregate (the repository inserts it). */
  withVersion(version: number | undefined): this {
    this.version = version;
    return this;
  }

  build(): Subscription {
    const subscription = Subscription.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      status: this.status,
      suspensionReason: this.suspensionReason,
      countryCode: CountryCode.create(this.countryCode),
      currency: this.currency ?? DEFAULT_CURRENCY_BY_COUNTRY[this.countryCode] ?? 'BRL',
      timezone: Timezone.create(this.timezone),
      merchantProfileKey: this.merchantProfileKey,
      cycle: 'MONTHLY',
      anchorDay: this.anchorDay,
      trialEndsAt: this.trialEndsAt,
      currentPeriodStart: this.currentPeriodStart,
      currentPeriodEnd: this.currentPeriodEnd,
      nextDueDate: this.nextDueDate,
      pastDueSince: this.pastDueSince,
      graceUntil: this.graceUntil,
      cancelAt: this.cancelAt,
      planConfirmedAt: this.planConfirmedAt,
      suspendedAt: this.suspendedAt,
      purgeWarning30SentAt: this.purgeWarning30SentAt,
      purgeWarning7SentAt: this.purgeWarning7SentAt,
      hasEverPaid: this.hasEverPaid,
      exempt: this.exempt,
      items: this.items,
      version: this.version,
    });
    subscription.clearDomainEvents();
    return subscription;
  }
}
