import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerAvailabilityAlertOrRedirect } from '@/features/booking/api/availability-alerts.server';
import { AvailabilityAlertDetail } from '@/features/customer/components/my-account/AvailabilityAlertDetail';

interface AlertDetailRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
}

export default async function AlertDetailRoute({
  params,
}: AlertDetailRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const token = await getAccessToken();
  const alert = await fetchCustomerAvailabilityAlertOrRedirect(token, id, slug);

  return <AvailabilityAlertDetail alert={alert} tenantSlug={slug} />;
}
