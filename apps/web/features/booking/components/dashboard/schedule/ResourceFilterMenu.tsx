'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { ResourceResponse } from '@ikaro/types';
import { ChevronDown, Filter } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/cn';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useSelectableResources } from '@/features/booking/schedule/useSelectableResources';

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
      {resources.map((resource) => (
        <label
          key={resource.id}
          className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50"
        >
          <input
            type="checkbox"
            checked={selectedResourceIdSet.has(resource.id)}
            onChange={() => onToggleResource(resource.id)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">{resource.name}</span>
        </label>
      ))}
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

// MANAGER-only floating filter (M21 Cluster 1) — mirrors ScheduleStatusFilterMenu's own
// trigger+popover shape exactly, stacked just above it so both can be open independently.
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
    <div
      ref={containerRef}
      className="fixed bottom-44 right-4 z-30 w-fit max-w-[calc(100vw-2rem)] lg:bottom-24 lg:right-6"
    >
      <Button
        type="button"
        aria-label={t('resourceFilterTrigger')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggleOpen}
        className="h-auto w-fit justify-between rounded-full border border-blue-500/20 bg-blue-600 px-3 py-2.5 text-left text-white shadow-lg hover:bg-blue-600/90"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Filter className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-semibold leading-tight">
            {t('resourceFilterTrigger')}
          </span>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </Button>

      {open ? (
        <div className="absolute bottom-full right-0 mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{t('resourceFilterMenuTitle')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('resourceFilterMenuDescription')}</p>
          </div>
          {isError ? (
            <p
              data-testid="resource-filter-error"
              className="px-4 py-3 text-sm text-red-600 border-y border-gray-100"
            >
              {resolveErrorMessageFromApiError(error, locale)}
            </p>
          ) : (
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
          )}
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              {t('resourceFilterReset')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('resourceFilterDone')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
