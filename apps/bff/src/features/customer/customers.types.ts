export interface CustomerSearchResponse {
  items: { customerId: string; name: string; email: string; phone: string | null }[];
  total: number;
}

export interface LoyaltyBalanceItem {
  customerId: string;
  currentPoints: number;
}

export interface LoyaltyBalanceByTenantItem {
  tenantId: string;
  currentPoints: number;
}
