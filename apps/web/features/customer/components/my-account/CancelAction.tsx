'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface CancelActionProps {
  readonly tenantSlug: string;
  readonly bookingId: string;
  readonly status: BookingStatus;
  readonly cancellableUntil: string | null;
  /** `button` for the mobile bar, `note` for the page below lg; the pane shows `full`. */
  readonly part?: 'full' | 'button' | 'note';
}

export function CancelAction({
  tenantSlug,
  bookingId,
  status,
  cancellableUntil,
  part = 'full',
}: CancelActionProps): React.JSX.Element | null {
  const t = useTranslations('customer.bookingDetail');
  const { formatDateLong, formatTime } = useFormatting();
  const cancelHref = `/${tenantSlug}/my-account/bookings/${bookingId}/cancel`;
  const isApproved = status === BOOKING_STATUS.APPROVED;

  const note =
    isApproved && cancellableUntil !== null ? (
      <p className="text-xs text-gray-500">
        {t('cancelWindowNote', {
          date: formatDateLong(new Date(cancellableUntil)),
          time: formatTime(new Date(cancellableUntil)),
        })}
      </p>
    ) : null;
  const button = (
    <Button asChild variant="destructive" className="w-full">
      <Link href={cancelHref}>{isApproved ? t('cancelButton') : t('cancelRequestButton')}</Link>
    </Button>
  );

  if (part === 'note') return note;
  if (part === 'button') return button;
  return (
    <>
      {note}
      {button}
    </>
  );
}
