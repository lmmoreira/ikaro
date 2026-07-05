export interface LoyaltyBalanceResponse {
  currentPoints: number;
  nextExpiryDate: string | null;
  nextExpiryPoints: number | null;
  // Attached by the backend from tenant settings; null when the balance was read cross-tenant.
  conversionRate: number | null;
}

export interface BackendLoyaltyEntryItem {
  entryId: string;
  bookingId: string;
  serviceId: string;
  serviceName: string;
  points: number;
  earnedAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface BackendLoyaltyEntriesResponse {
  entries: BackendLoyaltyEntryItem[];
  pagination: { page: number; limit: number; total: number };
}

export interface LoyaltyBookingServiceSummary {
  serviceId: string;
  serviceName: string;
}

export interface BackendLoyaltyRedemptionItem {
  redemptionId: string;
  pointsRedeemed: number;
  pointsPerCurrencyUnit: number;
  redeemedAt: string;
  notes: string | null;
  bookingId: string | null;
  bookingServices: LoyaltyBookingServiceSummary[];
}

export interface BackendLoyaltyRedemptionsResponse {
  redemptions: BackendLoyaltyRedemptionItem[];
  pagination: { page: number; limit: number; total: number };
}

export interface RedeemPointsRequest {
  customerId: string;
  pointsToRedeem: number;
  notes?: string | null;
  bookingId?: string | null;
}

export interface RedeemPointsResponse {
  redemptionId: string;
  customerId: string;
  pointsRedeemed: number;
  newBalance: number;
  redeemedAt: string;
}
