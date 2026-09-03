import { ResourceDeactivatePage } from '@/features/booking/components/dashboard/resources/ResourceDeactivatePage';

interface ResourceDeactivateRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ResourceDeactivateRoute({
  params,
}: ResourceDeactivateRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return <ResourceDeactivatePage resourceId={id} />;
}
