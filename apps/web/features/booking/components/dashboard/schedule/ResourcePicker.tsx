'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useResources } from '@/features/booking/hooks/useResources';

const ALL_BUSINESS_VALUE = '';

interface ResourcePickerProps {
  readonly value: string | null;
  readonly onValueChange: (resourceId: string | null) => void;
}

// MANAGER-only selector at the top of SchedulePage (M21 Cluster 1) — lets a manager re-scope the
// calendar and closure/opening actions to one resource instead of the whole tenant. Excludes the
// tenant's own LOCATION resource: `resourceId = null` ("Todo o negócio") already represents that
// scope, so listing LOCATION separately would be a redundant, confusing duplicate option.
export function ResourcePicker({ value, onValueChange }: ResourcePickerProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const { data } = useResources({ isActive: true });
  const resources = useMemo(
    () => (data?.items ?? []).filter((resource) => resource.type !== 'LOCATION'),
    [data],
  );

  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-gray-700">{t('resourcePickerLabel')}</span>
      <select
        data-testid="resource-picker"
        value={value ?? ALL_BUSINESS_VALUE}
        onChange={(event) => onValueChange(event.target.value || null)}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 sm:w-64"
      >
        <option value={ALL_BUSINESS_VALUE}>{t('resourcePickerAllBusiness')}</option>
        {resources.map((resource) => (
          <option key={resource.id} value={resource.id}>
            {resource.name}
          </option>
        ))}
      </select>
    </label>
  );
}
