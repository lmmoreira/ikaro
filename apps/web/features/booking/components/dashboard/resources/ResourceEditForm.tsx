'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useResource } from '@/features/booking/hooks/useResources';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { resolveApiErrorFeedback } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { ResourceEditFormFields } from './ResourceEditFormFields';

interface ResourceEditFormProps {
  readonly resourceId: string;
}

export function ResourceEditForm({ resourceId }: ResourceEditFormProps): React.JSX.Element {
  const dashboardT = useTranslations('dashboard');
  const t = useTranslations('dashboard.resourcesPage');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const { data: resource, isLoading, isError, error, refetch } = useResource(resourceId);
  const topbarStatus = useDashboardTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const setPageTitleOverride = topbarStatus?.setPageTitleOverride;

  useEffect(() => {
    setBackHrefOverride?.('/dashboard/resources');
    setBackLabelOverride?.(dashboardT('nav.resources'));
    setPageTitleOverride?.(resource?.name ?? null);

    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
      setPageTitleOverride?.(null);
    };
  }, [resource?.name, dashboardT, setBackHrefOverride, setBackLabelOverride, setPageTitleOverride]);

  if (isError) {
    return (
      <FeedbackMessage
        title={resolveApiErrorFeedback(error, locale).message}
        onRetry={() => void refetch()}
        retryLabel={t('loadRetry')}
        testId="resource-edit-load-error"
      />
    );
  }

  if (isLoading || !resource) {
    return <div className="px-4 py-10 text-center text-sm text-gray-500">{commonT('loading')}</div>;
  }

  // Keyed by resourceId so switching to a different resource remounts with fresh initial
  // form state, instead of syncing local state from a loaded resource via an effect
  // (react-hooks/set-state-in-effect — this codebase's own established pattern for
  // "initialize a form from once-loaded async data", matching every other detail-edit form).
  return <ResourceEditFormFields key={resourceId} resourceId={resourceId} resource={resource} />;
}
