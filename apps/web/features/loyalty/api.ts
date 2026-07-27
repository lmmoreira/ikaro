import { bffClient } from '@/shared/lib/api/bff-client';

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

export async function redeemPoints(body: RedeemPointsRequest): Promise<RedeemPointsResponse> {
  const res = await bffClient.post<RedeemPointsResponse>('/loyalty/redeem', body);
  return res.data;
}
