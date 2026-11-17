'use client';

import type { CustomerBookingCancellation, CustomerBookingDetailResponse } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { BookingAddressesCard } from '@/features/booking/components/booking-detail/BookingAddressesCard';
import { BookingIntakeCard } from '@/features/booking/components/booking-detail/BookingIntakeCard';
import { BookingItineraryCard } from '@/features/booking/components/booking-detail/BookingItineraryCard';
import { BookingOriginCard } from '@/features/booking/components/booking-detail/BookingOriginCard';
import { BookingParticipantsCard } from '@/features/booking/components/booking-detail/BookingParticipantsCard';
import { appendReturnTo } from '@/features/customer/booking-navigation';
import { BookingResourcesCard } from '@/features/booking/components/booking-detail/BookingResourcesCard';
import { BookingTerminationCard } from '@/features/booking/components/booking-detail/BookingTerminationCard';
import { useCustomerCapabilities } from '../customer-tenant-access-context';

interface CustomerBookingExtrasProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
}

type Translate = ReturnType<typeof useTranslations<'booking.detailCards'>>;

// "Você", "O estabelecimento", or "Sistema" for a request that expired unanswered (TD51).
function cancellationActorLabel(cancellation: CustomerBookingCancellation, t: Translate): string {
  if (cancellation.expired) return t('actorSystem');
  return cancellation.byCustomer ? t('actorYou') : t('actorEstablishment');
}

// Everything the full customer booking detail adds to the shipped cards (M23-S47): what the
// customer gave or was assigned, never internal notes, the creator or a staff name. Each card
// renders nothing when its data is empty. The cancel/reject actor is only "you" or "the business".
export function CustomerBookingExtras({
  booking,
  tenantSlug,
}: CustomerBookingExtrasProps): React.JSX.Element {
  const t = useTranslations('booking.detailCards');
  // The recurring schedule's page is refused while the tenant is suspended, so there is no link.
  const { canManageRecurring } = useCustomerCapabilities();
  const { cancellation, rejection } = booking;

  return (
    <>
      <BookingResourcesCard resources={booking.resources} />
      <BookingItineraryCard itinerary={booking.itinerary} />
      <BookingParticipantsCard
        participantCount={booking.participantCount}
        attendees={booking.attendees}
      />
      <BookingIntakeCard intake={booking.intake} audience="customer" />
      <BookingAddressesCard pickupAddress={booking.pickupAddress} />
      <BookingOriginCard
        recurrenceHref={
          booking.recurringScheduleId === null || !canManageRecurring
            ? null
            : appendReturnTo(
                `/${tenantSlug}/my-account/recurring-schedules/${booking.recurringScheduleId}`,
                `/${tenantSlug}/my-account/bookings/${booking.bookingId}`,
              )
        }
      />
      {cancellation !== null && (
        <BookingTerminationCard
          kind={cancellation.expired ? 'expiry' : 'cancellation'}
          audience="customer"
          at={cancellation.at}
          reason={cancellation.reason}
          actorLabel={cancellationActorLabel(cancellation, t)}
        />
      )}
      {rejection !== null && (
        <BookingTerminationCard
          kind="rejection"
          audience="customer"
          at={rejection.at}
          reason={rejection.reason}
          actorLabel={t('actorEstablishment')}
        />
      )}
    </>
  );
}
