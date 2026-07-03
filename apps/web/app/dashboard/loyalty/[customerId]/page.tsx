import { notFound } from 'next/navigation';
import type {
  CustomerProfileResponse,
  EnrichedLoyaltyBalanceResponse,
  PaginatedLoyaltyEntriesResponse,
  PaginatedLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { getAccessToken } from '@/features/auth/get-access-token';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { CustomerLoyaltyPage } from '@/features/loyalty/components/dashboard/CustomerLoyaltyPage';

interface CustomerLoyaltyRouteProps {
  readonly params: Promise<{ customerId: string }>;
}

async function fetchJson<T>(
  token: string,
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const response = await bffServerFetch(token, path);
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, data: (await response.json()) as T };
}

export default async function CustomerLoyaltyRoute({
  params,
}: CustomerLoyaltyRouteProps): Promise<React.JSX.Element> {
  const { customerId } = await params;
  const token = await getAccessToken();

  const [customerResult, balanceResult, entriesResult, redemptionsResult] = await Promise.all([
    fetchJson<CustomerProfileResponse>(token, `/customers/${customerId}`),
    fetchJson<EnrichedLoyaltyBalanceResponse>(token, `/customers/${customerId}/loyalty/balance`),
    fetchJson<PaginatedLoyaltyEntriesResponse>(
      token,
      `/customers/${customerId}/loyalty/entries?limit=20&page=1`,
    ),
    fetchJson<PaginatedLoyaltyRedemptionsResponse>(
      token,
      `/customers/${customerId}/loyalty/redemptions?limit=20&page=1`,
    ),
  ]);

  if (!customerResult.ok && customerResult.status === 404) notFound();
  if (!customerResult.ok || !balanceResult.ok || !entriesResult.ok || !redemptionsResult.ok) {
    throw new Error('Failed to load customer loyalty data');
  }

  return (
    <CustomerLoyaltyPage
      customer={customerResult.data}
      balance={balanceResult.data}
      entries={entriesResult.data}
      redemptions={redemptionsResult.data}
    />
  );
}
