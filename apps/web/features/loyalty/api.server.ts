import type {
  CustomerLoyaltyBalanceResponse,
  CustomerLoyaltyEntriesResponse,
  CustomerLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk } from '@/shared/lib/api/errors';
import { CustomerFetchError } from '@/features/customer/api.server';

// GET /v1/loyalty/entries and /redemptions default to limit=20 (shared PaginationSchema) —
// pass limit=50 explicitly to match the my-account list pages' page size.
const LOYALTY_HISTORY_LIMIT = 50;

export async function fetchLoyaltyBalance(token: string): Promise<CustomerLoyaltyBalanceResponse> {
  const res = await bffServerFetch(token, '/loyalty/balance');
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerLoyaltyBalanceResponse>;
}

export async function fetchLoyaltyEntries(token: string): Promise<CustomerLoyaltyEntriesResponse> {
  const res = await bffServerFetch(token, `/loyalty/entries?limit=${LOYALTY_HISTORY_LIMIT}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerLoyaltyEntriesResponse>;
}

export async function fetchLoyaltyRedemptions(
  token: string,
): Promise<CustomerLoyaltyRedemptionsResponse> {
  const res = await bffServerFetch(token, `/loyalty/redemptions?limit=${LOYALTY_HISTORY_LIMIT}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerLoyaltyRedemptionsResponse>;
}
