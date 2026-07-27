import { bffClient } from '@/shared/lib/api/bff-client';
import type {
  PaginatedLoyaltyEntriesResponse,
  PaginatedLoyaltyRedemptionsResponse,
} from '@ikaro/types';

export interface LoyaltyPaginationQuery {
  readonly page?: number;
  readonly limit?: number;
}

export async function getCustomerLoyaltyEntries(
  customerId: string,
  query?: LoyaltyPaginationQuery,
): Promise<PaginatedLoyaltyEntriesResponse> {
  const res = await bffClient.get<PaginatedLoyaltyEntriesResponse>(
    `/customers/${customerId}/loyalty/entries`,
    { params: query },
  );
  return res.data;
}

export async function getCustomerLoyaltyRedemptions(
  customerId: string,
  query?: LoyaltyPaginationQuery,
): Promise<PaginatedLoyaltyRedemptionsResponse> {
  const res = await bffClient.get<PaginatedLoyaltyRedemptionsResponse>(
    `/customers/${customerId}/loyalty/redemptions`,
    { params: query },
  );
  return res.data;
}
