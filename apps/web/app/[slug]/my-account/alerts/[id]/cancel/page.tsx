import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerAvailabilityAlertOrRedirect } from '@/features/booking/api/availability-alerts.server';
import { alertDetailPath, canCancelAlert } from '@/features/customer/alert-model';
import { AvailabilityAlertCancelConfirm } from '@/features/customer/components/my-account/AvailabilityAlertCancelConfirm';

interface CancelAlertRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
}

export default async function CancelAlertRoute({
  params,
}: CancelAlertRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const token = await getAccessToken();
  const alert = await fetchCustomerAvailabilityAlertOrRedirect(token, id, slug);

  // Only an active alert can be cancelled — anything else goes back to its read-only page.
  if (!canCancelAlert(alert.status)) redirect(alertDetailPath(slug, id));

  return <AvailabilityAlertCancelConfirm alert={alert} tenantSlug={slug} />;
}
