'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ResourceResponse, ResourceType } from '@ikaro/types';
import { useReactivateResource } from '@/features/booking/hooks/useResources';
import { cn } from '@/shared/utils/cn';

export const TYPE_BADGE_CLASSES: Record<ResourceType, string> = {
  LOCATION: 'bg-sky-50 text-sky-700',
  STAFF: 'bg-blue-50 text-blue-700',
  ROOM: 'bg-purple-50 text-purple-700',
  EQUIPMENT: 'bg-pink-50 text-pink-700',
};

export const TYPE_LABEL_KEYS: Record<ResourceType, string> = {
  LOCATION: 'typeLocation',
  STAFF: 'typeStaff',
  ROOM: 'typeRoom',
  EQUIPMENT: 'typeEquipment',
};

function workingHoursSummary(resource: ResourceResponse, inheritsLabel: string): string {
  if (!resource.workingHours) return inheritsLabel;
  const openDays = Object.values(resource.workingHours).filter(Boolean).length;
  return `${openDays}/7`;
}

// One-click row action, no confirmation screen — mirrors MemberRow.tsx's ActivateMemberAction
// (TeamListPage's own established precedent for reactivation, which likewise has no dedicated
// screen). Deactivation keeps its confirmation screen; only reactivation is inline.
function ReactivateResourceAction({
  resource,
}: {
  readonly resource: ResourceResponse;
}): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const reactivateResourceMutation = useReactivateResource();
  const [reactivateState, setReactivateState] = useState<'idle' | 'success' | 'error'>('idle');

  async function handleReactivate(): Promise<void> {
    setReactivateState('idle');
    try {
      await reactivateResourceMutation.mutateAsync(resource.id);
      setReactivateState('success');
    } catch {
      setReactivateState('error');
    }
  }

  return (
    <div className="relative z-20 flex items-center gap-2">
      <button
        type="button"
        data-testid="resource-row-reactivate-button"
        onClick={() => void handleReactivate()}
        disabled={reactivateResourceMutation.isPending || reactivateState === 'success'}
        className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
      >
        {reactivateResourceMutation.isPending ? t('activating') : t('activate')}
      </button>
      {reactivateState === 'success' && (
        <span
          data-testid="resource-row-reactivate-success"
          className="text-xs font-semibold text-emerald-600"
        >
          {t('activateSuccess')}
        </span>
      )}
      {reactivateState === 'error' && (
        <span
          data-testid="resource-row-reactivate-error"
          className="text-xs font-semibold text-red-600"
        >
          {t('activateError')}
        </span>
      )}
    </div>
  );
}

export function ResourceRow({
  resource,
}: {
  readonly resource: ResourceResponse;
}): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');

  return (
    <div className="relative flex flex-wrap items-center gap-3 px-4 py-3.5">
      <Link
        href={`/dashboard/resources/${resource.id}`}
        data-testid="resource-row-edit-link"
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
          data-testid="resource-row-deactivate-link"
          className="relative z-20 text-sm font-semibold text-red-600 hover:underline"
        >
          {t('deactivate')}
        </Link>
      )}
      {!resource.isActive && <ReactivateResourceAction resource={resource} />}
    </div>
  );
}
