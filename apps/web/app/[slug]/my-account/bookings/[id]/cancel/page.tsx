import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/customer/api.server';
import { CancelConfirmPage } from '@/features/customer/components/my-account/CancelConfirmPage';

interface CancelConfirmRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
}

export default async function CancelConfirmRoute({
  params,
}: CancelConfirmRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const token = await getAccessToken();
  const booking = await fetchCustomerBookingDetailOrRedirect(token, id, slug);

  return <CancelConfirmPage booking={booking} tenantSlug={slug} />;
}
