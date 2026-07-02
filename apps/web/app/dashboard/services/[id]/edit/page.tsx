import { getAccessToken } from '@/features/auth/get-access-token';
import { loadServiceDetailRouteData } from '@/shells/dashboard/model/service-route.server';
import { ServiceEditPage } from '@/features/booking/components/dashboard/services/ServiceEditPage';

interface ServiceEditRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ServiceEditRoute({
  params,
}: ServiceEditRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const token = await getAccessToken();
  const { service } = await loadServiceDetailRouteData(token, id);

  return <ServiceEditPage service={service} />;
}
