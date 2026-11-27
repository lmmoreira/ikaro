import type { ChatbotTier, CustomerFeatureKey, FeatureKey } from './enums';
import type { Pagination } from './pagination';

// Billing access resolution (M25-S13, UC-120). The backend answers the BFF with the full
// `BackendTenantAccessResponse`; the web only ever sees a role-reduced `BillingAccessResponse`.

export type TenantAccessStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';

export interface TenantAccessFeatureDto {
  key: FeatureKey;
  tier: ChatbotTier | 'STANDARD';
}

/** `GET /v1/billing/access` for a `MANAGER`. */
export interface BillingAccessManagerResponse {
  status: TenantAccessStatus;
  operational: boolean;
  features: TenantAccessFeatureDto[];
}

/** `GET /v1/billing/access` for `STAFF`: no `status`, so staff never learn the tenant is `PAST_DUE`. */
export interface BillingAccessStaffResponse {
  operational: boolean;
  features: TenantAccessFeatureDto[];
}

/**
 * `GET /v1/billing/access` for a `CUSTOMER`: whether the tenant is operational and which of the
 * customer-facing features it holds. No tier, no other feature.
 */
export interface BillingAccessCustomerResponse {
  operational: boolean;
  features: CustomerFeatureKey[];
}

/** No role ever receives the suspension reason or the internal `provisional` / `degraded` markers. */
export type BillingAccessResponse =
  BillingAccessManagerResponse | BillingAccessStaffResponse | BillingAccessCustomerResponse;

/** `GET /internal/billing/suspended-tenant-ids` (backend, internal API key). */
export interface SuspendedTenantIdsResponse {
  tenantIds: string[];
}

// ── Manager billing reads (M26-S14, UC-117) ───────────────────────────────────────────────────
// One contract shared by the backend result and the BFF response (docs/API_CONTRACTS.md
// § Billing — Manager API). Enums and numbers only: the web translates, and no URL appears here.

export type BillingSuspensionReason = 'NON_PAYMENT' | 'CANCELED' | 'PAYMENT_REVERSED' | 'OPERATOR';
export type BillingChargeKind = 'PERIOD' | 'RECOVERY';
export type BillingChargeStatus =
  'PENDING' | 'PAID' | 'OVERDUE' | 'FAILED' | 'CANCELED' | 'REFUNDED' | 'CHARGEBACK';
export type BillingPaymentMethod = 'PIX' | 'BOLETO' | 'CARD';

/** `unitPriceMinor` is `null` only when no price version is in force for the item (a logged data gap). */
export interface BillingSummaryItemDto {
  featureKey: FeatureKey;
  tier: ChatbotTier | 'STANDARD';
  unitPriceMinor: number | null;
}

/** The open `PERIOD` charge, or while `SUSPENDED` the open `RECOVERY` one. Never carries the URL. */
export interface BillingOpenChargeDto {
  id: string;
  kind: BillingChargeKind;
  dueDate: string;
  subtotalMinor: number;
  taxMinor: number;
  amountMinor: number;
  status: BillingChargeStatus;
  hasPaymentLink: boolean;
  paymentLinkExpiresAt: string | null;
}

export interface BillingUpcomingPriceChangeDto {
  featureKey: FeatureKey;
  tier: ChatbotTier | 'STANDARD';
  currentAmountMinor: number;
  newAmountMinor: number;
  effectiveFrom: string;
}

/** A tenant with no subscription row yet (UC-117 A9): nothing else is known. */
export interface BillingSummaryProvisioningResponse {
  provisioning: true;
}

export interface BillingSummaryReadyResponse {
  provisioning: false;
  status: TenantAccessStatus;
  exempt: boolean;
  suspensionReason: BillingSuspensionReason | null;
  currency: string;
  countryCode: string;
  timezone: string;
  cycle: 'MONTHLY';
  nextCycle: null;
  nextCycleFrom: null;
  trialEndsAt: string | null;
  nextDueDate: string | null;
  pastDueSince: string | null;
  suspendsAt: string | null;
  cancelAt: string | null;
  purgeAt: string | null;
  planConfirmationRequired: boolean;
  planConfirmationFallbackAt: string | null;
  canDiscard: false;
  firstChargePaid: boolean;
  addressRequired: boolean;
  items: BillingSummaryItemDto[];
  totalMinor: number | null;
  openCharge: BillingOpenChargeDto | null;
  autoBilling: { mode: 'NONE'; status: 'INACTIVE'; label: null };
  paymentConfirmationPending: boolean;
  upcomingPriceChanges: BillingUpcomingPriceChangeDto[];
}

/** `GET /v1/billing/summary`: discriminated on `provisioning`. */
export type BillingSummaryResponse =
  BillingSummaryProvisioningResponse | BillingSummaryReadyResponse;

export type BillingPlanReadOnlyReason =
  'PAST_DUE' | 'OPERATOR_SUSPENDED' | 'CANCEL_SCHEDULED' | 'EXEMPT';

/** An announced future price of a tier (UC-136 price-change note); amounts are minor units. */
export interface BillingPlanUpcomingPriceDto {
  amountMinor: number;
  effectiveFrom: string;
}

/** One public list price (UC-128): the amount in force, and the announced next one when there is one. */
export interface PublicPriceItemDto {
  featureKey: FeatureKey;
  tier: ChatbotTier | 'STANDARD';
  amountMinor: number;
  upcoming?: BillingPlanUpcomingPriceDto;
}

/** A country a visitor can sign up from: its currency, whether prices include tax, and its price list. */
export interface PublicPricesOfferedResponse {
  countryCode: string;
  currency: string;
  taxBehavior: 'INCLUSIVE' | 'EXCLUSIVE';
  items: PublicPriceItemDto[];
}

/** A country outside the signup list, or one the platform does not know: not an error, just not offered. */
export interface PublicPricesNotOfferedResponse {
  items: [];
}

/**
 * `GET /v1/public/billing/prices?country=` (UC-128). The page narrows on `countryCode`: present means
 * the country is offered (its `items` may still be empty), absent means "not offered".
 */
export type PublicPricesResponse = PublicPricesOfferedResponse | PublicPricesNotOfferedResponse;

/** `unitPriceMinor` is `null` and `available` `false` when no selectable price is in force (UC-136 A6). */
export interface BillingPlanTierDto {
  tier: ChatbotTier | 'STANDARD';
  unitPriceMinor: number | null;
  available: boolean;
  upcoming?: BillingPlanUpcomingPriceDto;
}

export interface BillingPlanFeatureDto {
  featureKey: FeatureKey;
  /** Direct requirements: the features that must be in the plan for this one to be selected. */
  requires: FeatureKey[];
  tiers: BillingPlanTierDto[];
}

/** A feature active now; `endsAt` is set while a removal or tier change is pending. */
export interface BillingPlanCurrentItemDto {
  featureKey: FeatureKey;
  tier: ChatbotTier | 'STANDARD';
  endsAt: string | null;
}

/** A change that starts later; `tier: null` is a removal that takes effect on `startsAt`. */
export interface BillingPlanScheduledItemDto {
  featureKey: FeatureKey;
  tier: (ChatbotTier | 'STANDARD') | null;
  startsAt: string;
}

export interface BillingPlanReadyResponse {
  provisioning: false;
  countryCode: string;
  currency: string;
  readOnly: { reason: BillingPlanReadOnlyReason } | null;
  trial: { active: boolean; planConfirmed: boolean };
  features: BillingPlanFeatureDto[];
  current: BillingPlanCurrentItemDto[];
  scheduled: BillingPlanScheduledItemDto[] | null;
  /** The going-forward selection priced at the next period start; `null` when a price is missing. */
  totalMinor: number | null;
}

/** `GET /v1/billing/plan`: discriminated on `provisioning`, as the summary is. */
export type BillingPlanResponse = BillingSummaryProvisioningResponse | BillingPlanReadyResponse;

export type BillingPlanChangeKind = 'ADD' | 'REMOVE' | 'TIER_CHANGE';

export interface BillingPlanChangeDto {
  featureKey: FeatureKey;
  kind: BillingPlanChangeKind;
  fromTier: (ChatbotTier | 'STANDARD') | null;
  toTier: (ChatbotTier | 'STANDARD') | null;
  /** `null` while suspended for payment ("at the reactivation payment"), operator-suspended or exempt. */
  effectiveFrom: string | null;
}

/** `POST /v1/billing/plan/preview`: nothing is saved (UC-136 main flow 2). */
export interface BillingPlanPreviewResponse {
  changes: BillingPlanChangeDto[];
  newTotalMinor: number;
  effectiveFrom: string | null;
  /** The next invoice is already paid, so every date moved to the following period (UC-136 A7). */
  deferredBecauseNextInvoicePaid: boolean;
}

export interface BillingChargeLineDto {
  featureKey: FeatureKey;
  tier: ChatbotTier | 'STANDARD';
  unitPriceMinor: number;
}

export interface BillingChargeHistoryItemDto {
  id: string;
  kind: BillingChargeKind;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  subtotalMinor: number;
  taxMinor: number;
  amountMinor: number;
  currency: string;
  status: BillingChargeStatus;
  method: BillingPaymentMethod | null;
  paidAt: string | null;
  receiptUrl: string | null;
  lines: BillingChargeLineDto[];
  taxLines: never[];
}

/** `GET /v1/billing/charges` (Pattern A). */
export interface BillingChargesResponse {
  items: BillingChargeHistoryItemDto[];
  pagination: Pagination;
}

/**
 * `POST /v1/billing/charges/{chargeId}/payment-link` (M26-S15, UC-119). A payable charge carries the
 * provider's hosted URL and its expiry (`expiresAt` is `null` when the provider gave none, never
 * invented); an already-paid charge (A4) carries neither and the page refreshes to the paid state.
 */
export type BillingPaymentLinkResponse =
  | { status: 'PAID'; paymentUrl: null; expiresAt: null }
  | { status: Exclude<BillingChargeStatus, 'PAID'>; paymentUrl: string; expiresAt: string | null };

/** `POST /v1/billing/charges/{chargeId}/payment-return` (M26-S15, UC-119, UC-116). */
export interface BillingPaymentReturnResponse {
  status: BillingChargeStatus;
  paymentConfirmationPending: boolean;
}
