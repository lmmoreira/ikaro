import type { CustomerProfileResponse } from './customer.dto';

// ── Base backend shape (raw response from backend loyalty endpoints) ──────────

export interface LoyaltyBalanceResponse {
  readonly currentPoints: number;
  readonly nextExpiryDate: string | null;
  readonly nextExpiryPoints: number | null;
}

// ── Staff-facing (enriched with live conversionRate from tenant settings) ─────

export interface EnrichedLoyaltyBalanceResponse extends LoyaltyBalanceResponse {
  readonly conversionRate: number; // pointsPerCurrencyUnit; 0 = redemption disabled
}

export interface LoyaltyEntryItem {
  readonly id: string;
  readonly serviceName: string;
  readonly points: number;
  readonly earnedAt: string; // ISO-8601
  readonly expiresAt: string; // ISO-8601
  readonly isActive: boolean;
}

export interface LoyaltyRedemptionItem {
  readonly id: string;
  readonly pointsRedeemed: number;
  readonly amountDeducted: number; // computed: pointsRedeemed / pointsPerCurrencyUnit
  readonly redeemedAt: string; // ISO-8601
  readonly bookingId: string | null;
  readonly notes: string | null;
}

export interface PaginatedLoyaltyEntriesResponse {
  readonly items: LoyaltyEntryItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface PaginatedLoyaltyRedemptionsResponse {
  readonly items: LoyaltyRedemptionItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

// ── Customer-facing ───────────────────────────────────────────────────────────

export interface CustomerLoyaltyBalanceResponse {
  currentPoints: number;
  nextExpiryDate: string | null; // ISO-8601 datetime (Date.toISOString())
  nextExpiryPoints: number | null;
  conversionRate: number; // pointsPerCurrencyUnit; 0 = redemption disabled
}

export interface CustomerLoyaltyEntryResponse {
  entryId: string;
  serviceName: string;
  pointsEarned: number;
  earnedAt: string; // ISO-8601
  expiresAt: string; // ISO-8601
  expired: boolean; // server-computed: expiresAt < now
}

export interface CustomerLoyaltyEntriesResponse {
  items: CustomerLoyaltyEntryResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface CustomerLoyaltyRedemptionResponse {
  redemptionId: string;
  pointsUsed: number;
  amountSaved: string; // formatted BRL e.g. "R$ 8,50"
  redeemedAt: string; // ISO-8601
  bookingReference: string | null;
}

export interface CustomerLoyaltyRedemptionsResponse {
  items: CustomerLoyaltyRedemptionResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface StaffCustomerLoyaltyDetailResponse {
  readonly customer: CustomerProfileResponse;
  readonly balance: EnrichedLoyaltyBalanceResponse;
  readonly entries: PaginatedLoyaltyEntriesResponse;
  readonly redemptions: PaginatedLoyaltyRedemptionsResponse;
}
