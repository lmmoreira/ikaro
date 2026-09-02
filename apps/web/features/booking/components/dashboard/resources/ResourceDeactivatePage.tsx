'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useResource } from '@/features/booking/hooks/useResources';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { ResourceDeactivateConfirm } from './ResourceDeactivateConfirm';

interface ResourceDeactivatePageProps {
  readonly resourceId: string;
}

// Reactivation has no dedicated screen — it's a one-click row action directly on
// ResourceListPage (mirrors TeamListPage/MemberRow's own established precedent). This route
// only ever serves an active resource; redirect away if reached for one that's already
// inactive (e.g. a stale bookmark, or a race with another tab's own reactivate).
export function ResourceDeactivatePage({
  resourceId,
}: ResourceDeactivatePageProps): React.JSX.Element {
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const router = useRouter();
  const { data: resource, isLoading, isError, error } = useResource(resourceId);

  useEffect(() => {
    if (resource && !resource.isActive) router.replace('/dashboard/resources');
  }, [resource, router]);

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

  if (isLoading || !resource || !resource.isActive) {
    return <div className="px-4 py-10 text-center text-sm text-gray-500">{commonT('loading')}</div>;
  }

  return <ResourceDeactivateConfirm resource={resource} />;
}
