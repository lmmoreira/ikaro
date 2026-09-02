import { ResourceDeactivateOrReactivate } from '@/features/booking/components/dashboard/resources/ResourceDeactivateOrReactivate';

interface ResourceDeactivateRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ResourceDeactivateRoute({
  params,
}: ResourceDeactivateRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return <ResourceDeactivateOrReactivate resourceId={id} />;
}
