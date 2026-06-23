export interface LoyaltyBalanceResponse {
  currentPoints: number;
  nextExpiryDate: string | null;
  nextExpiryPoints: number | null;
}

export interface LoyaltyEntryItem {
  entryId: string;
  serviceId: string;
  serviceName: string;
  points: number;
  earnedAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface LoyaltyEntriesResponse {
  entries: LoyaltyEntryItem[];
  pagination: { page: number; limit: number; total: number };
}

export interface LoyaltyBookingServiceSummary {
  serviceId: string;
  serviceName: string;
}

export interface LoyaltyRedemptionItem {
  redemptionId: string;
  pointsRedeemed: number;
  pointsPerCurrencyUnit: number;
  redeemedAt: string;
  notes: string | null;
  bookingServices: LoyaltyBookingServiceSummary[];
}

export interface LoyaltyRedemptionsResponse {
  redemptions: LoyaltyRedemptionItem[];
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
