'use client';

import type { BookingLineResourceEntry } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Badge } from '@/shared/components/ui/badge';
import { BookingDetailRow, BookingDetailSection } from './BookingDetailSection';

interface BookingResourcesCardProps {
  readonly resources: readonly BookingLineResourceEntry[];
}

// One row per resource of the booking, labelled by resource type: the name and who picked it, or
// for a fungible pool just the reserved quantity (the pool never says which unit). Present for
// every status, a cancelled booking included, because it reads the durable assignment record.
export function BookingResourcesCard({
  resources,
}: BookingResourcesCardProps): React.JSX.Element | null {
  const t = useTranslations('booking.detailCards');
  if (resources.length === 0) return null;

  return (
    <BookingDetailSection
      title={t('resourcesTitle')}
      testId="booking-resources-card"
      note={t('resourcesNote')}
    >
      {resources.map((entry, index) => (
        <BookingDetailRow
          key={`${entry.lineId}-${entry.resourceType}-${index}`}
          label={t(`resourceType.${entry.resourceType}`)}
          hint={
            entry.resourceName === null && entry.quantity !== null
              ? t('poolQuantity', { count: entry.quantity })
              : undefined
          }
        >
          {entry.resourceName ?? t('poolLabel')}
          {entry.origin !== null && (
            <Badge className="ml-2 border-0 bg-gray-100 text-[0.6875rem] font-semibold text-gray-600">
              {entry.origin === 'CUSTOMER_CHOICE' ? t('originChosen') : t('originAssigned')}
            </Badge>
          )}
        </BookingDetailRow>
      ))}
    </BookingDetailSection>
  );
}
