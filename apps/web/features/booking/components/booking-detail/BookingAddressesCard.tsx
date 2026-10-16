'use client';

import type { Address } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { formatBookingAddress } from '@/features/booking/model/format-booking-address';
import { BookingDetailRow, BookingDetailSection } from './BookingDetailSection';

interface BookingAddressesCardProps {
  readonly pickupAddress: Address | null;
  // Staff only: the customer is not shown their own contact address.
  readonly contactAddress?: Address | null;
}

export function BookingAddressesCard({
  pickupAddress,
  contactAddress = null,
}: BookingAddressesCardProps): React.JSX.Element | null {
  const t = useTranslations('booking.detailCards');
  if (pickupAddress === null && contactAddress === null) return null;

  return (
    <BookingDetailSection title={t('addressesTitle')} testId="booking-addresses-card">
      {pickupAddress !== null && (
        <BookingDetailRow label={t('pickupAddressLabel')}>
          {formatBookingAddress(pickupAddress)}
        </BookingDetailRow>
      )}
      {contactAddress !== null && (
        <BookingDetailRow label={t('contactAddressLabel')}>
          {formatBookingAddress(contactAddress)}
        </BookingDetailRow>
      )}
    </BookingDetailSection>
  );
}
