'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/shared/components/ui/card';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import type { BookingWindowFacts } from '../../hooks/useDescribeBookingWindow';
import { OutcomePage } from './OutcomePage';
import { RescheduleBookingFacts } from './RescheduleBookingFacts';

interface RescheduleSuccessViewProps {
  readonly serviceNames: string;
  readonly when: BookingWindowFacts;
  readonly before: BookingWindowFacts;
  readonly durationMins: number;
  readonly price: number;
  readonly bookingHref: string;
  readonly bookingsHref: string;
}

function renderStrong(chunks: React.ReactNode): React.JSX.Element {
  return <strong>{chunks}</strong>;
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
    <OutcomePage
      message={
        <FeedbackMessage variant="success" title={t('successTitle')} testId="reschedule-success">
          {t.rich('successBody', { strong: renderStrong })}
        </FeedbackMessage>
      }
      primary={{ label: t('viewBookingCta'), href: bookingHref }}
      secondary={{ label: t('myBookingsCta'), href: bookingsHref }}
    >
      <Card className="rounded-xl border-gray-100 p-4 shadow-none">
        <p className="mb-2 text-sm font-semibold text-gray-900">{t('successSectionLabel')}</p>
        <RescheduleBookingFacts
          bare
          serviceNames={serviceNames}
          when={when}
          before={before}
          durationMins={durationMins}
          price={price}
        />
      </Card>
    </OutcomePage>
  );
}
