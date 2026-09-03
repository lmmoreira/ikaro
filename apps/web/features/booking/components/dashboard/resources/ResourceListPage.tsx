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
import { ResourceRow, TYPE_LABEL_KEYS } from './ResourceRow';

type ResourceFilter = 'all' | 'LOCATION' | 'STAFF' | 'ROOM' | 'EQUIPMENT';
type StatusFilter = 'all' | 'active' | 'inactive';

const TYPE_ORDER: Record<ResourceType, number> = { LOCATION: 0, STAFF: 1, ROOM: 2, EQUIPMENT: 3 };

// UC-044 lists LOCATION among the filterable types (docs/04-USE_CASES.md) — included here even
// though a tenant only ever has exactly one, since it's still a valid, literal filter value the
// backend contract accepts (GET /resources?type=LOCATION).
const FILTERS: readonly { key: ResourceFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'LOCATION', labelKey: 'tabLocation' },
  { key: 'STAFF', labelKey: 'tabStaff' },
  { key: 'ROOM', labelKey: 'tabRoom' },
  { key: 'EQUIPMENT', labelKey: 'tabEquipment' },
];

// UC-044's main flow requires the list to be filterable by both type and isActive
// (docs/04-USE_CASES.md) — a second, independent filter row, same shape as the type tabs
// above. Mirrors TeamListPage's own active/inactive tab labels (tabActive/tabInactive).
const STATUS_FILTERS: readonly { key: StatusFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'active', labelKey: 'tabActive' },
  { key: 'inactive', labelKey: 'tabInactive' },
];

function buildFilterClass(active: boolean): string {
  return cn(
    'rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors',
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-border bg-white text-gray-900 hover:bg-slate-50',
  );
}

interface ResourceTypeGroup {
  readonly type: ResourceType;
  readonly items: ResourceResponse[];
}

// filteredResources is already sorted by TYPE_ORDER, so consecutive same-type rows are always
// adjacent — a single pass groups them without a second sort.
function groupResourcesByType(
  resources: readonly ResourceResponse[],
): readonly ResourceTypeGroup[] {
  const groups: ResourceTypeGroup[] = [];
  for (const resource of resources) {
    const lastGroup = groups.at(-1);
    if (lastGroup?.type === resource.type) {
      lastGroup.items.push(resource);
    } else {
      groups.push({ type: resource.type, items: [resource] });
    }
  }
  return groups;
}

export function ResourceListPage(): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const { data, isLoading, isError, error } = useResources();
  const [filter, setFilter] = useState<ResourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const resources = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]),
    [data],
  );

  const counts = useMemo(
    () => ({
      all: resources.length,
      LOCATION: resources.filter((r) => r.type === 'LOCATION').length,
      STAFF: resources.filter((r) => r.type === 'STAFF').length,
      ROOM: resources.filter((r) => r.type === 'ROOM').length,
      EQUIPMENT: resources.filter((r) => r.type === 'EQUIPMENT').length,
    }),
    [resources],
  );

  const statusCounts = useMemo(
    () => ({
      all: resources.length,
      active: resources.filter((r) => r.isActive).length,
      inactive: resources.filter((r) => !r.isActive).length,
    }),
    [resources],
  );

  const filteredResources = useMemo(
    () =>
      resources
        .filter((r) => filter === 'all' || r.type === filter)
        .filter(
          (r) => statusFilter === 'all' || (statusFilter === 'active' ? r.isActive : !r.isActive),
        ),
    [filter, statusFilter, resources],
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
    const groups = groupResourcesByType(filteredResources);
    cardContent = (
      <div>
        {groups.map((group) => (
          <div key={group.type}>
            <p
              data-testid="resource-type-group-heading"
              className="border-b border-border bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-500"
            >
              {t(TYPE_LABEL_KEYS[group.type])}
            </p>
            <div className="divide-y divide-border">
              {group.items.map((resource) => (
                <ResourceRow key={resource.id} resource={resource} />
              ))}
            </div>
          </div>
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

      <div
        data-testid="resource-status-filters"
        className="flex flex-wrap items-center gap-2 px-4 pb-1"
      >
        {STATUS_FILTERS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            className={buildFilterClass(statusFilter === key)}
            aria-pressed={statusFilter === key}
            onClick={() => setStatusFilter(key)}
          >
            {t(labelKey, { count: statusCounts[key] })}
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
