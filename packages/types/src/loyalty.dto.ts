export interface CustomerLoyaltyBalanceResponse {
  currentPoints: number;
  nextExpiryDate: string | null; // ISO-8601 datetime (Date.toISOString())
  nextExpiryPoints: number | null;
  conversionRate: number; // points_per_currency_unit — see M13-S12; 0 = redemption disabled
}

export interface CustomerLoyaltyEntryResponse {
  entryId: string;
  serviceName: string;
  pointsEarned: number;
  earnedAt: string; // ISO-8601
  expiresAt: string; // ISO-8601 — every entry has a real expiry, computed at earn time
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
  amountSaved: string; // formatted BRL e.g. "R$ 8,50" — "R$ 0,00" until M13-S12 lands
  redeemedAt: string; // ISO-8601
  bookingReference: string | null; // e.g. "Lavagem Completa" — from booking.lines[0]
}

export interface CustomerLoyaltyRedemptionsResponse {
  items: CustomerLoyaltyRedemptionResponse[];
  total: number;
  page: number;
  limit: number;
}
