'use client';

import type { StaffBookingDetailResponse } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getInitials } from '@/lib/utils/initials';

interface BookingClientCardProps {
  readonly booking: StaffBookingDetailResponse;
  readonly showLoyaltyBalance?: boolean;
}

export function BookingClientCard({
  booking,
  showLoyaltyBalance = true,
}: BookingClientCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <section>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('customerSection')}
      </p>
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-blue-600 text-sm font-bold text-white">
              {getInitials(booking.contactName)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-bold text-gray-900">{booking.contactName}</p>
              <Badge
                className={[
                  'border-0 text-[0.6875rem]',
                  booking.type === 'GUEST'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800',
                ].join(' ')}
              >
                {booking.type === 'GUEST' ? t('guestType') : t('customerType')}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">{booking.contactEmail}</p>
            <p className="mt-0.5 text-sm text-gray-500">{booking.contactPhone}</p>
            {showLoyaltyBalance && booking.loyaltyBalance !== null && (
              <p className="mt-1 text-xs font-semibold text-blue-700">
                {t('pointsActive', { count: booking.loyaltyBalance })}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
