export interface CustomerLoyaltyBalanceResponse {
  currentPoints: number;
  nextExpiryDate: string | null; // ISO-8601 datetime (Date.toISOString())
  nextExpiryPoints: number | null;
  conversionRate: number; // points_per_currency_unit — see M13-S12; 0 = redemption disabled
}
