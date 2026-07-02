import { bffClient } from '@/shared/lib/api/bff-client';

export interface LoyaltyBalanceResponse {
  readonly currentPoints: number;
  readonly nextExpiryDate: string | null;
  readonly nextExpiryPoints: number | null;
}

export interface LoyaltyEntryItem {
  readonly entryId: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly points: number;
  readonly earnedAt: string;
  readonly expiresAt: string;
  readonly isActive: boolean;
}

export interface LoyaltyEntriesResponse {
  readonly entries: readonly LoyaltyEntryItem[];
  readonly pagination: { readonly page: number; readonly limit: number; readonly total: number };
}

export interface LoyaltyRedemptionItem {
  readonly redemptionId: string;
  readonly pointsRedeemed: number;
  readonly redeemedAt: string;
  readonly notes: string | null;
}

export interface LoyaltyRedemptionsResponse {
  readonly redemptions: readonly LoyaltyRedemptionItem[];
  readonly pagination: { readonly page: number; readonly limit: number; readonly total: number };
}

export interface RedeemPointsRequest {
  readonly customerId: string;
  readonly pointsToRedeem: number;
  readonly notes?: string | null;
  readonly bookingId?: string | null;
}

export interface RedeemPointsResponse {
  readonly redemptionId: string;
  readonly customerId: string;
  readonly pointsRedeemed: number;
  readonly newBalance: number;
  readonly redeemedAt: string;
}

export interface LoyaltyPaginationQuery {
  readonly page?: number;
  readonly limit?: number;
}

export async function getLoyaltyBalance(): Promise<LoyaltyBalanceResponse> {
  const res = await bffClient.get<LoyaltyBalanceResponse>('/loyalty/balance');
  return res.data;
}

export async function getLoyaltyEntries(
  query?: LoyaltyPaginationQuery,
): Promise<LoyaltyEntriesResponse> {
  const res = await bffClient.get<LoyaltyEntriesResponse>('/loyalty/entries', { params: query });
  return res.data;
}

export async function getLoyaltyRedemptions(
  query?: LoyaltyPaginationQuery,
): Promise<LoyaltyRedemptionsResponse> {
  const res = await bffClient.get<LoyaltyRedemptionsResponse>('/loyalty/redemptions', {
    params: query,
  });
  return res.data;
}

export async function getCustomerLoyaltyBalance(
  customerId: string,
): Promise<LoyaltyBalanceResponse> {
  const res = await bffClient.get<LoyaltyBalanceResponse>(
    `/customers/${customerId}/loyalty/balance`,
  );
  return res.data;
}

export async function getCustomerLoyaltyEntries(
  customerId: string,
  query?: LoyaltyPaginationQuery,
): Promise<LoyaltyEntriesResponse> {
  const res = await bffClient.get<LoyaltyEntriesResponse>(
    `/customers/${customerId}/loyalty/entries`,
    { params: query },
  );
  return res.data;
}

export async function getCustomerLoyaltyRedemptions(
  customerId: string,
  query?: LoyaltyPaginationQuery,
): Promise<LoyaltyRedemptionsResponse> {
  const res = await bffClient.get<LoyaltyRedemptionsResponse>(
    `/customers/${customerId}/loyalty/redemptions`,
    { params: query },
  );
  return res.data;
}

export async function redeemPoints(body: RedeemPointsRequest): Promise<RedeemPointsResponse> {
  const res = await bffClient.post<RedeemPointsResponse>('/loyalty/redeem', body);
  return res.data;
}
