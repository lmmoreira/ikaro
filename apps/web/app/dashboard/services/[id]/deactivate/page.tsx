import { notFound } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { loadServiceDetailRouteData } from '@/shells/dashboard/model/service-route.server';
import { ServiceDeactivatePage } from '@/features/booking/components/dashboard/services/ServiceDeactivatePage';

interface ServiceDeactivateRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ServiceDeactivateRoute({
  params,
}: ServiceDeactivateRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const token = await getAccessToken();
  const { service } = await loadServiceDetailRouteData(token, id);

  if (!service.isActive) notFound();

  return <ServiceDeactivatePage service={service} />;
}
