'use client';

import type { StaffBookingDetailResponse } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { getInitials } from '@/shared/utils/initials';

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
      <Card>
        <CardContent className="p-4">
          {/* TD57-S12: the heading lives inside the first card, level with the action pane's card. */}
          <p className="mb-3 text-sm font-semibold text-gray-900">{t('customerSection')}</p>
          <div className="flex items-center gap-4">
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
                <p
                  data-testid="booking-loyalty-points-active"
                  className="mt-1 text-xs font-semibold text-blue-700"
                >
                  {t('pointsActive', { count: booking.loyaltyBalance })}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
