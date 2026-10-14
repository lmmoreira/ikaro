import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerAvailabilityAlerts } from '@/features/booking/api/availability-alerts.server';
import { withAuthRedirect } from '@/features/customer/api.server';
import { AvailabilityAlertList } from '@/features/customer/components/my-account/AvailabilityAlertList';

interface AlertsPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function AlertsPage({ params }: AlertsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();
  const alerts = await withAuthRedirect(fetchCustomerAvailabilityAlerts(token), slug);

  return <AvailabilityAlertList alerts={alerts.items} tenantSlug={slug} />;
}
