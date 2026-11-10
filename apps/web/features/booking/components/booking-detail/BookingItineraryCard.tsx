'use client';

import type { BookingItineraryLeg } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { LabeledSection } from '@/shared/components/ui/labeled-section';
import { groupItineraryByLeg } from '../../model/group-itinerary-by-leg';

interface BookingItineraryCardProps {
  readonly itinerary: readonly BookingItineraryLeg[];
}

// A legged service's legs in order: one numbered step per leg, with the leg's name and time once and
// every resource that fulfils it beneath. The time of a leg shows only while its resource
// reservations still exist; a cancelled booking (or one past the retention window) shows the order
// and the resources without it.
export function BookingItineraryCard({
  itinerary,
}: BookingItineraryCardProps): React.JSX.Element | null {
  const t = useTranslations('booking.detailCards');
  const { formatTime } = useFormatting();
  const steps = groupItineraryByLeg(itinerary);
  if (steps.length === 0) return null;

  // A basket of several services needs the service named on each step; a single one does not.
  const showService = new Set(steps.map((step) => step.serviceName)).size > 1;

  return (
    <LabeledSection title={t('itineraryTitle')} testId="booking-itinerary-card">
      <Card>
        <CardContent className="px-4 py-0">
          <ol className="divide-y divide-gray-100">
            {steps.map((step, index) => (
              <li
                key={step.key}
                data-testid="booking-itinerary-leg"
                className="flex items-start gap-3 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {[
                      showService ? step.serviceName : null,
                      step.legName ?? t('itineraryLegFallback', { number: index + 1 }),
                      step.startsAt !== null && step.endsAt !== null
                        ? t('itineraryTimeRange', {
                            start: formatTime(new Date(step.startsAt)),
                            end: formatTime(new Date(step.endsAt)),
                          })
                        : null,
                    ]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </p>
                  <p className="text-xs text-gray-500">{step.resourceNames.join(', ')}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <p className="mt-1.5 text-xs leading-5 text-gray-500">{t('itineraryNote')}</p>
    </LabeledSection>
  );
}
