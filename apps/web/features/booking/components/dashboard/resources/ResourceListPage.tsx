'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import type { ResourceResponse, ResourceType } from '@ikaro/types';
import { useResources } from '@/features/booking/hooks/useResources';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/utils/cn';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

type ResourceFilter = 'all' | 'STAFF' | 'ROOM' | 'EQUIPMENT';

const TYPE_ORDER: Record<ResourceType, number> = { LOCATION: 0, STAFF: 1, ROOM: 2, EQUIPMENT: 3 };

const TYPE_BADGE_CLASSES: Record<ResourceType, string> = {
  LOCATION: 'bg-sky-50 text-sky-700',
  STAFF: 'bg-blue-50 text-blue-700',
  ROOM: 'bg-purple-50 text-purple-700',
  EQUIPMENT: 'bg-pink-50 text-pink-700',
};

const TYPE_LABEL_KEYS: Record<ResourceType, string> = {
  LOCATION: 'typeLocation',
  STAFF: 'typeStaff',
  ROOM: 'typeRoom',
  EQUIPMENT: 'typeEquipment',
};

const FILTERS: readonly { key: ResourceFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'STAFF', labelKey: 'tabStaff' },
  { key: 'ROOM', labelKey: 'tabRoom' },
  { key: 'EQUIPMENT', labelKey: 'tabEquipment' },
];

function buildFilterClass(active: boolean): string {
  return cn(
    'rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors',
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-border bg-white text-gray-900 hover:bg-slate-50',
  );
}

function workingHoursSummary(resource: ResourceResponse, inheritsLabel: string): string {
  if (!resource.workingHours) return inheritsLabel;
  const openDays = Object.values(resource.workingHours).filter(Boolean).length;
  return `${openDays}/7`;
}

function ResourceRow({ resource }: { readonly resource: ResourceResponse }): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');

  return (
    <div className="relative flex flex-wrap items-center gap-3 px-4 py-3.5">
      <Link
        href={`/dashboard/resources/${resource.id}`}
        className="absolute inset-0 z-10"
        aria-label={t('viewDetailsAriaLabel', { name: resource.name })}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{resource.name}</p>
        <p className="truncate text-sm text-gray-500">
          {workingHoursSummary(resource, t('inheritsTenantHours'))}
        </p>
      </div>
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          TYPE_BADGE_CLASSES[resource.type],
        )}
      >
        {t(TYPE_LABEL_KEYS[resource.type])}
      </span>
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          resource.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
        )}
      >
        {resource.isActive ? t('statusActive') : t('statusInactive')}
      </span>
      {resource.isActive && resource.type !== 'LOCATION' && (
        <Link
          href={`/dashboard/resources/${resource.id}/deactivate`}
          className="relative z-20 text-sm font-semibold text-red-600 hover:underline"
        >
          {t('deactivate')}
        </Link>
      )}
      {!resource.isActive && (
        <Link
          href={`/dashboard/resources/${resource.id}/deactivate`}
          className="relative z-20 text-sm font-semibold text-blue-600 hover:underline"
        >
          {t('activate')}
        </Link>
      )}
    </div>
  );
}

export function ResourceListPage(): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const { data, isLoading, isError, error } = useResources();
  const [filter, setFilter] = useState<ResourceFilter>('all');

  const resources = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]),
    [data],
  );

  const counts = useMemo(
    () => ({
      all: resources.length,
      STAFF: resources.filter((r) => r.type === 'STAFF').length,
      ROOM: resources.filter((r) => r.type === 'ROOM').length,
      EQUIPMENT: resources.filter((r) => r.type === 'EQUIPMENT').length,
    }),
    [resources],
  );

  const filteredResources = useMemo(
    () => (filter === 'all' ? resources : resources.filter((r) => r.type === filter)),
    [filter, resources],
  );

  let cardContent: React.JSX.Element;
  if (isLoading) {
    cardContent = (
      <div className="px-4 py-10 text-center text-sm text-gray-500">{commonT('loading')}</div>
    );
  } else if (isError) {
    cardContent = (
      <div
        data-testid="resource-list-error"
        className="px-4 py-10 text-center text-sm text-red-600"
      >
        {resolveErrorMessageFromApiError(error, locale)}
      </div>
    );
  } else if (filteredResources.length > 0) {
    cardContent = (
      <div className="divide-y divide-border">
        {filteredResources.map((resource) => (
          <ResourceRow key={resource.id} resource={resource} />
        ))}
      </div>
    );
  } else {
    cardContent = <div className="px-4 py-10 text-center text-sm text-gray-500">{t('empty')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-1">
        {FILTERS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            className={buildFilterClass(filter === key)}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {t(labelKey, { count: counts[key] })}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">{cardContent}</Card>

      <Button
        asChild
        size="icon"
        className="fixed bottom-20 right-6 z-20 h-14 w-14 rounded-full shadow-lg shadow-blue-600/35 lg:hidden"
      >
        <Link href="/dashboard/resources/new" aria-label={t('create')}>
          <Plus className="h-6 w-6" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
