'use client';

import { useResource } from '@/features/booking/hooks/useResources';
import { ResourceDeactivateConfirm } from './ResourceDeactivateConfirm';
import { ResourceReactivateConfirm } from './ResourceReactivateConfirm';

interface ResourceDeactivateOrReactivateProps {
  readonly resourceId: string;
}

// One route (/dashboard/resources/:id/deactivate) serves both directions — a manager lands
// here from either the list's "Desativar" or "Reativar" row action, and this component picks
// the right confirmation screen from the resource's current state.
export function ResourceDeactivateOrReactivate({
  resourceId,
}: ResourceDeactivateOrReactivateProps): React.JSX.Element {
  const { data: resource, isLoading } = useResource(resourceId);

  if (isLoading || !resource) {
    return <div className="px-4 py-10 text-center text-sm text-gray-500">…</div>;
  }

  return resource.isActive ? (
    <ResourceDeactivateConfirm resource={resource} />
  ) : (
    <ResourceReactivateConfirm resource={resource} />
  );
}
