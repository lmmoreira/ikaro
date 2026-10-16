'use client';

import type { CustomerBookingDetailIntake, StaffBookingDetailIntake } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Badge } from '@/shared/components/ui/badge';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingDetailRow, BookingDetailSection } from './BookingDetailSection';

type Translate = ReturnType<typeof useTranslations<'booking.detailCards'>>;

// A boolean answer reads "Sim" / "Não"; a free-text one is shown as written.
function answerText(value: string | boolean, t: Translate): string {
  if (typeof value !== 'boolean') return value;
  return value ? t('answerYes') : t('answerNo');
}

interface BookingIntakeCardProps {
  // The staff shape carries the consent version; the customer shape does not.
  readonly intake: StaffBookingDetailIntake | CustomerBookingDetailIntake | null;
  readonly audience: 'staff' | 'customer';
}

// The answers to the service's intake form, labelled with the version they were given under, and
// the consent. A booking staff created has no consent: staff see "not collected", the customer
// sees no consent row at all.
export function BookingIntakeCard({
  intake,
  audience,
}: BookingIntakeCardProps): React.JSX.Element | null {
  const t = useTranslations('booking.detailCards');
  const { formatDate, formatTime } = useFormatting();
  if (intake === null) return null;

  const consentAt = intake.consentAcceptedAt === null ? null : new Date(intake.consentAcceptedAt);
  const consentVersion = 'consentVersion' in intake ? intake.consentVersion : null;

  return (
    <BookingDetailSection
      title={audience === 'staff' ? t('intakeTitleStaff') : t('intakeTitleCustomer')}
      testId="booking-intake-card"
    >
      {intake.answers.map((answer) => (
        <BookingDetailRow key={answer.fieldKey} label={answer.label}>
          {answerText(answer.value, t)}
        </BookingDetailRow>
      ))}
      {consentAt !== null && (
        <BookingDetailRow label={t('consentLabel')}>
          {t('consentAccepted', { date: formatDate(consentAt), time: formatTime(consentAt) })}
          {audience === 'staff' && consentVersion !== null && (
            <Badge className="ml-2 border-0 bg-gray-100 text-[0.6875rem] font-semibold text-gray-600">
              {t('consentVersion', { version: consentVersion })}
            </Badge>
          )}
        </BookingDetailRow>
      )}
      {consentAt === null && audience === 'staff' && (
        <BookingDetailRow label={t('consentLabel')}>
          {t('consentNotCollected')}
          <Badge className="ml-2 border-0 bg-gray-100 text-[0.6875rem] font-semibold text-gray-600">
            {t('consentNotCollectedTag')}
          </Badge>
        </BookingDetailRow>
      )}
    </BookingDetailSection>
  );
}
