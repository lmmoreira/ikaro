'use client';

import { useTranslations } from 'next-intl';
import type { BookingRescheduleKeptPick } from '@ikaro/types';
import { Card } from '@/shared/components/ui/card';

interface RescheduleKeptPicksProps {
  readonly keptPicks: readonly BookingRescheduleKeptPick[];
}

export function RescheduleKeptPicks({
  keptPicks,
}: RescheduleKeptPicksProps): React.JSX.Element | null {
  const t = useTranslations('customer.reschedule');
  const tBooking = useTranslations('booking');

  if (keptPicks.length === 0) return null;

  return (
    <Card
      className="rounded-xl border-gray-100 p-4 shadow-none"
      data-testid="reschedule-kept-picks"
    >
      <p className="mb-2 text-sm font-semibold text-gray-900">{t('keptSectionLabel')}</p>
      <div>
        {keptPicks.map((pick) => (
          <div
            key={`${pick.serviceName}-${pick.legIndex}-${pick.resourceType}-${pick.resourceName}`}
            className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-b-0"
          >
            <span className="text-gray-500">
              {t('keptPickLabel', {
                name: pick.legName ?? pick.serviceName,
                type: tBooking(`resourcePicker.sectionTitle.${pick.resourceType}`),
              })}
            </span>
            <span className="text-right font-medium text-gray-900">{pick.resourceName}</span>
          </div>
        ))}
        <p className="pt-2 text-xs leading-relaxed text-gray-500">{t('keptNote')}</p>
      </div>
    </Card>
  );
}
