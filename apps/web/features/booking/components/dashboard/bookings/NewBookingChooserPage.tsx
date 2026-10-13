'use client';

import { useRouter } from 'next/navigation';
import type { StaffBookingRecipient } from '@/features/booking/model/staff-booking-payload';
import { setStaffGuestContact } from '@/features/booking/hooks/useStaffGuestContact';
import { CustomerChooserStep } from './CustomerChooserStep';

interface NewBookingChooserPageProps {
  readonly phonePrefix: string;
}

// `/dashboard/bookings/new`: who the booking is for. A registered customer travels to the steps as
// `?customerId=`; a guest's contact in memory only (no personal data in a URL).
export function NewBookingChooserPage({
  phonePrefix,
}: NewBookingChooserPageProps): React.JSX.Element {
  const router = useRouter();

  function handleContinue(recipient: StaffBookingRecipient): void {
    if (recipient.kind === 'customer') {
      router.push(
        `/dashboard/bookings/new/booking?customerId=${encodeURIComponent(recipient.customerId)}`,
      );
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
      kind="agendamento"
      phonePrefix={phonePrefix}
      onContinue={handleContinue}
      onCancel={() => router.push('/dashboard/bookings')}
    />
  );
}
