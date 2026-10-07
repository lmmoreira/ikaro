'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RescheduleBookingFacts, type BookingWindowFacts } from './RescheduleBookingFacts';

interface RescheduleSuccessViewProps {
  readonly serviceNames: string;
  readonly when: BookingWindowFacts;
  readonly before: BookingWindowFacts;
  readonly durationMins: number;
  readonly price: number;
  readonly bookingHref: string;
  readonly bookingsHref: string;
}

export function RescheduleSuccessView({
  serviceNames,
  when,
  before,
  durationMins,
  price,
  bookingHref,
  bookingsHref,
}: RescheduleSuccessViewProps): React.JSX.Element {
  const t = useTranslations('customer.reschedule');

  return (
    <div className="flex w-full flex-col gap-4">
      <div
        role="status"
        data-testid="reschedule-success"
        className="rounded-xl border border-green-200 bg-green-50 p-4"
      >
        <p className="mb-2 text-base font-extrabold text-green-700">{t('successTitle')}</p>
        <p className="text-sm leading-relaxed text-green-900">
          {t.rich('successBody', { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      <div>
        <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
          {t('successSectionLabel')}
        </p>
        <RescheduleBookingFacts
          serviceNames={serviceNames}
          when={when}
          before={before}
          durationMins={durationMins}
          price={price}
        />
      </div>

      <Link
        href={bookingHref}
        className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
      >
        {t('viewBookingCta')}
      </Link>
      <Link
        href={bookingsHref}
        className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t('myBookingsCta')}
      </Link>
    </div>
  );
}
