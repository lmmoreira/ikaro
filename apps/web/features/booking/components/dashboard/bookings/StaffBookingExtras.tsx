'use client';

import type { BookingActorRef, StaffBookingDetailResponse } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { BookingAddressesCard } from '../../booking-detail/BookingAddressesCard';
import { BookingIntakeCard } from '../../booking-detail/BookingIntakeCard';
import { BookingItineraryCard } from '../../booking-detail/BookingItineraryCard';
import { BookingOriginCard } from '../../booking-detail/BookingOriginCard';
import { BookingParticipantsCard } from '../../booking-detail/BookingParticipantsCard';
import { BookingResourcesCard } from '../../booking-detail/BookingResourcesCard';
import { BookingTerminationCard } from '../../booking-detail/BookingTerminationCard';
import { BookingTextCard } from '../../booking-detail/BookingTextCard';

interface StaffBookingExtrasProps {
  readonly booking: StaffBookingDetailResponse;
}

type Translate = ReturnType<typeof useTranslations<'booking.detailCards'>>;

// "Ana Pereira (equipe)" / "João Silva (cliente)" when the backend resolved a name, else the role.
function resolveActorLabel(by: BookingActorRef, t: Translate): string {
  if (by.kind === 'SYSTEM') return t('actorSystem');
  if (by.kind === 'CUSTOMER') {
    return by.name ? t('actorCustomerNamed', { name: by.name }) : t('actorCustomer');
  }
  return by.name ? t('actorStaffNamed', { name: by.name }) : t('actorStaff');
}

// Everything the full staff booking detail adds to the shipped cards (M23-S47). Each card renders
// nothing when its data is empty, so a plain booking looks exactly as it did before.
export function StaffBookingExtras({ booking }: StaffBookingExtrasProps): React.JSX.Element {
  const t = useTranslations('booking.detailCards');
  const { cancellation, rejection } = booking;

  return (
    <>
      <BookingResourcesCard resources={booking.resources} />
      <BookingItineraryCard itinerary={booking.itinerary} />
      <BookingParticipantsCard
        participantCount={booking.participantCount}
        attendees={booking.attendees}
      />
      <BookingIntakeCard intake={booking.intake} audience="staff" />
      <BookingTextCard
        title={t('customerNotesTitle')}
        text={booking.notes}
        testId="booking-customer-notes-card"
      />
      <BookingAddressesCard
        pickupAddress={booking.pickupAddress}
        contactAddress={booking.contactAddress}
      />
      <BookingOriginCard
        requestedAt={booking.createdAt}
        recurrenceHref={
          booking.recurringScheduleId === null
            ? null
            : `/dashboard/bookings/recurring/${booking.recurringScheduleId}`
        }
        createdBy={booking.createdByName === null ? null : { name: booking.createdByName }}
      />
      <BookingTextCard
        title={t('internalNotesTitle')}
        text={booking.adminNotes}
        testId="booking-internal-notes-card"
        note={t('internalNotesNote')}
      />
      {cancellation !== null && (
        <BookingTerminationCard
          kind={cancellation.by.kind === 'SYSTEM' ? 'expiry' : 'cancellation'}
          audience="staff"
          at={cancellation.at}
          reason={cancellation.reason}
          actorLabel={resolveActorLabel(cancellation.by, t)}
        />
      )}
      {rejection !== null && (
        <BookingTerminationCard
          kind="rejection"
          audience="staff"
          at={rejection.at}
          reason={rejection.reason}
          actorLabel={resolveActorLabel(rejection.by, t)}
        />
      )}
    </>
  );
}
