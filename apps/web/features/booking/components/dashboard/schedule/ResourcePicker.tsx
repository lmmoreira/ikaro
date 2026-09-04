'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useResources } from '@/features/booking/hooks/useResources';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

const ALL_BUSINESS_VALUE = '';

interface ResourcePickerProps {
  readonly value: string | null;
  readonly onValueChange: (resourceId: string | null) => void;
}

// MANAGER-only selector at the top of SchedulePage (M21 Cluster 1) — lets a manager re-scope the
// calendar and closure/opening actions to one resource instead of the whole tenant. Excludes the
// tenant's own LOCATION resource: the tenant-wide default (resourceId = null) already represents
// that scope, so listing LOCATION separately would be a redundant, confusing duplicate option.
export function ResourcePicker({ value, onValueChange }: ResourcePickerProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const { data, isLoading, isError, error } = useResources({ isActive: true });
  const resources = useMemo(
    () => (data?.items ?? []).filter((resource) => resource.type !== 'LOCATION'),
    [data],
  );

  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="block text-sm font-medium text-gray-700">{t('resourcePickerLabel')}</span>
        <select
          data-testid="resource-picker"
          value={value ?? ALL_BUSINESS_VALUE}
          onChange={(event) => onValueChange(event.target.value || null)}
          disabled={isLoading || isError}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-64"
        >
          <option value={ALL_BUSINESS_VALUE}>
            {isLoading ? commonT('loading') : t('resourcePickerAllBusiness')}
          </option>
          {resources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.name}
            </option>
          ))}
        </select>
      </label>
      {isError && (
        <p data-testid="resource-picker-error" className="text-sm text-red-600">
          {resolveErrorMessageFromApiError(error, locale)}
        </p>
      )}
    </div>
  );
}
