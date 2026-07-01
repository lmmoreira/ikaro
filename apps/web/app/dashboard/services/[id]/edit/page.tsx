import { getAccessToken } from '@/lib/auth/get-access-token';
import { loadServiceDetailRouteData } from '@/lib/dashboard/service-route.server';
import { ServiceEditPage } from '@/components/dashboard/services/ServiceEditPage';

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
