import type { FeatureKey } from '@ikaro/validation';
import type { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import type { CountryCode } from '../../../shared/value-objects/country-code.vo';
import type { Timezone } from '../../../shared/value-objects/timezone.vo';
import type { SelectionEntry } from './plan-selection';
import type { SubscriptionItem } from './subscription-item';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
export type SuspensionReason = 'NON_PAYMENT' | 'CANCELED' | 'PAYMENT_REVERSED' | 'OPERATOR';
/** `MONTHLY` only in the first schema; `ANNUAL` arrives with slice H. */
export type SubscriptionCycle = 'MONTHLY';

/** A trial lasts 14 tenant-local days, ending at the local midnight that closes day 14. */
export const TRIAL_DAYS = 14;
/** Renewals land on a day 1..28, so the 29th-31st never need special handling. */
export const ANCHOR_DAY_MAX = 28;
/** PAST_DUE keeps full access for 14 days; an operator grace only ever extends this. */
export const GRACE_DAYS = 14;
/** Clean-up delay after a suspension: 90 days if the subscription never paid, 180 if it did. */
export const PURGE_DAYS_NEVER_PAID = 90;
export const PURGE_DAYS_PAID = 180;

export interface SubscriptionProps {
  id: string;
  tenantId: string;
  status: SubscriptionStatus;
  suspensionReason: SuspensionReason | null;
  countryCode: CountryCode;
  currency: string;
  // Snapshot of the tenant's timezone at creation: IMMUTABLE, every period boundary is local
  // midnight in it. No method on the aggregate reassigns it.
  timezone: Timezone;
  merchantProfileKey: string;
  cycle: SubscriptionCycle;
  anchorDay: number;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  nextDueDate: CalendarDate | null;
  pastDueSince: Date | null;
  graceUntil: Date | null;
  cancelAt: Date | null;
  planConfirmedAt: Date | null;
  suspendedAt: Date | null;
  purgeWarning30SentAt: Date | null;
  purgeWarning7SentAt: Date | null;
  hasEverPaid: boolean;
  exempt: boolean;
  items: SubscriptionItem[];
  // undefined = never persisted (the repository inserts); otherwise the optimistic-lock version.
  version?: number;
}

/** What a subscription starts from; `start` is the tenant's creation instant (never read from a clock). */
export interface StartSubscriptionInput {
  tenantId: string;
  countryCode: CountryCode;
  currency: string;
  timezone: string;
  merchantProfileKey: string;
  start: Date;
  // An explicit feature subset (UC-110 A3); every sellable feature when omitted.
  features?: readonly FeatureKey[];
}

export type SelectionChangeKind = 'ADD' | 'REMOVE' | 'TIER_CHANGE';

export interface SelectionChange {
  readonly featureKey: FeatureKey;
  readonly tier: SelectionEntry['tier'];
  readonly kind: SelectionChangeKind;
  // The next paid service-period start; null when the subscription has none yet (an exempt one).
  readonly effectiveFrom: Date | null;
}

export interface SelectionPreview {
  readonly changes: SelectionChange[];
}
