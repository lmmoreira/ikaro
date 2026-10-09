'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { filterBookableServices } from '@/features/booking/model/bookable-services';
import {
  parseBookingDeepLink,
  resolveBookingDeepLinkSeed,
} from '@/features/booking/model/booking-deep-link';
import { BookingForm, type BookingFormProps } from './BookingForm';

// Reading the query string makes everything up to the nearest Suspense boundary render on the
// client, so the booking page wraps this component alone in one and keeps the rest static.
export function BookingFormWithDeepLink(props: Omit<BookingFormProps, 'seed'>): React.JSX.Element {
  const searchParams = useSearchParams();
  const { services, maxBookingAdvanceDays, timezone } = props;
  const seed = useMemo(
    () =>
      resolveBookingDeepLinkSeed(
        parseBookingDeepLink(searchParams),
        filterBookableServices(services),
        {
          maxBookingAdvanceDays,
          timezone,
          now: new Date(),
        },
      ),
    [searchParams, services, maxBookingAdvanceDays, timezone],
  );

  return <BookingForm {...props} seed={seed} />;
}
