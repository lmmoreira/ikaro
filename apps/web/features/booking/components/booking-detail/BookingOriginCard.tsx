'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingDetailRow, BookingDetailSection } from './BookingDetailSection';

interface BookingOriginCardProps {
  // Staff only: when the booking was requested.
  readonly requestedAt?: string | null;
  // Where the recurring schedule behind this booking lives; null when the booking is not an
  // occurrence of one.
  readonly recurrenceHref?: string | null;
  // Staff only: set (with the creator's name, possibly null) for a booking staff made on the
  // customer's behalf; null for a booking the customer made.
  readonly createdBy?: { readonly name: string | null } | null;
}

export function BookingOriginCard({
  requestedAt = null,
  recurrenceHref = null,
  createdBy = null,
}: BookingOriginCardProps): React.JSX.Element | null {
  const t = useTranslations('booking.detailCards');
  const { formatDate, formatTime } = useFormatting();
  if (requestedAt === null && recurrenceHref === null && createdBy === null) return null;

  const requested = requestedAt === null ? null : new Date(requestedAt);

  return (
    <BookingDetailSection title={t('originTitle')} testId="booking-origin-card">
      {recurrenceHref !== null && (
        <BookingDetailRow label={t('recurrenceLabel')}>
          <Link href={recurrenceHref} className="text-blue-600 hover:underline">
            {t('recurrenceLink')}
          </Link>
        </BookingDetailRow>
      )}
      {createdBy !== null && (
        <BookingDetailRow label={t('createdByLabel')} hint={t('createdByNote')}>
          {createdBy.name ?? t('actorStaff')}
        </BookingDetailRow>
      )}
      {requested !== null && (
        <BookingDetailRow label={t('requestedAtLabel')}>
          {t('requestedAtValue', { date: formatDate(requested), time: formatTime(requested) })}
        </BookingDetailRow>
      )}
    </BookingDetailSection>
  );
}
