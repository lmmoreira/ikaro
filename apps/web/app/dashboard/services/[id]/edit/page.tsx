import { getAccessToken } from '@/features/auth/get-access-token';
import { loadServiceEditRouteData } from '@/shells/dashboard/model/service-route.server';
import { ServiceEditPage } from '@/features/booking/components/dashboard/services/ServiceEditPage';

interface ServiceEditRouteProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ created?: string }>;
}

export default async function ServiceEditRoute({
  params,
  searchParams,
}: ServiceEditRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { created } = await searchParams;
  const token = await getAccessToken();
  const { service, intakeSchema } = await loadServiceEditRouteData(token, id);

  return (
    <ServiceEditPage
      service={service}
      intakeSchema={intakeSchema}
      showCreatedBanner={created === '1'}
    />
  );
}
