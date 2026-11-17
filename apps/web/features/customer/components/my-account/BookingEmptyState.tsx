'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { Button } from '@/shared/components/ui/button';
import { useCustomerCapabilities } from '../customer-tenant-access-context';

interface BookingEmptyStateProps {
  readonly tenantSlug: string;
}

// While the tenant is suspended (UC-121) the text stays and the booking action does not.
export function BookingEmptyState({ tenantSlug }: BookingEmptyStateProps): React.JSX.Element {
  const t = useTranslations('customer.emptyState');
  const { canStartBooking } = useCustomerCapabilities();

  return (
    <EmptyState
      icon={<CalendarDays className="h-10 w-10 text-gray-300" aria-hidden="true" />}
      title={t('title')}
      body={t('body')}
      action={
        canStartBooking ? (
          <Button asChild className="mt-5">
            <Link href={`/${tenantSlug}/booking`}>{t('cta')}</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
