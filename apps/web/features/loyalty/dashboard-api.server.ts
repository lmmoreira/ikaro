import type { StaffCustomerLoyaltyDetailResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

export type CustomerLoyaltyDashboardResult =
  | { readonly ok: true; readonly data: StaffCustomerLoyaltyDetailResponse }
  | { readonly ok: false; readonly status: number };

export async function getCustomerLoyaltyDetail(
  token: string,
  customerId: string,
): Promise<CustomerLoyaltyDashboardResult> {
  const res = await bffServerFetch(token, `/customers/${customerId}/loyalty`);
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: (await res.json()) as StaffCustomerLoyaltyDetailResponse };
}
