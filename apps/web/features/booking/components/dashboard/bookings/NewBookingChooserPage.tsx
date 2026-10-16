'use client';

import { useRouter } from 'next/navigation';
import type { StaffBookingRecipient } from '@/features/booking/model/staff-booking-payload';
import { setStaffGuestContact } from '@/features/booking/hooks/useStaffGuestContact';
import { CustomerChooserStep, type StaffBookingKind } from './CustomerChooserStep';

interface NewBookingChooserPageProps {
  readonly phonePrefix: string;
  /** What staff are creating (`?tipo=`): a one-off booking, or a recurring reservation (UC-070). */
  readonly kind: StaffBookingKind;
}

// `/dashboard/bookings/new`: who the booking is for. A registered customer travels to the steps as
// `?customerId=` — to the booking steps, or for a recurrence to its pattern page; a guest's contact
// in memory only (no personal data in a URL). A guest can never have a recurrence, so the chooser
// disables that mode for it and no recurrence ever carries a guest contact.
export function NewBookingChooserPage({
  phonePrefix,
  kind,
}: NewBookingChooserPageProps): React.JSX.Element {
  const router = useRouter();

  function handleContinue(recipient: StaffBookingRecipient): void {
    if (recipient.kind === 'customer') {
      const target =
        kind === 'recorrencia'
          ? '/dashboard/bookings/recurring/new'
          : '/dashboard/bookings/new/booking';
      router.push(`${target}?customerId=${encodeURIComponent(recipient.customerId)}`);
      return;
    }
    setStaffGuestContact({
      contactName: recipient.contactName,
      contactPhone: recipient.contactPhone,
      contactEmail: recipient.contactEmail,
    });
    router.push('/dashboard/bookings/new/booking');
  }

  return (
    <CustomerChooserStep
      kind={kind}
      phonePrefix={phonePrefix}
      onContinue={handleContinue}
      onCancel={() => router.push('/dashboard/bookings')}
    />
  );
}
