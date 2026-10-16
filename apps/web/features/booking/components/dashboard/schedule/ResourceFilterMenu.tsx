'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { ResourceResponse } from '@ikaro/types';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useSelectableResources } from '@/features/booking/schedule/useSelectableResources';
import { RESOURCE_FILTER_MAX_SELECTED } from '@/features/booking/schedule/schedule-page-interaction-handlers';
import { FilterCheckboxOption } from '../FilterCheckboxOption';
import { FloatingFilterMenu } from '../FloatingFilterMenu';

interface ResourceOptionsListProps {
  readonly isLoading: boolean;
  readonly resources: readonly ResourceResponse[];
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly onToggleResource: (resourceId: string) => void;
  readonly loadingLabel: string;
  readonly emptyLabel: string;
}

// Extracted from ResourceFilterMenu below to avoid a nested ternary (loading vs. empty vs.
// populated) inside JSX — SonarCloud S3358.
function ResourceOptionsList({
  isLoading,
  resources,
  selectedResourceIdSet,
  onToggleResource,
  loadingLabel,
  emptyLabel,
}: ResourceOptionsListProps): React.JSX.Element {
  if (isLoading) {
    return <p className="px-2 py-2 text-sm text-gray-500">{loadingLabel}</p>;
  }
  if (resources.length === 0) {
    return (
      <p data-testid="resource-filter-empty" className="px-2 py-2 text-sm text-gray-500">
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      {resources.map((resource) => {
        const isChecked = selectedResourceIdSet.has(resource.id);
        return (
          <FilterCheckboxOption
            key={resource.id}
            label={resource.name}
            checked={isChecked}
            disabled={!isChecked && selectedResourceIdSet.size >= RESOURCE_FILTER_MAX_SELECTED}
            onChange={() => onToggleResource(resource.id)}
          />
        );
      })}
    </>
  );
}

interface ResourceFilterMenuProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly open: boolean;
  readonly onToggleOpen: () => void;
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly onToggleResource: (resourceId: string) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}

// MANAGER-only floating filter (M21 Cluster 1) — the same FloatingFilterMenu shell as
// ScheduleStatusFilterMenu, stacked just above it so both can be open independently.
// Checking zero resources means the tenant-wide default (today's exact behavior, unchanged);
// checking one or more shows those resources' own closures/openings in addition to the
// tenant-wide ones, which always apply regardless of what's checked here.
export function ResourceFilterMenu({
  containerRef,
  open,
  onToggleOpen,
  selectedResourceIdSet,
  onToggleResource,
  onReset,
  onClose,
}: ResourceFilterMenuProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const { resources, isLoading, isError, error } = useSelectableResources();

  return (
    <FloatingFilterMenu
      containerRef={containerRef}
      open={open}
      onToggleOpen={onToggleOpen}
      onReset={onReset}
      onClose={onClose}
      triggerLabel={t('resourceFilterTrigger')}
      title={t('resourceFilterMenuTitle')}
      description={t('resourceFilterMenuDescription')}
      resetLabel={t('resourceFilterReset')}
      doneLabel={t('resourceFilterDone')}
    >
      {isError ? (
        <p
          data-testid="resource-filter-error"
          className="px-4 py-3 text-sm text-red-600 border-y border-gray-100"
        >
          {resolveErrorMessageFromApiError(error, locale)}
        </p>
      ) : (
        <>
          <div
            data-testid="resource-filter-options"
            className="max-h-72 overflow-y-auto border-y border-gray-100 px-2 py-2"
          >
            <ResourceOptionsList
              isLoading={isLoading}
              resources={resources}
              selectedResourceIdSet={selectedResourceIdSet}
              onToggleResource={onToggleResource}
              loadingLabel={commonT('loading')}
              emptyLabel={t('resourceFilterEmpty')}
            />
          </div>
          {selectedResourceIdSet.size >= RESOURCE_FILTER_MAX_SELECTED ? (
            <p
              data-testid="resource-filter-max-reached"
              className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500"
            >
              {t('resourceFilterMaxReached', { max: RESOURCE_FILTER_MAX_SELECTED })}
            </p>
          ) : null}
        </>
      )}
    </FloatingFilterMenu>
  );
}
