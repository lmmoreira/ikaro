'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { StaffServiceResponse } from '@ikaro/types';
import { FloatingCreateButton } from '@/shared/components/ui/floating-create-button';
import { Card } from '@/shared/components/ui/card';
import { FilterChip } from '@/shared/components/ui/filter-chip';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { ServiceCard } from './ServiceCard';

type ServiceFilter = 'all' | 'active' | 'inactive';

interface ServiceListPageProps {
  readonly services: readonly StaffServiceResponse[];
  // The server page could not fetch the services: shown instead of a misleading empty list.
  readonly loadFailed?: boolean;
}

export function ServiceListPage({
  services,
  loadFailed = false,
}: ServiceListPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const router = useRouter();
  const [filter, setFilter] = useState<ServiceFilter>('all');

  const counts = useMemo(
    () => ({
      all: services.length,
      active: services.filter((service) => service.isActive).length,
      inactive: services.filter((service) => !service.isActive).length,
    }),
    [services],
  );

  const filteredServices = useMemo(() => {
    if (filter === 'active') return services.filter((service) => service.isActive);
    if (filter === 'inactive') return services.filter((service) => !service.isActive);
    return services;
  }, [filter, services]);

  let emptyMessage = t('emptyAll');
  if (filter === 'active') {
    emptyMessage = t('emptyActive');
  } else if (filter === 'inactive') {
    emptyMessage = t('emptyInactive');
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {loadFailed ? (
          <div className="p-4">
            <FeedbackMessage
              title={t('listLoadFailedTitle')}
              onRetry={() => router.refresh()}
              retryLabel={t('loadRetry')}
              testId="page-feedback"
            >
              {t('listLoadFailedBody')}
            </FeedbackMessage>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3.5">
              <FilterChip selected={filter === 'all'} onClick={() => setFilter('all')}>
                {t('tabAll', { count: counts.all })}
              </FilterChip>
              <FilterChip selected={filter === 'active'} onClick={() => setFilter('active')}>
                {t('tabActive', { count: counts.active })}
              </FilterChip>
              <FilterChip selected={filter === 'inactive'} onClick={() => setFilter('inactive')}>
                {t('tabInactive', { count: counts.inactive })}
              </FilterChip>
            </div>

            {filteredServices.length > 0 ? (
              <div className="divide-y divide-border">
                {filteredServices.map((service) => (
                  <ServiceCard key={service.serviceId} service={service} />
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-gray-500">{emptyMessage}</div>
            )}
          </>
        )}
      </Card>

      <FloatingCreateButton href="/dashboard/services/new" label={t('create')} />
    </div>
  );
}
