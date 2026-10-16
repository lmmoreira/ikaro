'use client';

import { useTranslations } from 'next-intl';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingDetailRow, BookingDetailSection } from './BookingDetailSection';

interface BookingTerminationCardProps {
  readonly kind: 'cancellation' | 'rejection';
  readonly audience: 'staff' | 'customer';
  readonly at: string;
  readonly reason: string | null;
  // Already worded for the audience: "Ana Pereira (equipe)" for staff, "Você" or
  // "O estabelecimento" for the customer.
  readonly actorLabel: string;
}

// Who ended the booking, when, and why (a reason row only when there is one).
export function BookingTerminationCard({
  kind,
  audience,
  at,
  reason,
  actorLabel,
}: BookingTerminationCardProps): React.JSX.Element {
  const t = useTranslations('booking.detailCards');
  const { formatDate, formatTime } = useFormatting();
  const when = new Date(at);
  const isCancellation = kind === 'cancellation';
  let title = t('cancellationTitle');
  if (!isCancellation) {
    title = audience === 'staff' ? t('rejectionTitleStaff') : t('rejectionTitleCustomer');
  }

  return (
    <BookingDetailSection title={title} testId={`booking-${kind}-card`}>
      <BookingDetailRow label={isCancellation ? t('cancelledByLabel') : t('rejectedByLabel')}>
        {actorLabel}
      </BookingDetailRow>
      <BookingDetailRow label={t('whenLabel')}>
        {t('whenValue', { date: formatDate(when), time: formatTime(when) })}
      </BookingDetailRow>
      {reason !== null && reason.trim() !== '' && (
        <BookingDetailRow label={t('reasonLabel')}>{reason}</BookingDetailRow>
      )}
    </BookingDetailSection>
  );
}
