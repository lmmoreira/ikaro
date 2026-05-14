export interface LoyaltyEntryResponse {
  id: string;
  tenantId: string;
  bookingId: string;
  bookingLineId: string;
  points: number;
  expiresAt: string; // ISO-8601 datetime
  earnedAt: string;
}

export interface LoyaltyBalanceResponse {
  tenantId: string;
  customerId: string;
  activePoints: number;
  entries: LoyaltyEntryResponse[];
}
