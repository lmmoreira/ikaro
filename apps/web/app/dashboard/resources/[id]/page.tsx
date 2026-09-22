import { ResourceEditForm } from '@/features/booking/components/dashboard/resources/ResourceEditForm';

interface ResourceEditRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ResourceEditRoute({
  params,
}: ResourceEditRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return <ResourceEditForm resourceId={id} />;
}
