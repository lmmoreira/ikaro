'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { appendReturnTo } from '../../booking-navigation';

interface RescheduleActionProps {
  readonly tenantSlug: string;
  readonly bookingId: string;
  readonly eligibleUntil: string;
  readonly returnTo?: string | null;
  /** `button` for the mobile bar, `note` for the page below lg; the pane shows `full`. */
  readonly part?: 'full' | 'button' | 'note';
}

export function RescheduleAction({
  tenantSlug,
  bookingId,
  eligibleUntil,
  returnTo = null,
  part = 'full',
}: RescheduleActionProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const { formatDateLong, formatTime } = useFormatting();
  const deadline = new Date(eligibleUntil);
  const href = appendReturnTo(
    `/${tenantSlug}/my-account/bookings/${bookingId}/reschedule`,
    returnTo,
  );

  const note = (
    <p className="text-xs text-gray-500">
      {t('rescheduleWindowNote', {
        date: formatDateLong(deadline),
        time: formatTime(deadline),
      })}
    </p>
  );
  const button = (
    <Button asChild variant="outline" className="w-full">
      <Link href={href}>{t('rescheduleButton')}</Link>
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
