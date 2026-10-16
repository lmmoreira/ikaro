'use client';

import type { BookingItineraryLeg } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface BookingItineraryCardProps {
  readonly itinerary: readonly BookingItineraryLeg[];
}

// A legged service's legs in order, each with the resource that fulfils it. The time of a leg
// shows only while its resource reservation still exists; a cancelled booking (or one past the
// retention window) shows the order and the resource without it.
export function BookingItineraryCard({
  itinerary,
}: BookingItineraryCardProps): React.JSX.Element | null {
  const t = useTranslations('booking.detailCards');
  const { formatTime } = useFormatting();
  if (itinerary.length === 0) return null;

  return (
    <section data-testid="booking-itinerary-card">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('itineraryTitle')}
      </p>
      <Card>
        <CardContent className="px-4 py-0">
          <ol className="divide-y divide-gray-100">
            {itinerary.map((leg, index) => (
              <li
                key={`${leg.lineId}-${leg.legIndex}-${leg.resourceType}`}
                className="flex items-start gap-3 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{leg.resourceName}</p>
                  <p className="text-xs text-gray-500">
                    {[
                      leg.legName,
                      leg.startsAt !== null && leg.endsAt !== null
                        ? t('itineraryTimeRange', {
                            start: formatTime(new Date(leg.startsAt)),
                            end: formatTime(new Date(leg.endsAt)),
                          })
                        : null,
                    ]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <p className="mt-1.5 text-xs leading-5 text-gray-500">{t('itineraryNote')}</p>
    </section>
  );
}
