'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { Button } from '@/shared/components/ui/button';

interface BookingEmptyStateProps {
  readonly tenantSlug: string;
  /** `false` while the tenant is suspended (UC-121): the text stays, the booking action does not. */
  readonly tenantOperational?: boolean;
}

export function BookingEmptyState({
  tenantSlug,
  tenantOperational = true,
}: BookingEmptyStateProps): React.JSX.Element {
  const t = useTranslations('customer.emptyState');

  return (
    <EmptyState
      icon={<CalendarDays className="h-10 w-10 text-gray-300" aria-hidden="true" />}
      title={t('title')}
      body={t('body')}
      action={
        tenantOperational ? (
          <Button asChild className="mt-5">
            <Link href={`/${tenantSlug}/booking`}>{t('cta')}</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
