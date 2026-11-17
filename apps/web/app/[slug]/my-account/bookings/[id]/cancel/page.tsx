import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/booking/api/customer.server';
import { resolveReturnTo } from '@/features/customer/booking-navigation';
import { CancelConfirmPage } from '@/features/customer/components/my-account/CancelConfirmPage';
import { redirectCustomerWithoutFeature } from '@/shared/lib/billing/access.server';

interface CancelConfirmRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
  readonly searchParams: Promise<{ readonly returnTo?: string }>;
}

export default async function CancelConfirmRoute({
  params,
  searchParams,
}: CancelConfirmRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();
  await redirectCustomerWithoutFeature(token, slug, 'BOOKING');
  const booking = await fetchCustomerBookingDetailOrRedirect(token, id, slug);

  return (
    <CancelConfirmPage
      booking={booking}
      tenantSlug={slug}
      returnTo={resolveReturnTo(returnTo, slug)}
    />
  );
}
