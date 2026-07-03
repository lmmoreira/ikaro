import { notFound } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { getCustomerLoyaltyDetail } from '@/features/loyalty/dashboard-api.server';
import { CustomerLoyaltyPage } from '@/features/loyalty/components/dashboard/CustomerLoyaltyPage';

interface CustomerLoyaltyRouteProps {
  readonly params: Promise<{ customerId: string }>;
}

export default async function CustomerLoyaltyRoute({
  params,
}: CustomerLoyaltyRouteProps): Promise<React.JSX.Element> {
  const { customerId } = await params;
  const token = await getAccessToken();

  const result = await getCustomerLoyaltyDetail(token, customerId);
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) {
    throw new Error('Failed to load customer loyalty data');
  }

  return (
    <CustomerLoyaltyPage
      customer={result.data.customer}
      balance={result.data.balance}
      entries={result.data.entries}
      redemptions={result.data.redemptions}
    />
  );
}
