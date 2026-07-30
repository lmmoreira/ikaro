export interface CustomerSearchResponse {
  items: { customerId: string; name: string; email: string }[];
  total: number;
}

export interface LoyaltyBalanceBatchItem {
  customerId: string;
  currentPoints: number;
}
