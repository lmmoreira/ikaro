'use client';

import { useTranslations } from 'next-intl';
import { useResource } from '@/features/booking/hooks/useResources';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
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
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const { data: resource, isLoading, isError, error } = useResource(resourceId);

  if (isError) {
    return (
      <div
        data-testid="resource-deactivate-load-error"
        className="px-4 py-10 text-center text-sm text-red-600"
      >
        {resolveErrorMessageFromApiError(error, locale)}
      </div>
    );
  }

  if (isLoading || !resource) {
    return <div className="px-4 py-10 text-center text-sm text-gray-500">{commonT('loading')}</div>;
  }

  return resource.isActive ? (
    <ResourceDeactivateConfirm resource={resource} />
  ) : (
    <ResourceReactivateConfirm resource={resource} />
  );
}
