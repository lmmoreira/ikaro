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
