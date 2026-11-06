'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/shared/components/ui/empty-state';

interface BookingEmptyStateProps {
  readonly tenantSlug: string;
}

export function BookingEmptyState({ tenantSlug }: BookingEmptyStateProps): React.JSX.Element {
  const t = useTranslations('customer.emptyState');

  return (
    <EmptyState
      icon={<CalendarDays className="h-10 w-10 text-gray-300" aria-hidden="true" />}
      title={t('title')}
      body={t('body')}
      action={
        <Link
          href={`/${tenantSlug}/booking`}
          className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t('cta')}
        </Link>
      }
    />
  );
}
