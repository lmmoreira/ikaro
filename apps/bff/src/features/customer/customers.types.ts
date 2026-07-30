export interface CustomerSearchResponse {
  items: { customerId: string; name: string; email: string }[];
  total: number;
}

export interface LoyaltyBalanceItem {
  customerId: string;
  currentPoints: number;
}
