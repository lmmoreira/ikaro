'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';
import type { StaffServiceResponse } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cn } from '@/shared/utils/cn';

interface ServiceCardProps {
  readonly service: StaffServiceResponse;
}

export function ServiceCard({ service }: ServiceCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const { formatMoney } = useFormatting();
  const isActive = service.isActive;

  return (
    <Link
      href={`/dashboard/services/${service.serviceId}/edit`}
      className={cn(
        'flex items-start gap-4 px-4 py-4 text-left text-gray-900 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200',
        !isActive && 'opacity-[0.55]',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
          isActive ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400',
        )}
        aria-hidden="true"
      >
        <Wrench className="h-[1.125rem] w-[1.125rem]" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[0.9375rem] font-bold text-gray-900">{service.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-gray-600">
          <span>{formatDuration(service.durationMinutes)}</span>
          {service.requiresPickupAddress && (
            <Badge
              variant="outline"
              className="border-violet-200 bg-violet-50 text-violet-700 shadow-none"
            >
              {t('pickupBadge')}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-800 shadow-none"
          >
            {t('pointsBadge', { count: service.loyaltyPointsValue })}
          </Badge>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[0.9375rem] font-bold text-gray-900">
          {formatMoney(service.price.amount)}
        </span>
        <Badge
          variant="outline"
          className={cn(
            'border-0 shadow-none',
            isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600',
          )}
        >
          {isActive ? t('statusActive') : t('statusInactive')}
        </Badge>
      </div>
    </Link>
  );
}
