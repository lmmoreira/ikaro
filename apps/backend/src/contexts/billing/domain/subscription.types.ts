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
}

export type SelectionChangeKind = 'ADD' | 'REMOVE' | 'TIER_CHANGE';

/** Why the Plano tab is read-only (UC-136 A2, A4, UC-117 A7); a payment suspension is editable (A14). */
export type PlanReadOnlyReason = 'PAST_DUE' | 'OPERATOR_SUSPENDED' | 'CANCEL_SCHEDULED' | 'EXEMPT';

export interface SelectionChange {
  readonly featureKey: FeatureKey;
  readonly kind: SelectionChangeKind;
  // The tier the plan has now (null for an ADD) and the tier the proposal has (null for a REMOVE).
  readonly fromTier: SelectionEntry['tier'] | null;
  readonly toTier: SelectionEntry['tier'] | null;
  // The next paid service-period start as a tenant-local date; null when there is none to give: an
  // exempt subscription, an operator suspension, or a payment suspension, where the plan applies
  // at the reactivation payment (UC-136 A14).
  readonly effectiveFrom: CalendarDate | null;
}

export interface SelectionPreview {
  readonly changes: SelectionChange[];
  /** The one date every change shares (`null` as on `SelectionChange.effectiveFrom`). */
  readonly effectiveFrom: CalendarDate | null;
}

/** What a refunded or charged-back charge says about the period it paid for (`Subscription.reversePayment`). */
export interface ReversedChargeFacts {
  readonly kind: 'PERIOD' | 'RECOVERY';
  readonly periodStart: CalendarDate | null;
  readonly periodEnd: CalendarDate | null;
  readonly paidAt: Date | null;
}
