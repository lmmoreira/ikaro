'use client';

import { useTranslations } from 'next-intl';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingDetailRow, BookingDetailSection } from './BookingDetailSection';

interface BookingTerminationCardProps {
  // 'expiry': the system cancelled a request nobody answered (TD51); `reason` is ignored and the
  // card says so itself.
  readonly kind: 'cancellation' | 'rejection' | 'expiry';
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
  const isRejection = kind === 'rejection';
  const isExpiry = kind === 'expiry';
  let title = t('cancellationTitle');
  if (isExpiry) {
    title = t('expiryTitle');
  } else if (isRejection) {
    title = audience === 'staff' ? t('rejectionTitleStaff') : t('rejectionTitleCustomer');
  }
  const shownReason = isExpiry ? t('expiryReason') : reason;

  return (
    <BookingDetailSection title={title} testId={`booking-${kind}-card`}>
      <BookingDetailRow label={isRejection ? t('rejectedByLabel') : t('cancelledByLabel')}>
        {actorLabel}
      </BookingDetailRow>
      <BookingDetailRow label={t('whenLabel')}>
        {t('whenValue', { date: formatDate(when), time: formatTime(when) })}
      </BookingDetailRow>
      {shownReason !== null && shownReason.trim() !== '' && (
        <BookingDetailRow label={t('reasonLabel')}>{shownReason}</BookingDetailRow>
      )}
    </BookingDetailSection>
  );
}
