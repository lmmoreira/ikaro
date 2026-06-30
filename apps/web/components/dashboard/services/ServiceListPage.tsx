'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { StaffServiceResponse } from '@ikaro/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ServiceCard } from './ServiceCard';

type ServiceFilter = 'all' | 'active' | 'inactive';

interface ServiceListPageProps {
  readonly services: readonly StaffServiceResponse[];
}

function buildFilterClass(active: boolean): string {
  return cn(
    'rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors',
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-border bg-white text-gray-900 hover:bg-slate-50',
  );
}

export function ServiceListPage({ services }: ServiceListPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
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

  const emptyMessage =
    filter === 'active'
      ? t('emptyActive')
      : filter === 'inactive'
        ? t('emptyInactive')
        : t('emptyAll');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 px-4 pb-1">
        <button
          type="button"
          className={buildFilterClass(filter === 'all')}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          {t('tabAll', { count: counts.all })}
        </button>
        <button
          type="button"
          className={buildFilterClass(filter === 'active')}
          aria-pressed={filter === 'active'}
          onClick={() => setFilter('active')}
        >
          {t('tabActive', { count: counts.active })}
        </button>
        <button
          type="button"
          className={buildFilterClass(filter === 'inactive')}
          aria-pressed={filter === 'inactive'}
          onClick={() => setFilter('inactive')}
        >
          {t('tabInactive', { count: counts.inactive })}
        </button>
      </div>

      <Card className="overflow-hidden">
        {filteredServices.length > 0 ? (
          <div className="divide-y divide-border">
            {filteredServices.map((service) => (
              <ServiceCard key={service.serviceId} service={service} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-gray-500">{emptyMessage}</div>
        )}
      </Card>

      <Button
        asChild
        size="icon"
        className="fixed bottom-20 right-6 z-20 h-14 w-14 rounded-full text-3xl font-light shadow-lg shadow-blue-600/35 lg:hidden"
      >
        <Link href="/dashboard/services/new" aria-label={t('create')}>
          +
        </Link>
      </Button>
    </div>
  );
}
