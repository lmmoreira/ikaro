'use client';

import type { BookingDetailAttendee } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Badge } from '@/shared/components/ui/badge';
import { BookingDetailRow, BookingDetailSection } from './BookingDetailSection';

interface BookingParticipantsCardProps {
  readonly participantCount: number | null;
  readonly attendees: readonly BookingDetailAttendee[];
}

// The reserved capacity and, when the service asks for names, each participant (minors marked).
export function BookingParticipantsCard({
  participantCount,
  attendees,
}: BookingParticipantsCardProps): React.JSX.Element | null {
  const t = useTranslations('booking.detailCards');
  if (participantCount === null && attendees.length === 0) return null;

  return (
    <BookingDetailSection title={t('participantsTitle')} testId="booking-participants-card">
      {participantCount !== null && (
        <BookingDetailRow label={t('participantCountLabel')}>{participantCount}</BookingDetailRow>
      )}
      {attendees.map((attendee, index) => (
        <div
          key={`${attendee.name}-${index}`}
          className="flex items-center justify-between gap-4 py-2.5 text-sm font-semibold text-gray-900"
        >
          <span>{attendee.name}</span>
          {attendee.isMinor && (
            <Badge variant="neutral" size="sm">
              {t('minorTag')}
            </Badge>
          )}
        </div>
      ))}
    </BookingDetailSection>
  );
}
