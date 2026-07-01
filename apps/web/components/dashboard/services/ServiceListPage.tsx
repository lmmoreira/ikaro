'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { StaffServiceResponse } from '@ikaro/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ServiceCard } from './ServiceCard';

type ServiceFilter = 'all' | 'active' | 'inactive';

interface ServiceListPageProps {
  readonly services: readonly StaffServiceResponse[];
  readonly showCreatedBanner?: boolean;
}

function buildFilterClass(active: boolean): string {
  return cn(
    'rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors',
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-border bg-white text-gray-900 hover:bg-slate-50',
  );
}

export function ServiceListPage({
  services,
  showCreatedBanner = false,
}: ServiceListPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const router = useRouter();
  const [filter, setFilter] = useState<ServiceFilter>('all');

  useEffect(() => {
    if (!showCreatedBanner) return;
    const timeoutId = window.setTimeout(() => {
      router.replace('/dashboard/services', { scroll: false });
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [router, showCreatedBanner]);

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
      {showCreatedBanner && (
        <div
          className="mx-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4"
          role="status"
        >
          <p className="text-[0.9375rem] font-bold text-emerald-800">{t('createdSuccessTitle')}</p>
          <p className="mt-1 text-sm text-emerald-700">{t('createdSuccessBody')}</p>
        </div>
      )}

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
