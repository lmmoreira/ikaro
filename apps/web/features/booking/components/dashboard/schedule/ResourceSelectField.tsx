'use client';

import { useTranslations } from 'next-intl';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useSelectableResources } from '@/features/booking/schedule/useSelectableResources';

const ALL_BUSINESS_VALUE = '';

interface ResourceSelectFieldProps {
  readonly value: string | null;
  readonly onValueChange: (resourceId: string | null) => void;
}

// MANAGER-only field inside ClosureFormSheet/OpeningFormSheet (M21 Cluster 1) — decides which
// single resource the closure/opening being created applies to. Decoupled from
// ResourceFilterMenu's own multi-select view filter: viewing several resources' calendars at
// once doesn't imply a new block should apply to several at once (resourceId is a single nullable
// field on ScheduleClosure/ScheduleOpening, not a list), so this is a separate, always-single
// choice, defaulting fresh to the tenant-wide option every time the sheet opens.
export function ResourceSelectField({
  value,
  onValueChange,
}: ResourceSelectFieldProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const { resources, isLoading, isError, error } = useSelectableResources();

  return (
    <div className="space-y-1">
      <label className="block space-y-2">
        <span className="block text-sm font-medium text-gray-700">{t('resourcePickerLabel')}</span>
        <select
          data-testid="resource-select-field"
          value={value ?? ALL_BUSINESS_VALUE}
          onChange={(event) => onValueChange(event.target.value || null)}
          disabled={isLoading || isError}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
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
        <p data-testid="resource-select-field-error" className="text-sm text-red-600">
          {resolveErrorMessageFromApiError(error, locale)}
        </p>
      )}
    </div>
  );
}
